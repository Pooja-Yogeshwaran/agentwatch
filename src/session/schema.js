'use strict';
// Session record schema helpers: version constant, diff-normalization, and a
// redaction guard used both at save time and in tests to PROVE no secret value
// or file content is ever serialized.

const SCHEMA_VERSION = 1;

// Produce a copy with all run-to-run format noise neutralized, so a diff of two
// sessions shows behavioral differences, not timestamps/ports/ordering.
function normalizeForDiff(session) {
  const s = JSON.parse(JSON.stringify(session));
  s.timing = { startedAt: '<ts>', endedAt: '<ts>' };
  if (s.env) { s.env.hostname = '<host>'; s.env.node = '<node>'; }
  if (s.tool) s.tool.version = '<ver>';
  stripField(s, 'ts', '<ts>');
  stripField(s, 'proxyUrl', '<proxy>');
  // ports appear inside proxyUrl only; destinations are hosts (no port).
  sortDeep(s);
  return s;
}

function stripField(obj, key, val) {
  if (Array.isArray(obj)) { for (const x of obj) stripField(x, key, val); return; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === key) obj[k] = val;
      else stripField(obj[k], key, val);
    }
  }
}

function sortDeep(obj) {
  if (Array.isArray(obj)) {
    for (const x of obj) sortDeep(x);
    obj.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) sortDeep(obj[k]);
  }
}

// Redaction guard: throws if any forbidden literal (a secret value / file content
// sample) appears anywhere in the serialized record. Used as a hard gate on save.
function assertNoLiterals(session, forbiddenLiterals = []) {
  const blob = JSON.stringify(session);
  const leaked = [];
  for (const lit of forbiddenLiterals) {
    if (lit && lit.length >= 6 && blob.includes(lit)) leaked.push(lit.slice(0, 6) + '…');
  }
  if (leaked.length) {
    throw new Error(`Redaction guard tripped: forbidden literal(s) found in session record: ${leaked.join(', ')}`);
  }
  return true;
}

module.exports = { SCHEMA_VERSION, normalizeForDiff, assertNoLiterals };
