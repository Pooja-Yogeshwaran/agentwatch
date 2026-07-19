'use strict';
// Detection #2: secret detection on egress.
// Pattern rules (gitleaks-style) + Shannon-entropy fallback over outbound text.
//
// REDACTION INVARIANT: the matched secret value NEVER leaves this function. We
// emit rule id, description, destinations, first-seen turn, occurrence count,
// a non-reversible fingerprint (for dedup/diff correlation), and — if provided a
// locator — which local file the value came from. No value, no preview, ever.
const crypto = require('crypto');
const { secretsRules } = require('../rules/loader');
const { normalizeForMatch } = require('../match/normalize');

// Trim wrapping punctuation so a token like "API_KEY=sk-live-..." or trailing
// base64 padding doesn't corrupt the fingerprint / defeat dedup & attribution.
function trimToken(t) { return t.replace(/^[=+/_.\-]+/, '').replace(/[=+/_.\-]+$/, ''); }

function fingerprint(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function shannonBitsPerChar(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let bits = 0;
  for (const c of freq.values()) { const p = c / s.length; bits -= p * Math.log2(p); }
  return bits;
}

function charClasses(s) {
  let n = 0;
  if (/[a-z]/.test(s)) n++;
  if (/[A-Z]/.test(s)) n++;
  if (/[0-9]/.test(s)) n++;
  if (/[^A-Za-z0-9]/.test(s)) n++;
  return n;
}

/**
 * @param requests [{turn, ts, destination, texts:string[]}]
 * @param opts.locateInFiles (value)=>string[]  optional: local files containing value
 * @returns { findings:[...], scanned:int }
 */
function scan(requests, { locateInFiles } = {}) {
  const cfg = secretsRules();
  // Only string allowlist entries of a meaningful length — guards against a
  // stray short/numeric entry suppressing everything that contains that char.
  const allow = (cfg.allowlist || []).filter((s) => typeof s === 'string' && s.length >= 4);
  const byFingerprint = new Map(); // dedup key: ruleId + fingerprint

  const isAllowed = (val) => allow.some((a) => val.includes(a));

  function record(ruleId, description, value, req, offset, kind) {
    if (isAllowed(value)) return;
    const fp = fingerprint(value);
    const key = ruleId + ':' + fp;
    let f = byFingerprint.get(key);
    if (!f) {
      f = {
        ruleId, description, kind,
        fingerprint: fp,
        occurrences: 0,
        destinations: new Set(),
        firstSeen: { turn: req.turn, ts: req.ts, destination: req.destination, offset },
        sourceFiles: locateInFiles ? locateInFiles(value) : [],
        status: 'verified',
      };
      byFingerprint.set(key, f);
    }
    f.occurrences++;
    f.destinations.add(req.destination);
  }

  const ordered = [...requests].sort((a, b) => a.turn - b.turn);
  for (const req of ordered) {
    for (const rawText of req.texts || []) {
      if (!rawText) continue;
      // Normalize first: undo JSON escaping and strip line-number gutters so
      // tokens are clean (fixes fingerprint stability & source attribution).
      const text = normalizeForMatch(rawText);
      // Rule matches
      for (const rule of cfg.rules) {
        rule._re.lastIndex = 0;
        let m;
        while ((m = rule._re.exec(text))) {
          // The secret is the full match unless the rule names a capture group
          // that isolates the value from surrounding context (secretGroup).
          const g = rule.secretGroup;
          const value = (g != null && m[g] != null) ? m[g] : m[0];
          record(rule.id, rule.description, value, req, m.index, 'pattern');
          if (m.index === rule._re.lastIndex) rule._re.lastIndex++; // avoid zero-width loop
        }
      }
      // Entropy fallback for tokens matching no rule.
      if (cfg.entropy && cfg.entropy.enabled) {
        entropyScan(text, cfg.entropy, req, byFingerprint, isAllowed, record);
      }
    }
  }

  const all = [...byFingerprint.values()].map((f) => ({ ...f, destinations: [...f.destinations] }));

  // Split confirmed secrets from high-entropy noise. A pattern match is always a
  // confirmed secret. A bare high-entropy string is only a confirmed secret if it
  // actually came from one of YOUR files (sourceFiles) — otherwise it is almost
  // always a random ID from the agent's own telemetry, not your data. This is the
  // fix for the "hundreds of false-positive secrets on telemetry traffic" problem.
  const confirmed = [];
  const noise = [];
  for (const f of all) {
    if (f.kind === 'pattern' || (f.sourceFiles && f.sourceFiles.length > 0)) confirmed.push(f);
    else noise.push(f);
  }
  confirmed.sort((a, b) => b.occurrences - a.occurrences);

  // Summarize the noise by destination instead of listing every string.
  const byDest = new Map();
  for (const f of noise) {
    for (const d of f.destinations) byDest.set(d, (byDest.get(d) || 0) + 1);
  }
  const highEntropy = {
    count: noise.length,
    byDestination: [...byDest.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count),
  };

  return { findings: confirmed, highEntropy, scanned: ordered.length };
}

function entropyScan(text, cfg, req, byFingerprint, isAllowed, record) {
  const min = cfg.minLength || 20, max = cfg.maxLength || 120;
  // Exclude '=' so an assignment like KEY=value splits at '=' and the entropy
  // token is the value alone — matching the fingerprint a pattern rule records,
  // so the same secret isn't double-reported. Trailing base64 '=' is trimmed.
  const re = new RegExp(`[A-Za-z0-9+/_-]{${min},${max}}`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const tok = trimToken(m[0]);
    if (tok.length < min) continue;
    if (cfg.requireMixedClasses && charClasses(tok) < 3) continue;
    if (shannonBitsPerChar(tok) < (cfg.minEntropyBitsPerChar || 3.5)) continue;
    // Skip if already captured as a pattern match (same fingerprint under any rule).
    const fp = crypto.createHash('sha256').update(tok).digest('hex').slice(0, 12);
    let already = false;
    for (const k of byFingerprint.keys()) if (k.endsWith(':' + fp)) { already = true; break; }
    if (already) continue;
    record('high-entropy-string', 'High-entropy string matching no known pattern', tok, req, m.index, 'entropy');
  }
}

module.exports = { scan, shannonBitsPerChar, charClasses, fingerprint };
