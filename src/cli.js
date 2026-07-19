'use strict';
const fs = require('fs');
const path = require('path');
const record = require('./session/record');
const report = require('./session/report');
const diff = require('./diff/engine');
const ca = require('./capture/ca');

const VERSION = require('../package.json').version;

function usage() {
  return `agentwatch ${VERSION} — a transparency instrument for AI coding agents

USAGE
  agentwatch -- <command...>         Wrap and inspect an agent's egress
  agentwatch wrap -- <command...>    (same as above)
  agentwatch report [session.json]   Render latest (or given) session
  agentwatch diff <a.json> <b.json>  Diff two sessions (categories first)
  agentwatch compare <A=glob> <B=glob>
                                     Compare N runs per condition (privacy toggle)
  agentwatch dashboard [--port N]    Open a local UI over all saved runs
  agentwatch watch                   Shell where agents are auto-wrapped (no prefix)
  agentwatch ca --path|--print|--install|--uninstall
                                     Manage the local CA (per-process by default)
  agentwatch version

NOTES
  Interception is cooperative; see the report's "what this does not prove".
  Per-process CA injection is the default — no system trust store is touched.`;
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') { console.log(usage()); return 0; }

  // wrap: "agentwatch -- cmd..." or "agentwatch wrap -- cmd..."
  const dashDash = args.indexOf('--');
  if (args[0] === '--' || args[0] === 'wrap') {
    const cmd = dashDash !== -1 ? args.slice(dashDash + 1) : args.slice(1);
    if (cmd.length === 0) { console.error('error: no command after --'); return 2; }
    return wrap(cmd);
  }

  switch (args[0]) {
    case 'report': return cmdReport(args[1]);
    case 'diff': return cmdDiff(args[1], args[2]);
    case 'compare': return cmdCompare(args.slice(1));
    case 'dashboard': return cmdDashboard(args.slice(1));
    case 'watch': return cmdWatch(args.slice(1));
    case 'ca': return cmdCa(args.slice(1));
    case 'version': case '--version': console.log(VERSION); return 0;
    default:
      console.error(`error: unknown command "${args[0]}"\n`);
      console.log(usage());
      return 2;
  }
}

async function wrap(cmd) {
  const { runWrapped } = require('./capture/proxy');
  const cwd = process.cwd();
  console.error(`[agentwatch] wrapping: ${cmd.join(' ')}`);
  console.error('[agentwatch] per-process CA injected; system trust store untouched.\n');
  const capture = await runWrapped(cmd);
  const session = record.build(capture, cwd);
  const file = record.save(session, cwd);
  console.error(`\n[agentwatch] session saved: ${path.relative(cwd, file)}`);
  console.error('[agentwatch] render it with: agentwatch report\n');
  console.log('\n' + report.render(session));
  return capture.exitCode || 0;
}

