'use strict';
// Human-readable rendering of a session record. Deliberately leads with what
// could NOT be verified, then reports observed facts. Uses evidence language
// ("appeared in traffic"), never allegation ("exfiltrated").

function render(session) {
  const L = [];
  const p = (s = '') => L.push(s);
  const S = session.summary || {};

  p('agentwatch session report');
  p('='.repeat(60));
  p(`command      : ${Array.isArray(session.agent.command) ? session.agent.command.join(' ') : session.agent.command}`);
  p(`agent        : ${session.agent.name || 'unknown'}`);
  p(`when         : ${session.timing.startedAt}`);
  p(`tool/os      : agentwatch ${session.tool.version} on ${session.env.os}, node ${session.env.node}`);
  p(`exit code    : ${session.exitCode}`);
  p('');

  // ---- limits first ----
  p('WHAT THIS DOES NOT PROVE');
  p('-'.repeat(60));
  p('  Interception is cooperative: an agent that opens raw sockets, pins');
  p('  certificates, or ignores HTTPS_PROXY can bypass this tool. "No match"');
  p('  means "not observed", never "did not leave". Prompt caching can hide');
  p('  re-sent content in later turns.');
  p('');
  if ((session.unverifiable || []).length) {
    p(`UNABLE TO VERIFY (${session.unverifiable.length}) — these are NOT clean results:`);
    for (const u of dedupeReasons(session.unverifiable)) {
      p(`  • [${u.check}] ${u.reason}${u.destination ? ` (${u.destination})` : ''}`);
    }
    p('');
  }

  // ---- headline ----
  p('SUMMARY');
  p('-'.repeat(60));
  p(`  traffic intercepted        : ${yn(S.intercepted)}`);
  p(`  files whose CONTENT left   : ${S.filesWhoseContentLeft}`);
  p(`  ignore-rule violations     : ${S.ignoreViolations}`);
  p(`  secrets on egress          : ${S.secretsOnEgress}`);
  p(`  git history left machine   : ${yn(S.gitHistoryLeft)}`);
  p(`  read-vs-send               : ${S.readVsSend.status === 'verified'
        ? `${S.readVsSend.undisclosedFilesSent} file(s) sent but not reported as read`
        : 'unable to verify'}`);
  p('');

  // ---- #1 ignore ----
  const ig = session.findings.ignore;
  p(`[1] IGNORE-FILE VERIFIER  (${ig.ignoredFileCount} ignored file(s) tracked)`);
  p('-'.repeat(60));
  if (ig.violations.length === 0) p('  No ignored file had its content observed leaving.');
  for (const v of ig.violations) {
    p(`  ✗ ${v.path}  — content appeared in traffic (${v.coveragePct}%, ${v.confidence})`);
    p(`      declared in ${v.ignoredBy.join(', ')}; first at turn ${v.firstSeen?.turn} → ${v.destinations.join(', ')}`);
  }
  for (const po of ig.pathOnly || []) {
    p(`  ~ ${po.path}  — path mentioned only (content NOT observed) → ${po.destinations.join(', ')}`);
  }
  p('');

  // ---- #2 secrets ----
  const sec = session.findings.secrets.findings;
  p(`[2] SECRETS ON EGRESS  (${sec.length})`);
  p('-'.repeat(60));
  if (sec.length === 0) p('  No credential-shaped strings observed in egress.');
  for (const s of sec) {
    p(`  ✗ ${s.ruleId} (${s.kind})  fp:${s.fingerprint}  ×${s.occurrences}`);
    p(`      first at turn ${s.firstSeen?.turn} → ${s.destinations.join(', ')}`
      + (s.sourceFiles && s.sourceFiles.length ? `  [source: ${s.sourceFiles.join(', ')}]` : ''));
  }
  p('  (values are never stored or displayed — type, location, and fingerprint only)');
  p('');

  // ---- #3 git history ----
  const gh = session.findings.gitHistory.findings;
  p(`[3] GIT HISTORY / PACKFILE  (${gh.length})`);
  p('-'.repeat(60));
  if (gh.length === 0) p('  No git packfile or bundle observed in egress.');
  for (const g of gh) {
    p(`  ✗ ${g.kind} v${g.version}${g.objectCount ? `, ${g.objectCount} objects` : ''} → ${g.destination} (turn ${g.firstSeen?.turn})`);
  }
  p('');

  // ---- #4 read vs send ----
  const rvs = session.findings.readVsSend;
  p('[4] READ-VS-SEND DIVERGENCE');
  p('-'.repeat(60));
  if (rvs.status !== 'verified') {
    p(`  unable to verify: ${rvs.reason}`);
    p(`  (content of ${rvs.contentSentCount} file(s) was independently observed leaving)`);
  } else {
    p(`  agent (${rvs.agent}) reported reading ${rvs.claimedReadCount} file(s);`);
    p(`  content of ${rvs.contentSentCount} file(s) was observed leaving.`);
    if (rvs.sentNotClaimed.length) {
      p(`  ✗ sent but NOT reported as read (${rvs.sentNotClaimed.length}):`);
      for (const f of rvs.sentNotClaimed.slice(0, 50)) p(`      ${f}`);
    } else {
      p('  ✓ every file whose content left was among those reported as read.');
    }
    if (rvs.claimedNotSent.length) {
      p(`  · reported read but content not observed (often caching): ${rvs.claimedNotSent.length}`);
    }
  }
  p('');

  // ---- transport (level 2) ----
  p('DESTINATIONS (transport-level, supporting context only)');
  p('-'.repeat(60));
  for (const d of session.capture.destinations) {
    p(`  ${d.host.padEnd(38)} ${String(d.requests).padStart(4)} req  ${fmtBytes(d.bytesOut).padStart(9)}`
      + `${d.isModelHost ? '  [model]' : ''}${d.isTelemetry ? '  [telemetry]' : ''}`);
  }
  p('');
  p('Findings are observations, not allegations. Report issues to the vendor');
  p('before publication; see README "Responsible use".');
  return L.join('\n');
}

function dedupeReasons(list) {
  const seen = new Set();
  const out = [];
  for (const u of list) {
    const k = u.check + '|' + u.reason;
    if (seen.has(k)) continue;
    seen.add(k); out.push(u);
  }
  return out;
}
function yn(b) { return b ? 'yes' : 'no'; }
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

module.exports = { render };
