# agentwatch

[![CI](https://github.com/Pooja-Yogeshwaran/agentwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/Pooja-Yogeshwaran/agentwatch/actions/workflows/ci.yml)

**A transparency instrument for AI coding agents.** You prefix whatever agent
you run, and agentwatch captures and inspects what leaves your machine — then
answers *file-level* questions, not byte-count questions:

- Did the contents of a `.gitignore`'d file leave?
- Did credentials leave inside the traffic?
- Did your full Git history leave, not just current files?
- The agent said it read 3 files — did the contents of 3 files leave, or 400?

```
agentwatch -- claude
agentwatch report
agentwatch diff <session-a> <session-b>
```

---

## Read this first: what agentwatch does NOT prove

**Interception is cooperative.** agentwatch works by setting `HTTPS_PROXY` and
injecting a certificate authority into the process you wrap. An agent that wants
to avoid this can: open raw sockets, use DNS-over-HTTPS, pin certificates,
hardcode a bypass, or simply use an HTTP client that ignores proxy environment
variables. **agentwatch only sees traffic the agent cooperatively routes through
it.** During development we found that even a *cooperative* runtime (bare Node.js)
does not honor `HTTPS_PROXY` unless the program opts in — so "nothing captured" is
never reported as "clean."

Consequences, stated plainly:

- **"No match" means "not observed" — never "did not leave."** Content matching
  can be defeated by chunking, truncation, or transformation. A clean result is
  the *absence of evidence*, not evidence of absence.
- **If a check cannot run, the report says "unable to verify," never "clean."**
  Undecodable payloads, unrecognized agent output, cert pinning, or bypassed
  traffic all produce explicit "unable to verify" entries. This is the single
  most important correctness property of the tool.
- **Sending your code is normal.** It is how these agents function. Observing it
  is not an allegation. agentwatch produces *evidence*, not verdicts.
- **Prompt caching distorts volume.** A cached prefix may cross the wire once and
  never again, so byte counts undercount exposure and later "absence" is not
  proof content didn't leave earlier.

agentwatch is a **transparency instrument, not a security tool.** There are no
words like "exfiltration," "threat," or "breach" in its output, by design.

---

## Try it in 30 seconds (no agent or credentials needed)

agentwatch is a **command-line tool** — you run it in a **terminal on your own
computer** (Command Prompt, PowerShell, or Git Bash on Windows; Terminal on
macOS/Linux). It is not a website; the result prints as text in the terminal
right after you run it.

Open a terminal and run these one at a time:

```bash
git clone https://github.com/Pooja-Yogeshwaran/agentwatch.git
cd agentwatch
npm install
npm run demo
```

`npm run demo` runs a stand-in agent that reads a `.gitignore`'d `.env`, sends the
file contents to a local stand-in "model" endpoint, and uploads a fake git
packfile — entirely on localhost, with no real agent, network, or credentials.
**agentwatch prints this report to your terminal** ([full copy here](examples/sample-report.txt)):

```text
SUMMARY
------------------------------------------------------------
  traffic intercepted        : yes
  files whose CONTENT left   : 2
  ignore-rule violations     : 1
  secrets on egress          : 2
  git history left machine   : yes
  read-vs-send               : 2 file(s) sent but not reported as read

[1] IGNORE-FILE VERIFIER  (1 ignored file(s) tracked)
------------------------------------------------------------
  ✗ .env  — content appeared in traffic (100%, high)
      declared in .gitignore; first at turn 0 → 127.0.0.1

[3] GIT HISTORY / PACKFILE  (1)
------------------------------------------------------------
  ✗ packfile v2, 317 objects → 127.0.0.1 (turn 2)

[4] READ-VS-SEND DIVERGENCE
------------------------------------------------------------
  agent reported reading 1 file(s); content of 2 file(s) was observed leaving.
  ✗ sent but NOT reported as read (2):
      .env
      util.js
```

The report is also saved as JSON under `.agentwatch/sessions/`, and you can
re-display it anytime with `node bin/agentwatch report`.

### Running it against a *real* agent

Once the demo makes sense, point it at an actual agent on one of your own
projects. From inside that project's folder, in a terminal:

```bash
# if you installed globally with `npm install -g .`
agentwatch -- claude

# or without installing, using the full path to bin/agentwatch:
node /path/to/agentwatch/bin/agentwatch -- claude
```

Use the task normally; when the agent exits, the report prints in your terminal.

## Seeing all your runs in a UI: the dashboard

Every run is saved, so you can browse your whole history in a local web UI:

```bash
agentwatch dashboard
```

This opens `http://127.0.0.1:7777` in your browser — a read-only dashboard listing
every run grouped by day, with per-run badges (ignore violations, secrets, git
history, files whose content left), vendor labels (Anthropic/Claude, OpenAI, …),
and a click-through detail view. It only *reads* the session files agentwatch
already wrote; it never captures traffic or runs agents, and it binds to
localhost only.

## Stop retyping the prefix: watch mode

```bash
agentwatch watch
```

This drops you into a shell where common agent CLIs (`claude`, `codex`, `grok`,
`cursor-agent`, `gemini`, `aider`) are **auto-wrapped** — just run `claude` and it
is transparently captured, no prefix needed. Type `exit` to leave. Each run flows
into the dashboard.

This is still **opt-in per agent** (only the agents you launch in that shell are
seen) and uses **no system-wide certificate** — it is not a background monitor of
your whole machine. That is a deliberate safety choice: agentwatch can only ever
see the agents you point it at. (A true always-on, system-wide monitor would
require trusting the certificate system-wide, which would let it read *all* your
encrypted traffic — a trade-off this tool does not make.)

## FAQ (please read — it answers the common confusion)

**Does agentwatch record everything I do on my computer?**
No. It only sees an agent run you **explicitly** wrap (`agentwatch -- <agent>`) or
launch inside `agentwatch watch`. It is *not* a background monitor — your browser,
other apps, and any command you didn't wrap are never captured. If your dashboard
is empty or only shows demo runs, that's why: nothing else was routed through it.

**Where do the results show up?**
Two places, both on your own machine: (1) printed in your **terminal** right after
each run, and (2) the **dashboard** (`agentwatch dashboard`) at
`http://127.0.0.1:7777`. There is no public website — the results are sensitive, so
it's local-only on purpose.

**Is `127.0.0.1:7777` correct? Can other people open it?**
Yes, that's correct — `127.0.0.1` means *your own computer* (localhost), and no one
else can open it. Local-only is deliberate.

**How do I see my results every day?**
Work inside `agentwatch watch` (agents are captured automatically), then run
`agentwatch dashboard` whenever you like — it lists every run grouped by day. Only
runs you routed through agentwatch appear.

**Why does a run say "unknown" or "nothing flagged"?**
You wrapped the demo or a non-agent command. Wrap a real agent (e.g.
`agentwatch -- codex` or `agentwatch -- claude`) to see its name, its vendor
(OpenAI / Anthropic / …), and real findings.

## Install

**Prerequisites:** install [Node.js](https://nodejs.org) (v18+) and
[Git](https://git-scm.com) first — they provide the `node`, `npm`, and `git`
commands used below.

```
npm install -g agentwatch
# or run without installing:
npx agentwatch -- <your-agent>
```

Everything (including TLS capture) runs in Node via
[mockttp](https://github.com/httptoolkit/mockttp) — there is no Python or
mitmproxy dependency, which keeps install to a single command on Windows, macOS,
and Linux.

## Usage

```
agentwatch -- <command...>          Wrap and inspect an agent's egress
agentwatch report [session.json]    Render the latest (or a given) session
agentwatch diff <a.json> <b.json>   Diff two sessions (fact-categories first)
agentwatch compare on=<paths> off=<paths>
                                    Compare N runs per condition (privacy toggle)
agentwatch ca [--path|--print|--install|--uninstall]
                                    Manage the local CA (per-process by default)
```

Sessions are written to `./.agentwatch/sessions/`.

## The trust story (why you probably don't need to install a certificate)

To read TLS traffic, agentwatch presents its own certificate to the wrapped
process. The **default and preferred** path injects that certificate into **only
the wrapped process**, via environment variables it already controls:
`NODE_EXTRA_CA_CERTS` (Node), `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` (Python, Go,
curl), `GIT_SSL_CAINFO` (git). **No system trust store is touched, and the trust
dies with the process.** We verified this is sufficient for Node-based agents on
Windows.

If an agent's runtime ignores those variables, `agentwatch ca` prints an
explicit, reversible, one-command system-store install (and its removal). It is
never automatic.

## The four detections

All four sit on a shared **content-matching engine** that fingerprints your local
files (whitespace-normalized, shingled) and matches those fingerprints against
decrypted, decompressed, normalized payloads. Every "file X left" claim means its
**content matched**, not that its path string appeared — those are reported as
separate facts, because a directory listing mentions hundreds of paths whose
contents never leave. Content that is resent every turn is **deduplicated to one
finding with a first-seen turn.**

1. **Ignore-file verifier** — parses `.gitignore`, `.cursorignore`, `.grokignore`,
   `.aiignore`, etc., fingerprints the files behind those boundaries, and reports
   a **violation** when their content is observed leaving. The strongest check:
   you declared the boundary, so there's no judgment call.
2. **Secret detection on egress** — gitleaks-style pattern rules plus Shannon-
   entropy detection over outbound payloads. **Values are never stored or
   displayed** — only the rule id, location, occurrence count, source file, and a
   non-reversible fingerprint (for dedup). A secret resent every turn is one
   finding, not forty.
3. **Packfile / Git-history detector** — detects the `PACK` signature and git
   bundle headers in egress (including inside multipart bodies and after
   decompression / base64). A single unambiguous signal that commit *history*
   left the machine — the larger exposure, since deleted secrets live in history.
4. **Read-vs-send divergence** — parses the agent's self-reported file reads and
   compares them against the files whose *content* was independently observed
   leaving. The only check that tests whether the agent's account of itself is
   accurate. Also the most format-fragile: unrecognized output degrades to
   "unable to verify," never a false clean.

## The session record

Each run produces a versioned JSON record with **two-level accounting**:

- **Level 1 — distinct content that left** (the findings): file-level facts, each
  deduplicated with a first-seen turn. This is where every finding lives.
- **Level 2 — raw transport** (supporting context only): per-destination request
  counts and byte volumes.

Records are normalized (timestamps, ports, ordering) so a `diff` shows behavioral
differences, not format noise. Findings reference paths, types, and fingerprints —
**never raw secret values and never file contents.** This is enforced by a
redaction guard and covered by tests.

## The diff engine and agent nondeterminism

LLM agents are nondeterministic: two runs of the same task legitimately read
different files and make different calls. So a naive per-file diff of two single
runs attributes agent randomness to whatever you changed. agentwatch therefore:

- diffs **fact categories first** (did ignored files leave? did history leave?
  which destinations?), with per-file deltas explicitly labeled as noise-prone;
- supports **N runs per condition** (`compare`), reporting what is *stable across
  runs within a condition* versus what *changed between conditions* — the honest
  way to run the privacy-toggle experiment (same task, setting on vs. off).

## Rules as data

Detection patterns, ignore-file formats, known endpoints, and agent output
parsers are declarative YAML in [`rules/`](rules/). A new pattern next month is a
new rule, not a code change. Drop overrides in your own rules directory.

## Known limitations

1. **Voluntary compliance** — see the top of this README.
2. **The trust story is the adoption barrier** — mitigated by per-process
   injection, not eliminated.
3. **No baseline for "normal" volume** — which is why the checks are file-level
   and contract-based, not threshold-based, and why `diff`/`compare` beat
   absolute numbers.
4. **Payload formats vary** — gzip, brotli, deflate, multipart, and base64 are
   handled; anything undecodable (e.g. an unsupported codec, protobuf/gRPC) is
   reported as "could not inspect," never silently passed.
5. **Content matching can miss** — report confidence is shown; "no match" is
   phrased as "not observed."
6. **Agents are nondeterministic** — addressed structurally by the diff engine.
7. **Reports go stale** — every record prominently stamps agent and tool version.
8. **Never a false clean** — if a detection cannot run, the report says so.

## Responsible use

If you use agentwatch to compare named vendors:

- Report findings to the vendor first, with reasonable time to respond, before
  publication.
- Report **observations, never intent**: "File X appeared in traffic to Y," not
  "vendor Z harvests your code."
- Publish limitations alongside any result.

## License

MIT. See [LICENSE](LICENSE).

## Prior art

The capture layer builds on [mockttp](https://github.com/httptoolkit/mockttp)
(the engine behind HTTP Toolkit), which solves per-process interception and
certificate injection. mitmproxy solves the same capture problem in Python. The
**analysis layer** — content matching, the four file-level detections, the
session model, and the nondeterminism-aware diff — is agentwatch's contribution.
