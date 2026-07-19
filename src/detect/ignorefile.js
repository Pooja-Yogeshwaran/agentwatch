'use strict';
// Detection #1: ignore-file verifier.
// The user declared a boundary (.gitignore/.cursorignore/...). We check whether
// files behind that boundary had their CONTENT observed leaving. A content match
// is a violation; a path-only mention is reported as a separate, lower tier.
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');
const { ignoreFormats } = require('../rules/loader');

// One matcher per ignore file so violations can be attributed to the file that
// declared the boundary.
function parseIgnores(cwd) {
  const { files } = ignoreFormats();
  const matchers = [];
  for (const f of files) {
    const p = path.join(cwd, f);
    if (!fs.existsSync(p)) continue;
    let content;
    try { content = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const ig = ignore().add(content);
    matchers.push({ file: f, ig });
  }
  return matchers;
}

// Map each candidate file to the ignore files that match it.
function classify(cwd, relPaths, matchers = parseIgnores(cwd)) {
  const map = new Map();
  for (const rel of relPaths) {
    const hits = [];
    for (const m of matchers) {
      // `ignore` expects posix-relative paths and rejects absolute/`..` paths.
      const norm = rel.replace(/\\/g, '/');
      try { if (m.ig.ignores(norm)) hits.push(m.file); } catch { /* skip unrepresentable */ }
    }
    if (hits.length) map.set(rel, hits);
  }
  return map;
}

/**
 * Produce findings by joining the ignored-file map with the content engine's
 * per-file results.
 * @param ignoredMap Map<rel, string[]>  from classify()
 * @param engineFindings Map<rel, finding> from match/engine.run()
 */
function verify(ignoredMap, engineFindings) {
  const violations = [];
  const pathOnly = [];
  for (const [rel, ignoredBy] of ignoredMap) {
    const f = engineFindings.get(rel);
    if (!f) continue;
    if (f.content.observed) {
      violations.push({
        path: rel, ignoredBy,
        confidence: f.content.confidence,
        coveragePct: Math.round(f.content.maxCoverage * 100),
        firstSeen: f.content.firstSeen,
        destinations: f.content.destinations,
        status: 'verified',
      });
    } else if (f.pathMention.observed) {
      pathOnly.push({
        path: rel, ignoredBy,
        firstSeen: f.pathMention.firstSeen,
        destinations: f.pathMention.destinations,
        note: 'path string appeared but file content was not observed in egress',
      });
    }
  }
  // Strongest first.
  violations.sort((a, b) => b.coveragePct - a.coveragePct);
  return { violations, pathOnly, ignoredFileCount: ignoredMap.size };
}

module.exports = { parseIgnores, classify, verify };
