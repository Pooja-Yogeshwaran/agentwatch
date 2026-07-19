'use strict';
// Normalization used before fingerprinting/matching. The goal: make a file's
// content match the SAME content after an agent has embedded it in a payload —
// JSON-escaped, line-number-prefixed, whitespace-reflowed. Applied identically
// to both sides so the comparison is apples-to-apples.

// Undo the common JSON string escapes so \n \t \" \\ \/ \uXXXX become real chars.
function jsonUnescape(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch { return _; }
    })
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
}

// Strip leading line-number / gutter prefixes agents add when presenting files,
// e.g. "     1\tcode", "12| code", "  3: code", "0003  code".
function stripGutters(s) {
  return s
    .split('\n')
    .map((line) => line.replace(/^[ \t]*\d{1,6}[ \t]*[|:\t]?[ \t]?/, ''))
    .join('\n');
}

// Full normalization for matching: unescape, strip gutters, collapse whitespace.
// Whitespace-insensitive so reflow/indent changes don't defeat matching, while
// token boundaries are preserved (runs collapse to a single space, not removed).
function normalizeForMatch(s) {
  if (s == null) return '';
  let t = String(s);
  t = jsonUnescape(t);
  t = stripGutters(t);
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

module.exports = { jsonUnescape, stripGutters, normalizeForMatch };
