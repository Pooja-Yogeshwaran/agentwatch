'use strict';
// Local, read-only dashboard over saved sessions. Binds to 127.0.0.1 only,
// serves a single self-contained page (no external assets, works offline), and
// exposes two JSON endpoints. It never captures traffic or runs agents — it just
// renders the session files agentwatch already wrote.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { page } = require('./page');

// Dashboard reads the GLOBAL store by default so it shows every run across all
// projects. Falls back to a project-local store if one is passed.
function sessionsDir(cwd) {
  if (cwd) return path.join(cwd, '.agentwatch', 'sessions');
  return path.join(os.homedir(), '.agentwatch', 'sessions');
}

function listSessions(cwd) {
  const dir = sessionsDir(cwd);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      out.push(summarize(f, s));
    } catch { /* skip unreadable/corrupt session */ }
  }
  // newest first
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return out;
}

function summarize(file, s) {
  const dests = (s.capture && s.capture.destinations) || [];
  return {
    file,
    startedAt: s.timing && s.timing.startedAt,
    day: (s.timing && s.timing.startedAt || '').slice(0, 10),
    agent: (s.agent && s.agent.name) || 'unknown',
    command: Array.isArray(s.agent && s.agent.command) ? s.agent.command.join(' ') : (s.agent && s.agent.command),
    vendors: [...new Set(dests.map((d) => d.service).filter(Boolean))],
    destinations: dests.map((d) => d.host),
    summary: s.summary || {},
    unverifiable: (s.unverifiable || []).length,
    intercepted: !!(s.summary && s.summary.intercepted),
  };
}

function readSession(cwd, file) {
  // path-traversal guard: only a bare filename inside the sessions dir
  if (!/^[\w.\-:]+\.json$/.test(file)) return null;
  const p = path.join(sessionsDir(cwd), path.basename(file));
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function start(cwd, { port = 7777 } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page());
    } else if (url.pathname === '/api/sessions') {
      json(res, listSessions(cwd));
    } else if (url.pathname === '/api/session') {
      const s = readSession(cwd, url.searchParams.get('file') || '');
      if (!s) { res.writeHead(404); res.end('not found'); return; }
      json(res, s);
    } else {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function json(res, obj) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

module.exports = { start, listSessions, summarize };
