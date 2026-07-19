'use strict';
// Detection #4: read-vs-send divergence.
// Compares the agent's SELF-REPORTED file reads (parsed from its stdout) against
// the files whose CONTENT was independently observed leaving (from the match
// engine — never path mentions). This is the most format-fragile check, so any
// unrecognized output degrades to "unable to verify", never a false clean.
const path = require('path');
const { agents } = require('../rules/loader');

function detectAgent(command) {
  const argv0 = path.basename(String(command[0] || '')).toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  const cfg = agents();
  for (const [name, spec] of Object.entries(cfg.agents || {})) {
    const cmds = (spec.detect && spec.detect.command) || [];
    if (cmds.map((c) => c.toLowerCase()).includes(argv0)) return { name, spec };
  }
  return { name: null, spec: null };
}

function extractClaimedReads(stdout, spec) {
  const cfg = agents();
  const patterns = (spec && spec.readPatterns) || (cfg.generic && cfg.generic.readPatterns) || [];
  const reads = new Set();
  let matchedAny = false;
  for (const pat of patterns) {
    let re;
    try { re = new RegExp(pat, 'g'); } catch { continue; }
    let m;
    while ((m = re.exec(stdout))) {
      matchedAny = true;
      const p = (m[1] || '').trim().replace(/\\/g, '/');
      if (p) reads.add(p);
    }
  }
  return { reads: [...reads], matchedAny };
}

function baseName(p) { return p.replace(/\\/g, '/').split('/').pop().toLowerCase(); }

// Does a claimed read string refer to this engine-tracked rel path?
function claimRefersTo(claim, rel) {
  const c = claim.replace(/\\/g, '/').toLowerCase();
  const r = rel.replace(/\\/g, '/').toLowerCase();
  return r === c || r.endsWith('/' + c) || c.endsWith('/' + r) || baseName(c) === baseName(r);
}

/**
 * @param command argv
 * @param stdout  captured child stdout
 * @param engineFindings Map<rel, finding>
 */
function analyze(command, stdout, engineFindings) {
  const { name, spec } = detectAgent(command);
  const contentSent = [];
  for (const [rel, f] of engineFindings) if (f.content.observed) contentSent.push(rel);

  if (!stdout || !stdout.trim()) {
    return unable(name, contentSent, 'no agent output was captured (agent may write to a session file instead of stdout)');
  }
  const { reads, matchedAny } = extractClaimedReads(stdout, spec);
  if (!matchedAny) {
    return unable(name, contentSent, name
      ? `recognized agent "${name}" but its output format produced no read markers (format may have changed)`
      : 'unrecognized agent output format');
  }

  const sentNotClaimed = contentSent.filter((rel) => !reads.some((c) => claimRefersTo(c, rel)));
  const claimedNotSent = reads.filter((c) => !contentSent.some((rel) => claimRefersTo(c, rel)));

  return {
    status: 'verified',
    agent: name || 'generic',
    claimedReadCount: reads.length,
    contentSentCount: contentSent.length,
    claimedReads: reads,
    contentSent,
    sentNotClaimed,   // content left but not reported as read — the key divergence
    claimedNotSent,   // reported read but content not observed (often prompt caching)
    caveat: 'Prompt caching can hide re-sent content in later turns; "content not observed" is not proof it did not leave.',
  };
}

function unable(name, contentSent, reason) {
  return {
    status: 'unable-to-verify',
    agent: name || 'unknown',
    reason,
    contentSentCount: contentSent.length,
    contentSent,
  };
}

module.exports = { analyze, detectAgent, extractClaimedReads, claimRefersTo };
