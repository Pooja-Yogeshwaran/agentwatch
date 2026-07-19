'use strict';
// Content fingerprinting via k-gram shingling over normalized text.
// A file's fingerprint is the set of its shingle hashes. Matching a payload =
// what fraction of a file's shingles appear in the payload's shingle set.
//
// Design notes / loophole guards:
//  - Files shorter than K collapse to a single "whole-string" shingle so tiny
//    files (e.g. a 20-char .env) still match instead of silently producing an
//    empty fingerprint (which would read as a false clean).
//  - We keep a shingle COUNT and a distinctness guard so trivial/near-empty
//    files are flagged low-confidence rather than matching everything.
const crypto = require('crypto');
const { normalizeForMatch } = require('./normalize');

const DEFAULT_K = 32;

function hashShingle(str) {
  // 8-byte hash keeps the set compact; collision risk is negligible at these sizes.
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

// Build a Set of shingle hashes from already-normalized text.
function shinglesOf(normText, k = DEFAULT_K) {
  const set = new Set();
  if (!normText) return set;
  if (normText.length <= k) {
    set.add(hashShingle(normText));
    return set;
  }
  for (let i = 0; i + k <= normText.length; i++) {
    set.add(hashShingle(normText.slice(i, i + k)));
  }
  return set;
}

/**
 * Fingerprint a file's raw content.
 * @returns {{shingles:Set<string>, count:number, normLength:number,
 *            contentHash:string, tooTrivial:boolean}}
 */
function fingerprintContent(rawText, { k = DEFAULT_K, minShingles = 3 } = {}) {
  const norm = normalizeForMatch(rawText);
  const shingles = shinglesOf(norm, k);
  const contentHash = crypto.createHash('sha256').update(norm).digest('hex');
  return {
    shingles,
    count: shingles.size,
    normLength: norm.length,
    contentHash,
    // Very small/low-diversity files can't be matched with confidence.
    tooTrivial: shingles.size < minShingles,
  };
}

// Build the shingle set of a payload once, to test many file fingerprints against.
function fingerprintPayload(payloadText, { k = DEFAULT_K } = {}) {
  return shinglesOf(normalizeForMatch(payloadText), k);
}

/**
 * Coverage of a file fingerprint within a payload shingle set: fraction of the
 * file's shingles present in the payload. 1.0 = whole file content observed.
 */
function coverage(fileFp, payloadShingles) {
  if (!fileFp || fileFp.count === 0) return 0;
  let hit = 0;
  for (const sh of fileFp.shingles) if (payloadShingles.has(sh)) hit++;
  return hit / fileFp.count;
}

module.exports = { DEFAULT_K, fingerprintContent, fingerprintPayload, shinglesOf, coverage };
