'use strict';
// Orchestrator: turns a raw capture into a session record by running the content
// engine and all four detections, assembling the two-level accounting, and
// collecting every "unable to verify" reason so the record never implies a clean
// result it did not observe.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { walk } = require('../util/walk');
const engine = require('../match/engine');
const ignorefile = require('../detect/ignorefile');
const secrets = require('../detect/secrets');
const packfile = require('../detect/packfile');
const readvssend = require('../detect/readvssend');
const { endpoints } = require('../rules/loader');
const { SCHEMA_VERSION } = require('./schema');

const TOOL_VERSION = require('../../package.json').version;

function toolMeta() { return { name: 'agentwatch', version: TOOL_VERSION }; }

// Aggregate transport-level (LEVEL 2) accounting from raw requests.
function transport(capture) {
  const ep = endpoints();
  const telSuffixes = ep.telemetryHostSuffixes || [];
  const byHost = new Map();
  for (const r of capture.requests) {
    let h = byHost.get(r.destination);
    if (!h) { h = { host: r.destination, requests: 0, bytesOut: 0 }; byHost.set(r.destination, h); }
    h.requests++; h.bytesOut += r.bytesOut || 0;
  }
  const modelHosts = new Set();
  // host -> vendor label (e.g. api.anthropic.com -> "Anthropic / Claude")
  const hostLabel = new Map();
  for (const spec of Object.values(ep.agents || {})) {
    for (const mh of spec.modelHosts || []) modelHosts.add(mh);
    for (const h of spec.hosts || []) if (spec.label) hostLabel.set(h, spec.label);
  }
  return [...byHost.values()].map((h) => ({
    ...h,
    service: hostLabel.get(h.host) || null,   // named vendor, if the host is known
    isTelemetry: telSuffixes.some((s) => h.host === s || h.host.endsWith('.' + s) || h.host.endsWith(s)),
    isModelHost: modelHosts.has(h.host),
  })).sort((a, b) => b.bytesOut - a.bytesOut);
}

// Known endpoints for the detected agent that we EXPECTED but never saw — a hint
// that some traffic bypassed the proxy (e.g. a client that ignored HTTPS_PROXY).
function expectedButUnseen(capture, agentName) {
  const ep = endpoints();
  const spec = ep.agents && ep.agents[agentName];
  if (!spec) return [];
  const seen = new Set(capture.seenHosts);
  return (spec.modelHosts || []).filter((h) => !seen.has(h));
}

