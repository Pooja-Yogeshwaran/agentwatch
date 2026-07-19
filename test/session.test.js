'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const record = require('../src/session/record');
const report = require('../src/session/report');
const { normalizeForDiff, assertNoLiterals } = require('../src/session/schema');
const diff = require('../src/diff/engine');

// Fabricate a capture (no network) exercising the full record pipeline.
function fakeCapture(cwd, requests, extra = {}) {
  return {
    command: extra.command || ['claude', '-p', 'hi'],
    requests,
    seenHosts: [...new Set(requests.map((r) => r.destination))],
    tlsErrors: extra.tlsErrors || [],
    stdout: extra.stdout || 'Read(app.js)\n',
    stderr: '',
    exitCode: 0,
    startedAt: '2026-07-18T00:00:00.000Z',
    endedAt: '2026-07-18T00:00:01.000Z',
    proxyUrl: 'http://127.0.0.1:8001',
    intercepted: requests.length > 0,
    env: { os: 'win32', nodeVersion: 'v22.14.0', hostname: 'test-host' },
    capabilities: { hasZstd: false, hasBrotli: true },
  };
}

function setupRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awrepo-'));
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(dir, '.env'), 'AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz0123456789ABCD\nUNIQUE=body-marker-zxcvbnm-9f3a-qwerty-1234567890');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("hello world this is app dot js unique body 123456")');
  return dir;
}

test('record.build produces two-level accounting and never stores secret value', () => {
  const dir = setupRepo();
  const envBody = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  const requests = [{
    turn: 0, ts: '2026-07-18T00:00:00.500Z', method: 'POST', destination: 'api.anthropic.com',
    url: 'https://api.anthropic.com/v1/messages', contentType: 'application/json', contentEncoding: '',
    bytesOut: 500, texts: [JSON.stringify({ file: envBody })], buffers: [Buffer.from(envBody)], undecodable: [],
  }];
  const session = record.build(fakeCapture(dir, requests), dir);

  // LEVEL 1 findings
  assert.ok(session.findings.contentLeft.some((f) => f.path === '.env'));
  assert.equal(session.findings.ignore.violations[0].path, '.env');
  assert.ok(session.findings.secrets.findings.length >= 1);
  // LEVEL 2 transport present and separate
  assert.ok(session.capture.destinations.some((d) => d.host === 'api.anthropic.com'));
  // Redaction: the actual secret value must not be serialized anywhere.
  const secretVal = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
  assert.ok(!JSON.stringify(session).includes(secretVal), 'secret value leaked into session!');
  assertNoLiterals(session, [secretVal]);
});

test('record: no interception => unable-to-verify, never clean', () => {
  const dir = setupRepo();
  const session = record.build(fakeCapture(dir, []), dir);
  assert.equal(session.capture.intercepted, false);
  assert.ok(session.unverifiable.some((u) => /no HTTPS traffic/.test(u.reason)));
});

test('record: git packfile in egress flagged as history leaving', () => {
  const dir = setupRepo();
  const pack = Buffer.concat([Buffer.from('PACK'), u32(2), u32(42), Buffer.alloc(10)]);
  const requests = [{
    turn: 0, ts: 't', method: 'PUT', destination: 'storage.googleapis.com', url: 'https://storage.googleapis.com/x',
    contentType: 'application/octet-stream', contentEncoding: '', bytesOut: pack.length,
    texts: [], buffers: [pack], undecodable: [],
  }];
  const session = record.build(fakeCapture(dir, requests), dir);
  assert.equal(session.summary.gitHistoryLeft, true);
});

test('report renders and leads with limits', () => {
  const dir = setupRepo();
  const session = record.build(fakeCapture(dir, []), dir);
  const text = report.render(session);
  assert.match(text, /WHAT THIS DOES NOT PROVE/);
  assert.match(text, /UNABLE TO VERIFY/);
});

test('normalizeForDiff neutralizes timestamps/host so format noise does not diff', () => {
  const dir = setupRepo();
  const mk = (ts) => {
    const c = fakeCapture(dir, [{ turn: 0, ts, method: 'POST', destination: 'api.x', url: 'https://api.x/y',
      contentType: '', contentEncoding: '', bytesOut: 1, texts: ['x'], buffers: [], undecodable: [] }]);
    c.startedAt = ts; c.endedAt = ts;
    return record.build(c, dir);
  };
  const a = normalizeForDiff(mk('2026-07-18T00:00:00.000Z'));
  const b = normalizeForDiff(mk('2026-07-19T11:22:33.000Z'));
  assert.deepEqual(a.timing, b.timing);
});

test('diff: category-level and compareConditions stable-vs-volatile', () => {
  const base = (files) => ({
    findings: { contentLeft: files.map((p) => ({ path: p })), ignore: { violations: [] }, secrets: { findings: [] }, gitHistory: { findings: [] } },
    capture: { destinations: [{ host: 'api.x', bytesOut: 10 }] },
    summary: { intercepted: true }, unverifiable: [],
  });
  // condition ON: .env always leaves; condition OFF: never
  const onRuns = [base(['.env', 'a.js']), base(['.env', 'b.js'])]; // a/b volatile, .env stable
  const offRuns = [base(['a.js']), base(['b.js'])];
  const res = diff.compareConditions('on', onRuns, 'off', offRuns);
  assert.ok(res.categories.contentLeft.changedBetweenConditions.onlyA.includes('.env'));
  assert.ok(res.categories.contentLeft.volatileWithin.on.includes('a.js'));
});

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }
