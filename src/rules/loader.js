'use strict';
// Loads declarative rule files (YAML) from the rules/ dir, with an override dir
// so users can add rules without patching code. Compiled regexes are cached.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BUILTIN_DIR = path.join(__dirname, '..', '..', 'rules');

function loadYaml(file, dir = BUILTIN_DIR) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

let _secrets, _endpoints, _agents, _ignoreFormats;

function secretsRules(overrideDir) {
  if (_secrets && !overrideDir) return _secrets;
  const base = loadYaml('secrets.yaml') || { rules: [], entropy: {} };
  const over = overrideDir ? loadYaml('secrets.yaml', overrideDir) : null;
  const rules = [...(base.rules || []), ...((over && over.rules) || [])].map((r) => ({
    ...r,
    _re: safeRegex(r.regex, r.flags || ''),
  })).filter((r) => r._re);
  const out = { rules, entropy: { ...(base.entropy || {}), ...((over && over.entropy) || {}) },
                allowlist: [...((base.allowlist) || []), ...((over && over.allowlist) || [])] };
  if (!overrideDir) _secrets = out;
  return out;
}

function endpoints() {
  if (_endpoints) return _endpoints;
  _endpoints = loadYaml('endpoints.yaml') || { agents: {} };
  return _endpoints;
}

function agents() {
  if (_agents) return _agents;
  _agents = loadYaml('agents.yaml') || { agents: {} };
  return _agents;
}

function ignoreFormats() {
  if (_ignoreFormats) return _ignoreFormats;
  _ignoreFormats = loadYaml('ignore-formats.yaml') || { files: ['.gitignore'] };
  return _ignoreFormats;
}

function safeRegex(src, flags) {
  if (!src) return null;
  let f = flags || '';
  // JS regex has no inline (?i) modifier — translate it to the `i` flag.
  if (src.includes('(?i)')) { src = src.split('(?i)').join(''); if (!f.includes('i')) f += 'i'; }
  if (!f.includes('g')) f += 'g';
  try { return new RegExp(src, f); }
  catch { return null; }
}

module.exports = { secretsRules, endpoints, agents, ignoreFormats, loadYaml, BUILTIN_DIR };