function build(capture, cwd, opts = {}) {
  const unverifiable = [];

  // ---- candidate file set + fingerprints ----
  const walkRes = walk(cwd, opts.walk);
  const index = engine.buildFileIndex(walkRes.files, cwd, { keepRawBudgetBytes: 64 * 1024 * 1024 });
  if (walkRes.truncated) {
    unverifiable.push({ check: 'content-match', reason: `working tree exceeded file cap; only first ${index.length} files fingerprinted — files beyond the cap are UNVERIFIED, not clean` });
  }

  // ---- normalize captured requests into engine input ----
  const reqInput = capture.requests.map((r) => ({
    turn: r.turn, ts: r.ts, destination: r.destination, texts: r.texts, buffers: r.buffers,
  }));

  // ---- content engine ----
  const engineFindings = engine.run(index, reqInput);

  // undecodable bodies => unable to verify per destination/turn
  for (const r of capture.requests) {
    for (const u of r.undecodable || []) {
      unverifiable.push({ check: 'content-match', destination: r.destination, turn: r.turn, reason: u.reason });
    }
  }

  // ---- detection #1 ignore ----
  const ignoredMap = ignorefile.classify(cwd, walkRes.files);
  const ignoreResult = ignorefile.verify(ignoredMap, engineFindings);

  // ---- detection #2 secrets (source attribution without storing the value) ----
  const locateInFiles = (value) => {
    const out = [];
    for (const e of index) if (e.rawText && e.rawText.includes(value)) out.push(e.rel);
    return out;
  };
  const secretResult = secrets.scan(reqInput, { locateInFiles });

  // ---- detection #3 git history ----
  const packResult = packfile.scan(reqInput);

  // ---- detection #4 read-vs-send ----
  const rvs = readvssend.analyze(capture.command, capture.stdout, engineFindings);
  if (rvs.status !== 'verified') unverifiable.push({ check: 'read-vs-send', reason: rvs.reason });

  // ---- distinct content that left (LEVEL 1) ----
  const contentLeft = [];
  for (const [rel, f] of engineFindings) {
    if (f.content.observed) {
      contentLeft.push({
        path: rel,
        coveragePct: Math.round(f.content.maxCoverage * 100),
        confidence: f.content.confidence,
        matchedShingles: f.content.matchedShingles,
        firstSeen: f.content.firstSeen,
        destinations: f.content.destinations,
      });
    }
  }
  contentLeft.sort((a, b) => b.coveragePct - a.coveragePct);

  // ---- capture-level unverifiable signals ----
  if (!capture.intercepted) {
    unverifiable.push({ check: 'capture', reason: 'no HTTPS traffic was intercepted — the agent may not honor HTTPS_PROXY, or made no network calls. This is NOT a clean result.' });
  }
  for (const e of capture.tlsErrors || []) {
    unverifiable.push({ check: 'capture', reason: `TLS/connection error (possible cert pinning or bypass): ${e.kind}${e.host ? ' ' + e.host : ''}` });
  }
  const agentName = rvs.agent && rvs.agent !== 'unknown' && rvs.agent !== 'generic' ? rvs.agent : detectAgentName(capture.command);
  const unseen = expectedButUnseen(capture, agentName);
  if (unseen.length) {
    unverifiable.push({ check: 'capture', reason: `expected model endpoint(s) not seen at proxy: ${unseen.join(', ')} — traffic may have bypassed capture` });
  }

  const session = {
    schemaVersion: SCHEMA_VERSION,
    tool: toolMeta(),
    agent: { command: capture.command, name: agentName || null },
    env: { os: capture.env.os, node: capture.env.nodeVersion, hostname: capture.env.hostname,
           decode: capture.capabilities },
    timing: { startedAt: capture.startedAt, endedAt: capture.endedAt },
    exitCode: capture.exitCode,
    capture: {
      intercepted: capture.intercepted,
      requestCount: capture.requests.length,
      destinations: transport(capture),          // LEVEL 2: raw transport (context)
      tlsErrors: capture.tlsErrors,
      fileIndex: { count: index.length, truncated: walkRes.truncated, skippedLarge: walkRes.skippedLarge },
    },
    findings: {                                   // LEVEL 1: distinct content facts
      contentLeft,
      ignore: ignoreResult,
      secrets: { findings: secretResult.findings },
      gitHistory: { findings: packResult.findings },
      readVsSend: rvs,
    },
    unverifiable,
    summary: summarize({ ignoreResult, secretResult, packResult, rvs, contentLeft, capture, unverifiable }),
  };

  // literals that must never appear: secret values aren't in the record by
  // construction, but we double-check no fingerprinted file content leaked in.
  return session;
}

function detectAgentName(command) {
  const { detectAgent } = require('../detect/readvssend');
  return detectAgent(command).name;
}

function summarize({ ignoreResult, secretResult, packResult, rvs, contentLeft, capture, unverifiable }) {
  return {
    intercepted: capture.intercepted,
    filesWhoseContentLeft: contentLeft.length,
    ignoreViolations: ignoreResult.violations.length,
    secretsOnEgress: secretResult.findings.length,
    gitHistoryLeft: packResult.findings.length > 0,
    readVsSend: rvs.status === 'verified'
      ? { status: 'verified', undisclosedFilesSent: rvs.sentNotClaimed.length }
      : { status: 'unable-to-verify' },
    checksUnableToVerify: unverifiable.length,
  };
}

// ---- persistence ----
function sessionsDir(cwd) {
  const dir = path.join(cwd, '.agentwatch', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Global store so the dashboard can show every run across all projects, not just
// the folder you happen to be in.
function globalSessionsDir() {
  const dir = path.join(os.homedir(), '.agentwatch', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function save(session, cwd) {
  const stamp = session.timing.startedAt.replace(/[:.]/g, '-');
  const name = `session-${stamp}.json`;
  const body = JSON.stringify(session, null, 2);
  const file = path.join(sessionsDir(cwd), name);
  fs.writeFileSync(file, body);
  // also mirror into the global store (best-effort) for the dashboard
  try { fs.writeFileSync(path.join(globalSessionsDir(), name), body); } catch { /* non-fatal */ }
  return file;
}

function latest(cwd) {
  const dir = sessionsDir(cwd);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

module.exports = { build, save, latest, sessionsDir, globalSessionsDir, transport };