function loadSession(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function cmdReport(file) {
  const cwd = process.cwd();
  const target = file || record.latest(cwd);
  if (!target) { console.error('error: no sessions found. Run `agentwatch -- <agent>` first.'); return 2; }
  console.log(report.render(loadSession(target)));
  return 0;
}

function cmdDiff(a, b) {
  if (!a || !b) { console.error('error: usage: agentwatch diff <a.json> <b.json>'); return 2; }
  console.log(diff.render(diff.diffTwo(loadSession(a), loadSession(b))));
  return 0;
}

// compare "on=glob-or-dir" "off=glob-or-dir"
function cmdCompare(parts) {
  if (parts.length < 2) { console.error('error: usage: agentwatch compare <labelA=path...> <labelB=path...>'); return 2; }
  const conds = parts.map(parseCondition);
  const [A, B] = conds;
  console.log(diff.render(diff.compareConditions(A.label, A.sessions, B.label, B.sessions)));
  return 0;
}

function parseCondition(spec) {
  const eq = spec.indexOf('=');
  const label = eq === -1 ? path.basename(spec) : spec.slice(0, eq);
  const src = eq === -1 ? spec : spec.slice(eq + 1);
  const files = [];
  for (const token of src.split(',')) {
    const t = token.trim();
    if (!t) continue;
    const st = fs.existsSync(t) ? fs.statSync(t) : null;
    if (st && st.isDirectory()) {
      for (const f of fs.readdirSync(t)) if (f.endsWith('.json')) files.push(path.join(t, f));
    } else if (st) { files.push(t); }
  }
  if (files.length === 0) throw new Error(`no session files for condition "${label}" (${src})`);
  return { label, sessions: files.map(loadSession) };
}

async function cmdDashboard(flags) {
  const portIdx = flags.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(flags[portIdx + 1], 10) || 7777 : 7777;
  const dash = require('./dashboard/server');
  // Default: global store (all projects). `--here` limits to the current folder.
  const scope = flags.includes('--here') ? process.cwd() : null;
  const { port: actual } = await dash.start(scope, { port });
  const url = `http://127.0.0.1:${actual}`;
  const n = dash.listSessions(scope).length;
  console.error(`[agentwatch] dashboard: ${url}  (${n} run${n === 1 ? '' : 's'}${scope ? ' in this folder' : ' across all projects'})`);
  console.error('[agentwatch] read-only; press Ctrl+C to stop.');
  openBrowser(url);
  return new Promise(() => {}); // keep serving until Ctrl+C
}

function openBrowser(url) {
  try {
    const { spawn } = require('child_process');
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* best-effort */ }
}

// Agent CLI names auto-wrapped inside `agentwatch watch`.
const WATCH_AGENTS = ['claude', 'codex', 'grok', 'cursor-agent', 'gemini', 'aider'];

function cmdWatch() {
  const { spawn } = require('child_process');
  const bin = path.resolve(__dirname, '..', 'bin', 'agentwatch');
  console.error('[agentwatch] watch mode: launching a shell where these agents are auto-wrapped:');
  console.error('   ' + WATCH_AGENTS.join(', '));
  console.error('[agentwatch] run an agent normally (e.g. `claude`) — no prefix needed. `exit` to leave.\n');

  if (process.platform === 'win32') {
    const defs = WATCH_AGENTS.map((a) =>
      `function ${a} { & node "${bin}" -- ${a} @args }`).join('; ');
    const banner = `Write-Host '[agentwatch] watch active — agents are wrapped. Type exit to leave.' -ForegroundColor Cyan`;
    const child = spawn('powershell', ['-NoExit', '-NoLogo', '-Command', `${defs}; ${banner}`], { stdio: 'inherit' });
    return new Promise((res) => child.on('exit', (c) => res(c || 0)));
  }
  // posix: define shell functions via a temp rcfile, then start an interactive shell.
  const os = require('os');
  const rc = path.join(os.tmpdir(), `agentwatch-watch-${process.pid}.sh`);
  const defs = WATCH_AGENTS.map((a) => `${a}(){ node "${bin}" -- ${a} "$@"; }`).join('\n');
  fs.writeFileSync(rc, `[ -f ~/.bashrc ] && . ~/.bashrc\n${defs}\nexport PS1="(agentwatch) $PS1"\necho "[agentwatch] watch active — agents are wrapped. Type exit to leave."\n`);
  const shell = process.env.SHELL || 'bash';
  const child = spawn(shell, ['--rcfile', rc, '-i'], { stdio: 'inherit' });
  return new Promise((res) => child.on('exit', (c) => { try { fs.unlinkSync(rc); } catch {} res(c || 0); }));
}

function cmdCa(flags) {
  return ca.ensureCa().then((c) => {
    if (flags.includes('--path')) { console.log(c.certPath); return 0; }
    if (flags.includes('--print')) { console.log(c.cert); return 0; }
    const cmds = ca.systemStoreCommands(c.certPath);
    if (flags.includes('--install')) {
      console.error('[agentwatch] Per-process injection is preferred and needs NO install.');
      console.error('[agentwatch] Installing to the user trust store anyway:');
      console.error('  ' + cmds.install);
      ca.installSystemStore(c.certPath);
      console.error('[agentwatch] done. Remove later with:\n  ' + cmds.uninstall);
      return 0;
    }
    if (flags.includes('--uninstall')) { console.log('Run:\n  ' + cmds.uninstall); return 0; }
    // default: explain
    console.log(`CA path : ${c.certPath}`);
    console.log('Primary trust path is per-process env injection (no install needed).');
    console.log('\nOptional system-store fallback (only if an agent ignores env vars):');
    console.log('  install  : ' + cmds.install);
    console.log('  uninstall: ' + cmds.uninstall);
    console.log('  ' + cmds.note);
    return 0;
  });
}

module.exports = { main, usage };
