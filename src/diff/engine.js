'use strict';
// Diff engine. LLM agents are nondeterministic, so a naive per-run file diff
// attributes agent randomness to whatever changed. We therefore diff FACT
// CATEGORIES first, expose per-file detail second (explicitly labeled as
// run-to-run-noise-prone), and support N runs per condition so we can separate
// "stable within a condition" from "changed between conditions".

function factsOf(session) {
  const f = session.findings || {};
  return {
    intercepted: !!(session.summary && session.summary.intercepted),
    contentLeft: new Set((f.contentLeft || []).map((x) => x.path)),
    ignoreViolations: new Set((f.ignore && f.ignore.violations || []).map((x) => x.path)),
    secrets: new Set((f.secrets && f.secrets.findings || []).map((x) => `${x.ruleId}:${x.fingerprint}`)),
    gitHistory: (f.gitHistory && f.gitHistory.findings || []).length > 0,
    destinations: new Set((session.capture && session.capture.destinations || []).map((d) => d.host)),
    volumes: Object.fromEntries((session.capture && session.capture.destinations || []).map((d) => [d.host, d.bytesOut])),
    unverifiable: (session.unverifiable || []).length,
  };
}

function setDelta(a, b) {
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  return { onlyA, onlyB, changed: onlyA.length > 0 || onlyB.length > 0 };
}

// ---- two-session diff ----
function diffTwo(sessionA, sessionB) {
  const a = factsOf(sessionA), b = factsOf(sessionB);
  return {
    kind: 'two-session',
    categories: {
      intercepted: { a: a.intercepted, b: b.intercepted, changed: a.intercepted !== b.intercepted },
      gitHistory: { a: a.gitHistory, b: b.gitHistory, changed: a.gitHistory !== b.gitHistory },
      ignoreViolations: setDelta(a.ignoreViolations, b.ignoreViolations),
      secrets: setDelta(a.secrets, b.secrets),
      destinations: setDelta(a.destinations, b.destinations),
    },
    perFileContent: setDelta(a.contentLeft, b.contentLeft), // NOISE-PRONE: single-run
    note: 'Per-file content deltas from single runs conflate agent nondeterminism with real change. Use N-runs-per-condition (compareConditions) for claims.',
  };
}

// ---- N-runs-per-condition ----
// A fact is STABLE in a condition if it holds in every run; VOLATILE if in some.
function aggregate(sessions) {
  const facts = sessions.map(factsOf);
  const keys = ['contentLeft', 'ignoreViolations', 'secrets', 'destinations'];
  const stable = {}, volatile = {};
  for (const k of keys) {
    const sets = facts.map((f) => f[k]);
    const union = new Set(sets.flatMap((s) => [...s]));
    const stableSet = new Set([...union].filter((x) => sets.every((s) => s.has(x))));
    stable[k] = stableSet;
    volatile[k] = new Set([...union].filter((x) => !stableSet.has(x)));
  }
  const gitAll = facts.every((f) => f.gitHistory);
  const gitAny = facts.some((f) => f.gitHistory);
  return { n: sessions.length, stable, volatile,
           gitHistory: { stable: gitAll, volatile: gitAny && !gitAll },
           interceptedAll: facts.every((f) => f.intercepted) };
}

function compareConditions(labelA, sessionsA, labelB, sessionsB) {
  const A = aggregate(sessionsA), B = aggregate(sessionsB);
  const cats = {};
  for (const k of ['contentLeft', 'ignoreViolations', 'secrets', 'destinations']) {
    cats[k] = {
      changedBetweenConditions: setDelta(A.stable[k], B.stable[k]),
      volatileWithin: { [labelA]: [...A.volatile[k]], [labelB]: [...B.volatile[k]] },
    };
  }
  return {
    kind: 'conditions',
    conditions: { [labelA]: { runs: A.n, intercepted: A.interceptedAll }, [labelB]: { runs: B.n, intercepted: B.interceptedAll } },
    gitHistory: { [labelA]: A.gitHistory, [labelB]: B.gitHistory },
    categories: cats,
  };
}

// ---- rendering ----
function render(result) {
  const L = [];
  const p = (s = '') => L.push(s);
  if (result.kind === 'two-session') {
    p('agentwatch diff (two sessions)');
    p('='.repeat(60));
    p('FACT CATEGORIES (reliable):');
    p(`  intercepted        : A=${result.categories.intercepted.a} B=${result.categories.intercepted.b} ${chg(result.categories.intercepted.changed)}`);
    p(`  git history left   : A=${result.categories.gitHistory.a} B=${result.categories.gitHistory.b} ${chg(result.categories.gitHistory.changed)}`);
    renderSet(p, 'ignore violations', result.categories.ignoreViolations);
    renderSet(p, 'secrets (rule:fp)', result.categories.secrets);
    renderSet(p, 'destinations', result.categories.destinations);
    p('');
    p('PER-FILE CONTENT (⚠ single-run: mixes real change with agent randomness):');
    renderSet(p, 'content-left', result.perFileContent);
    p('');
    p(result.note);
  } else {
    const [la, lb] = Object.keys(result.conditions);
    p('agentwatch compare (N runs per condition)');
    p('='.repeat(60));
    p(`  ${la}: ${result.conditions[la].runs} run(s), intercepted-all=${result.conditions[la].intercepted}`);
    p(`  ${lb}: ${result.conditions[lb].runs} run(s), intercepted-all=${result.conditions[lb].intercepted}`);
    p('');
    p(`git history left machine: ${la}=${result.gitHistory[la].stable ? 'always' : result.gitHistory[la].volatile ? 'some runs' : 'never'}`
      + ` | ${lb}=${result.gitHistory[lb].stable ? 'always' : result.gitHistory[lb].volatile ? 'some runs' : 'never'}`);
    for (const [k, v] of Object.entries(result.categories)) {
      p('');
      p(`${k}:`);
      const d = v.changedBetweenConditions;
      if (!d.changed) p(`  stable set identical across conditions`);
      if (d.onlyA.length) p(`  only-stable-in-${la}: ${d.onlyA.join(', ')}`);
      if (d.onlyB.length) p(`  only-stable-in-${lb}: ${d.onlyB.join(', ')}`);
      const va = v.volatileWithin[la], vb = v.volatileWithin[lb];
      if (va.length) p(`  ⚠ volatile within ${la} (run-to-run noise): ${va.join(', ')}`);
      if (vb.length) p(`  ⚠ volatile within ${lb} (run-to-run noise): ${vb.join(', ')}`);
    }
    p('');
    p('Facts "stable" (present in every run of a condition) carry the signal;');
    p('"volatile" facts are agent nondeterminism, not condition effects.');
  }
  return L.join('\n');
}

function renderSet(p, label, delta) {
  if (!delta.changed) { p(`  ${label}: (same)`); return; }
  if (delta.onlyA.length) p(`  ${label}: only in A → ${delta.onlyA.join(', ')}`);
  if (delta.onlyB.length) p(`  ${label}: only in B → ${delta.onlyB.join(', ')}`);
}
function chg(b) { return b ? '  <-- CHANGED' : ''; }

module.exports = { factsOf, diffTwo, compareConditions, aggregate, render };
