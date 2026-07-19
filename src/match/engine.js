'use strict';
// The content-matching engine. Given fingerprints of local files and a stream
// of captured requests (in turn order), it produces ONE finding per file that
// distinguishes:
//   - content match  (the file's bytes appeared)  -> the real signal
//   - path mention    (only the path string appeared) -> lower-tier observation
// with dedup to "distinct content, first seen at turn N", never one hit per turn.
const fs = require('fs');
const path = require('path');
const { fingerprintContent, fingerprintPayload } = require('./fingerprint');
const { normalizeForMatch } = require('./normalize');

// k=32 shingles effectively never collide by chance, so even a couple of matched
// shingles means the byte-sequence really appeared. These guard against the two
// failure modes: coincidental single-shingle hits, and rounding partials to clean.
const MIN_MATCHED_SHINGLES = 2;

function classifyConfidence(coverage) {
  if (coverage >= 0.6) return 'high';
  if (coverage >= 0.15) return 'partial';
  return 'trace';
}

// Build a searchable index of local files. `keepRawBudgetBytes` retains file
// text (for secret source-attribution) until the budget is spent, then stops —
// bounding memory while keeping the common case fully attributable.
function buildFileIndex(relPaths, cwd, { keepRawBudgetBytes = 0 } = {}) {
  const index = [];
  let rawBudget = keepRawBudgetBytes;
  for (const rel of relPaths) {
    const abs = path.resolve(cwd, rel);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (!stat.isFile()) continue;
    let raw;
    try { raw = fs.readFileSync(abs); } catch { continue; }
    const isBinary = raw.includes(0);
    const text = raw.toString('utf8');
    const fp = fingerprintContent(text);
    const entry = {
      rel, abs,
      size: stat.size,
      isBinary,
      fp,
      pathNeedles: pathVariants(rel),
    };
    if (!isBinary && rawBudget - text.length >= 0) { entry.rawText = text; rawBudget -= text.length; }
    index.push(entry);
  }
  return index;
}

// Path strings as they might appear in traffic (both slash styles, basename).
function pathVariants(rel) {
  const fwd = rel.replace(/\\/g, '/');
  const back = fwd.replace(/\//g, '\\');
  const base = fwd.split('/').pop();
  return Array.from(new Set([fwd, back, base])).filter(Boolean).map((s) => s.toLowerCase());
}

function matchedCount(fileFp, payloadShingles) {
  let hit = 0;
  for (const sh of fileFp.shingles) if (payloadShingles.has(sh)) hit++;
  return hit;
}

/**
 * @param index  from buildFileIndex
 * @param requests [{turn, destination, ts, texts: string[]}]  texts = decoded
 *        inspectable segments already extracted from the request (body, parts,
 *        base64 blobs). Passing raw+decoded text here keeps the engine pure.
 * @returns Map<rel, finding>
 */
function run(index, requests) {
  const findings = new Map();
  for (const f of index) {
    findings.set(f.rel, {
      path: f.rel,
      isBinary: f.isBinary,
      tooTrivial: f.fp.tooTrivial,
      contentHash: f.fp.contentHash,
      content: { observed: false, maxCoverage: 0, matchedShingles: 0, confidence: null,
                 firstSeen: null, destinations: new Set() },
      pathMention: { observed: false, firstSeen: null, destinations: new Set() },
    });
  }

  // requests must be processed in turn order for first-seen to be meaningful.
  const ordered = [...requests].sort((a, b) => (a.turn - b.turn) || 0);

  for (const req of ordered) {
    const joined = (req.texts || []).join('\n');
    if (!joined) continue;
    const payloadShingles = fingerprintPayload(joined);
    const payloadNormLower = normalizeForMatch(joined).toLowerCase();
    const rawLower = joined.toLowerCase();

    for (const f of index) {
      const finding = findings.get(f.rel);

      // ---- content match ----
      if (!f.fp.tooTrivial || f.fp.count > 0) {
        const matched = matchedCount(f.fp, payloadShingles);
        const cov = f.fp.count ? matched / f.fp.count : 0;
        const isObserved = matched >= MIN_MATCHED_SHINGLES || (f.fp.count <= 2 && matched >= 1);
        if (isObserved) {
          if (cov > finding.content.maxCoverage) {
            finding.content.maxCoverage = cov;
            finding.content.matchedShingles = matched;
          }
          finding.content.observed = true;
          finding.content.confidence = classifyConfidence(finding.content.maxCoverage);
          finding.content.destinations.add(req.destination);
          if (finding.content.firstSeen == null) {
            finding.content.firstSeen = { turn: req.turn, ts: req.ts, destination: req.destination };
          }
        }
      }

      // ---- path mention (separate, lower tier; never counts as content) ----
      const mentioned = f.pathNeedles.some((n) => n.length >= 3 && (payloadNormLower.includes(n) || rawLower.includes(n)));
      if (mentioned) {
        finding.pathMention.observed = true;
        finding.pathMention.destinations.add(req.destination);
        if (finding.pathMention.firstSeen == null) {
          finding.pathMention.firstSeen = { turn: req.turn, ts: req.ts, destination: req.destination };
        }
      }
    }
  }

  // freeze destination sets to arrays
  for (const finding of findings.values()) {
    finding.content.destinations = [...finding.content.destinations];
    finding.pathMention.destinations = [...finding.pathMention.destinations];
  }
  return findings;
}

module.exports = { buildFileIndex, run, pathVariants, classifyConfidence, MIN_MATCHED_SHINGLES };
