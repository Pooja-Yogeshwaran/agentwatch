'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const secrets = require('../src/detect/secrets');
const packfile = require('../src/detect/packfile');
const ignorefile = require('../src/detect/ignorefile');
const readvssend = require('../src/detect/readvssend');
const engine = require('../src/match/engine');

// ---------- secrets ----------
test('secrets: detects AWS key + PEM + generic assignment, dedups, NEVER stores value', () => {
  const value = 'AKIAABCDEFGHIJKLMNOP';
  const reqs = [
    { turn: 0, ts: 't0', destination: 'api.x', texts: [`{"k":"${value}"}`] },
    { turn: 1, ts: 't1', destination: 'api.x', texts: [`resent: ${value}`] }, // same secret again
    { turn: 2, ts: 't2', destination: 'api.x', texts: ['-----BEGIN RSA PRIVATE KEY-----'] },
  ];
  const { findings } = secrets.scan(reqs);
  const aws = findings.find((f) => f.ruleId === 'aws-access-key-id');
  assert.ok(aws, 'AWS key detected');
  assert.equal(aws.occurrences, 2, 'deduped across turns with occurrence count');
  assert.equal(aws.firstSeen.turn, 0, 'first-seen earliest turn');
  assert.ok(findings.some((f) => f.ruleId === 'private-key-block'));
  // Redaction: the raw secret value must appear NOWHERE in the findings.
  assert.ok(!JSON.stringify(findings).includes(value), 'secret value must not be stored');
});

test('secrets: allowlisted example key is suppressed', () => {
  const { findings } = secrets.scan([{ turn: 0, ts: 't', destination: 'd', texts: ['AKIAIOSFODNN7EXAMPLE'] }]);
  assert.ok(!findings.some((f) => f.fingerprint && f.ruleId === 'aws-access-key-id' && f.occurrences), 'example key allowlisted');
});

test('secrets: source attribution without storing value', () => {
  const value = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const locateInFiles = (v) => (v === value ? ['.env'] : []);
  const { findings } = secrets.scan([{ turn: 0, ts: 't', destination: 'd', texts: [value] }], { locateInFiles });
  const f = findings.find((x) => x.ruleId === 'github-pat');
  assert.deepEqual(f.sourceFiles, ['.env']);
});

test('secrets: high-entropy string NOT from your files is noise, not a counted secret', () => {
  // e.g. a telemetry session id — high entropy but not your data.
  const tok = 'Zx9Qw3Rt7Yp2Lk8Nm4Vb6Cd0Fg1Hj5';
  const r = secrets.scan([{ turn: 0, ts: 't', destination: 'telemetry.example', texts: [`sessionId=${tok}`] }]);
  assert.equal(r.findings.length, 0, 'not counted as a confirmed secret');
  assert.ok(r.highEntropy.count >= 1, 'surfaced separately as high-entropy noise');
  assert.ok(r.highEntropy.byDestination.some((d) => d.host === 'telemetry.example'));
});

test('secrets: high-entropy string that DID come from your files is a secret', () => {
  const tok = 'Zx9Qw3Rt7Yp2Lk8Nm4Vb6Cd0Fg1Hj5';
  const locateInFiles = (v) => (v === tok ? ['.env'] : []);
  const r = secrets.scan([{ turn: 0, ts: 't', destination: 'api', texts: [`sessionId=${tok}`] }], { locateInFiles });
  assert.ok(r.findings.some((f) => f.kind === 'entropy' && f.sourceFiles.includes('.env')));
});

// ---------- packfile ----------
test('packfile: detects PACK signature with object count', () => {
  const buf = Buffer.concat([Buffer.from('PACK'), u32(2), u32(1234), Buffer.alloc(20)]);
  const { findings } = packfile.scan([{ turn: 0, ts: 't', destination: 'gcs', buffers: [buf] }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].objectCount, 1234);
  assert.equal(findings[0].version, 2);
});

test('packfile: git bundle header detected', () => {
  const buf = Buffer.from('# v2 git bundle\n<rest>');
  const { findings } = packfile.scan([{ turn: 0, ts: 't', destination: 'd', buffers: [buf] }]);
  assert.ok(findings.some((f) => f.kind === 'git-bundle'));
});

test('packfile: random text containing PACK is NOT a false positive', () => {
  const buf = Buffer.from('the word PACK appears but not as a real packfile header at all');
  const { findings } = packfile.scan([{ turn: 0, ts: 't', destination: 'd', buffers: [buf] }]);
  assert.equal(findings.length, 0);
});

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }

// ---------- ignore verifier ----------
test('ignore: content match on ignored file => violation; path-only => lower tier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awig-'));
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\nsecrets/\n');
  const envBody = 'SUPER_SECRET_TOKEN=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-unique-body';
  fs.writeFileSync(path.join(dir, '.env'), envBody);
  fs.mkdirSync(path.join(dir, 'secrets'));
  fs.writeFileSync(path.join(dir, 'secrets', 'k.txt'), 'another-unique-secret-file-body-1234567890-qwertyuiop');

  const files = ['.env', 'secrets/k.txt'];
  const index = engine.buildFileIndex(files, dir);
  // .env content leaves; secrets/k.txt only path-mentioned
  const findings = engine.run(index, [
    { turn: 0, ts: 't', destination: 'api', texts: [`body: ${envBody}`] },
    { turn: 1, ts: 't', destination: 'api', texts: ['listing includes secrets/k.txt'] },
  ]);
  const ignoredMap = ignorefile.classify(dir, files);
  const res = ignorefile.verify(ignoredMap, findings);
  assert.equal(res.violations.length, 1);
  assert.equal(res.violations[0].path, '.env');
  assert.ok(res.pathOnly.some((p) => p.path === 'secrets/k.txt'));
});

// ---------- read vs send ----------
test('readvssend: unknown format => unable-to-verify, never false clean', () => {
  const findings = new Map([['a.js', { content: { observed: true } }]]);
  const r = readvssend.analyze(['mystery-agent'], 'some output with no read markers here', findings);
  assert.equal(r.status, 'unable-to-verify');
  assert.equal(r.contentSentCount, 1);
});

test('readvssend: detects file sent but not reported as read', () => {
  const findings = new Map([
    ['src/read-me.js', { content: { observed: true } }],
    ['src/secret.js', { content: { observed: true } }],
  ]);
  const stdout = 'Read(src/read-me.js)\nDid some work.';
  const r = readvssend.analyze(['claude'], stdout, findings);
  assert.equal(r.status, 'verified');
  assert.deepEqual(r.sentNotClaimed, ['src/secret.js']);
});
