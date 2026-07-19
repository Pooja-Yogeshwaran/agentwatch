'use strict';
// agentwatch VS Code / Cursor extension (v1).
// Brings the CLI flow into the IDE: run a coding agent under agentwatch in the
// integrated terminal, open the dashboard, and view the latest report in a panel.
//
// Scope note (honest): this v1 wraps a CLI agent you launch from the IDE. It does
// NOT yet intercept the IDE's own built-in AI (e.g. Copilot/Cursor internals) —
// that is a harder future step tracked in the repo.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

function awCommand() {
  return vscode.workspace.getConfiguration('agentwatch').get('command') || 'agentwatch';
}

function workspaceFolder() {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : process.cwd();
}

async function runInTerminal() {
  const agent = await vscode.window.showInputBox({
    prompt: 'Which agent command should agentwatch wrap?',
    value: 'claude',
    placeHolder: 'e.g. claude, codex -q "fix the bug", grok',
  });
  if (!agent) return;
  const term = vscode.window.createTerminal({ name: 'agentwatch', cwd: workspaceFolder() });
  term.show();
  term.sendText(`${awCommand()} -- ${agent}`);
  vscode.window.showInformationMessage('agentwatch is wrapping your agent. The report prints when it finishes; run "agentwatch: Show last report" to view it here.');
}

function openDashboard() {
  const term = vscode.window.createTerminal({ name: 'agentwatch dashboard', cwd: workspaceFolder() });
  term.show();
  term.sendText(`${awCommand()} dashboard`);
  vscode.window.showInformationMessage('Starting the agentwatch dashboard — it will open in your browser.');
}

function latestSessionFile() {
  const dir = path.join(os.homedir(), '.agentwatch', 'sessions');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch { return null; }
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function showLastReport() {
  const file = latestSessionFile();
  if (!file) {
    vscode.window.showWarningMessage('No agentwatch runs found yet. Run "agentwatch: Run an agent under watch" first.');
    return;
  }
  let session;
  try { session = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { vscode.window.showErrorMessage('Could not read the latest report: ' + e.message); return; }

  const panel = vscode.window.createWebviewPanel('agentwatchReport', 'agentwatch report', vscode.ViewColumn.Beside, {});
  panel.webview.html = renderHtml(session);
}

// Minimal, self-contained HTML rendering of a session (webview has its own CSP).
function renderHtml(s) {
  const f = s.findings || {};
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sum = s.summary || {};
  const ig = (f.ignore && f.ignore.violations) || [];
  const sec = (f.secrets && f.secrets.findings) || [];
  const gh = (f.gitHistory && f.gitHistory.findings) || [];
  const rvs = f.readVsSend || {};
  const dests = (s.capture && s.capture.destinations) || [];
  const row = (label, val) => `<tr><td>${esc(label)}</td><td><b>${esc(val)}</b></td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
 body{font:13px -apple-system,Segoe UI,sans-serif;padding:16px;color:var(--vscode-foreground)}
 h2{font-size:14px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:4px;margin-top:20px}
 .bad{color:#f14c4c}.ok{color:#3fb950}.warn{color:#d29922}
 table{border-collapse:collapse;width:100%}td{padding:3px 8px;border-bottom:1px solid var(--vscode-panel-border)}
 code{background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px}
</style></head><body>
 <h1 style="font-size:16px">agentwatch report</h1>
 <div>${esc(Array.isArray(s.agent && s.agent.command) ? s.agent.command.join(' ') : (s.agent && s.agent.command) || '')}<br>
 <small>${esc(s.timing && s.timing.startedAt)} · agent: ${esc((s.agent && s.agent.name) || 'unknown')}</small></div>
 <h2>Summary</h2><table>
 ${row('traffic intercepted', sum.intercepted ? 'yes' : 'no')}
 ${row('files whose content left', sum.filesWhoseContentLeft)}
 ${row('ignore-rule violations', sum.ignoreViolations)}
 ${row('secrets on egress', sum.secretsOnEgress)}
 ${row('git history left machine', sum.gitHistoryLeft ? 'yes' : 'no')}
 ${row('checks unable to verify', sum.checksUnableToVerify)}
 </table>
 <h2>Ignore-file violations</h2>
 ${ig.length ? ig.map((v) => `<div class="bad">✗ ${esc(v.path)} — ${v.coveragePct}% (${esc(v.confidence)})</div>`).join('') : '<div class="ok">None observed.</div>'}
 <h2>Secrets on egress (${sec.length})</h2>
 ${sec.length ? sec.map((x) => `<div class="bad">✗ ${esc(x.ruleId)} <code>fp:${esc(x.fingerprint)}</code>${x.sourceFiles && x.sourceFiles.length ? ' · source: ' + esc(x.sourceFiles.join(', ')) : ''}</div>`).join('') : '<div class="ok">None observed.</div>'}
 <h2>Git history / packfile (${gh.length})</h2>
 ${gh.length ? gh.map((g) => `<div class="bad">✗ ${esc(g.kind)} v${g.version}${g.objectCount ? ', ' + g.objectCount + ' objects' : ''} → ${esc(g.destination)}</div>`).join('') : '<div class="ok">None observed.</div>'}
 <h2>Read-vs-send</h2>
 ${rvs.status === 'verified'
    ? ((rvs.sentNotClaimed || []).length ? `<div class="bad">✗ sent but not reported as read: ${esc(rvs.sentNotClaimed.join(', '))}</div>` : '<div class="ok">Everything sent was reported as read.</div>')
    : `<div class="warn">unable to verify: ${esc(rvs.reason || '')}</div>`}
 <h2>Destinations</h2><table>${dests.map((d) => `<tr><td>${esc(d.host)}</td><td>${esc(d.service || '—')}</td><td>${d.requests} req</td></tr>`).join('')}</table>
 <p><small>Observations, not allegations. "No match" means "not observed", never "did not leave".</small></p>
</body></html>`;
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentwatch.runInTerminal', runInTerminal),
    vscode.commands.registerCommand('agentwatch.dashboard', openDashboard),
    vscode.commands.registerCommand('agentwatch.showLastReport', showLastReport),
  );
}
function deactivate() {}
module.exports = { activate, deactivate };
