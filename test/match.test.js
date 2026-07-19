'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const engine = require('../src/match/engine');
const { normalizeForMatch } = require('../src/match/normalize');
const { fingerprintContent, fingerprintPayload, coverage } = require('../src/match/fingerprint');

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-'));
  fs.writeFileSync(path.join(dir, name), content);
  return { dir, rel: name };
}

test('content matches despite JSON escaping + line-number gutters', () => {
  const secret = 'API_KEY=sk-live-abcdef1234567890\nDB_PASSWORD=hunter2-super-long-password-here\nHOST=db.internal.example';
  const { dir, rel } = tmpFile('secret.env', secret);
  const index = engine.buildFileIndex([rel], dir);
  // Same content embedded as an agent would: JSON-escaped, line-numbered.
  const embedded = JSON.stringify({ content: secret.split('\n').map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n') });
  const findings = engine.run(index, [{ turn: 0, ts: 't', destination: 'api.example', texts: [embedded] }]);
  const f = findings.get(rel);
  assert.equal(f.content.observed, true);
  assert.ok(f.content.maxCoverage > 0.9, `coverage ${f.content.maxCoverage}`);
  assert.equal(f.content.confidence, 'high');
});

test('truncated content reported as PARTIAL, never rounded to clean', () => {
  const full = 'line-one-aaaaaaaaaaaaaaaaaaaa\nline-two-bbbbbbbbbbbbbbbbbbbb\nline-three-cccccccccccccccccccc\nline-four-dddddddddddddddddddd';
  const { dir, rel } = tmpFile('f.txt', full);
  const index = engine.buildFileIndex([rel], dir);
  const partial = full.split('\n').slice(0, 2).join('\n'); // half
  const findings = engine.run(index, [{ turn: 0, ts: 't', destination: 'd', texts: [partial] }]);
  const f = findings.get(rel);
  assert.equal(f.content.observed, true);
  assert.ok(f.content.maxCoverage > 0.2 && f.content.maxCoverage < 0.9, `partial ${f.content.maxCoverage}`);
  assert.equal(f.content.confidence, 'partial');
});

test('path mention WITHOUT content is not a content match', () => {
  const content = 'this-is-the-unique-file-body-xyzzy-1234567890-abcdefghij and more text here to shingle';
  const { dir, rel } = tmpFile('config.yaml', content);
  const index = engine.buildFileIndex([rel], dir);
  // payload mentions the path but NOT the content (e.g. a directory listing)
  const findings = engine.run(index, [{ turn: 0, ts: 't', destination: 'd', texts: ['files: config.yaml, other.txt'] }]);
  const f = findings.get(rel);
  assert.equal(f.content.observed, false, 'content must NOT be observed');
  assert.equal(f.pathMention.observed, true, 'path mention must be observed separately');
});

test('dedup: content across 3 turns => one finding, first-seen = earliest', () => {
  const content = 'unique-payload-body-for-dedup-test-9f3a-qwertyuiop-asdfghjkl-zxcvbnm-0123456789';
  const { dir, rel } = tmpFile('a.txt', content);
  const index = engine.buildFileIndex([rel], dir);
  const req = (turn) => ({ turn, ts: 't' + turn, destination: 'd', texts: [content] });
  const findings = engine.run(index, [req(5), req(3), req(7)]);
  const f = findings.get(rel);
  assert.equal(f.content.firstSeen.turn, 3, 'first-seen must be earliest turn');
});

test('tiny file still fingerprints (no empty/false-clean fingerprint)', () => {
  const fp = fingerprintContent('KEY=x');
  assert.ok(fp.count >= 1);
});

test('coverage is 0 for unrelated payloads', () => {
  const fp = fingerprintContent('completely-unrelated-content-aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const pay = fingerprintPayload('totally different text with nothing in common whatsoever bbbb');
  assert.equal(coverage(fp, pay), 0);
});

test('normalize undoes \\n and strips gutters consistently', () => {
  const raw = 'foo bar\nbaz qux';
  const embedded = '     1\\tfoo bar\\n     2\\tbaz qux';
  assert.equal(normalizeForMatch(raw), normalizeForMatch(embedded));
});
