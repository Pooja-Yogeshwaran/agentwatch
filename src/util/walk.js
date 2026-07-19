'use strict';
// Bounded working-tree walk. Produces the candidate file set that the content
// engine fingerprints. Bounded so a huge tree can't hang the tool — and when a
// bound is hit we return `truncated:true` so the session says "unable to verify
// beyond N files" rather than implying the rest were clean.
const fs = require('fs');
const path = require('path');

const ALWAYS_SKIP = new Set(['.git', '.agentwatch', 'node_modules', '.hg', '.svn']);

function walk(cwd, { maxFiles = 5000, maxFileSize = 2 * 1024 * 1024, skipDirs = ALWAYS_SKIP } = {}) {
  const files = [];
  let truncated = false;
  let skippedLarge = 0;
  const stack = ['.'];
  while (stack.length) {
    const relDir = stack.pop();
    const absDir = path.resolve(cwd, relDir);
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const rel = relDir === '.' ? ent.name : `${relDir}/${ent.name}`;
      if (ent.isDirectory()) {
        if (skipDirs.has(ent.name)) continue;
        stack.push(rel);
      } else if (ent.isFile()) {
        if (files.length >= maxFiles) { truncated = true; continue; }
        let st;
        try { st = fs.statSync(path.resolve(cwd, rel)); } catch { continue; }
        if (st.size > maxFileSize) { skippedLarge++; continue; }
        files.push(rel.replace(/\\/g, '/'));
      }
    }
  }
  return { files, truncated, skippedLarge, note: skipDirs.size ? `skipped dirs: ${[...skipDirs].join(', ')}` : '' };
}

module.exports = { walk, ALWAYS_SKIP };
