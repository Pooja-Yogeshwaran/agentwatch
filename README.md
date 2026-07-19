# agentwatch

[![CI](https://github.com/Pooja-Yogeshwaran/agentwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/Pooja-Yogeshwaran/agentwatch/actions/workflows/ci.yml)

**See exactly what your AI coding agent sends off your machine.**

You run agentwatch in front of an AI coding agent. It watches what that agent
transmits and hands you a plain-English report: which of your files left, whether
it touched files you marked private, whether any passwords or keys went out, and
whether it sent more than it told you.

```bash
agentwatch -- claude        # run any coding agent behind it
```

The idea in one line: **run agentwatch, then run your AI. If anything worth
flagging leaves your machine, agentwatch shows you.**

---

## The problem

AI coding agents read files from your project and send them to a company's servers
to get an answer. That's normal — it's how they work.

The catch is that **you're trusting a promise you can't check.** Tools say *"we
only send what's needed," "your code stays private."* You have no way to confirm
it. Verifying it yourself normally takes a security researcher with specialized
tools. agentwatch turns it into one command.

## What it tells you, per run

1. **Did a file I marked private leave?** (anything in `.gitignore`, `.cursorignore`, …)
2. **Did any passwords or API keys leave?**
3. **Did my entire git *history* leave**, not just current files?
4. **The agent said it read 3 files — did 3 files' contents leave, or 400?**

---

## What you can and can't monitor

agentwatch works by launching your agent itself and watching that process. So it
can see anything it **launches**, if that process is a command-line program. Here
is the honest breakdown:

| What you want to watch | Works? | How |
|---|---|---|
| **A CLI agent** — Claude Code CLI, `codex`, `aider`, `grok` | ✅ Yes | `agentwatch -- claude` |
| **A CLI agent inside an editor's terminal** — Zed, VS Code, JetBrains | ✅ Yes | open the editor's built-in terminal, run `agentwatch -- <agent>` there |
| **An editor's own AI panel** — Copilot, Cursor chat, Zed's assistant | ❌ No | that traffic is made by the *editor*, not a process agentwatch launched |
| **A desktop app** — Claude Desktop, ChatGPT app | ⚠️ Not reliably | these are Chromium apps that use their own certificate store; the clean per-process method doesn't apply |
| **A web app** — claude.ai, chatgpt.com in a browser | ❌ Not applicable | a website can't read your local files, so there's nothing to catch |

**In short: agentwatch is for command-line coding agents.** That includes running a
CLI agent inside any editor's terminal. It does not watch an editor's built-in AI,
the desktop apps, or websites — and for websites there's nothing to watch, because
they can't reach your files.

---

## Getting started

Steps 1, 2, and 4 are the same for everyone. The only part that differs by setup is
**step 3 — where you run your agent.**

### Step 1 — Install (once, common)

Install [Node.js](https://nodejs.org) (v18+) and [Git](https://git-scm.com), then:

```bash
git clone https://github.com/Pooja-Yogeshwaran/agentwatch.git
cd agentwatch
npm install
```

### Step 2 — See it work first (optional, 30 sec, no agent or credentials)

```bash
npm run demo
```

Runs a stand-in agent on localhost that reads a gitignored `.env`, sends it, and
uploads a fake git bundle — so you can see a full report ([sample](examples/sample-report.txt))
before pointing agentwatch at a real agent. Nothing leaves your machine.

### Step 3 — Run it on your own agent (this is the part that depends on your setup)

The command is **always the same** — put `agentwatch --` in front of your agent,
run from inside the project you're working on:

```bash
cd C:\path\to\your\project
node C:\path\to\agentwatch\bin\agentwatch -- <your agent>
```

*Where* you run that line depends on how you use AI:

- **A command-line agent** — Claude Code CLI, `codex`, `aider`, `grok`:
  run the line in any terminal. Example: `... -- claude`.
- **An agent inside your editor** — Zed, VS Code, JetBrains, etc.:
  open the editor's **built-in terminal** and run the exact same line there.
- **A desktop app (Claude Desktop, ChatGPT app) or a website (claude.ai):**
  not supported — see [What you can and can't monitor](#what-you-can-and-cant-monitor)
  above for why.

Then use the agent exactly as you normally would.

### Step 4 — See your results (common)

The report prints **in your terminal** when the agent finishes. For a visual view
of every run:

```bash
node C:\path\to\agentwatch\bin\agentwatch dashboard
```

Opens **http://127.0.0.1:7777**. (On Windows you can instead **double-click
`agentwatch-dashboard.cmd`** — no typing.) Use the **"All days"** filter to browse
every past run; click any run to see its details. It's a local *viewer* — it only
shows agents you ran through agentwatch, never your whole machine.

---

## Understanding the output

Whether in the terminal or the dashboard, a run shows the same things.

**The summary — the headline for the run:**

| Line | What it means |
|---|---|
| `traffic intercepted` | Whether agentwatch actually saw the agent's traffic. If **no**, that's *"unable to verify,"* not *"clean."* |
| `files whose CONTENT left` | How many of your local files had their actual contents sent (matched by content, not filename). |
| `ignore-rule violations` | Files you marked private (`.gitignore` etc.) whose contents were sent anyway. |
| `secrets on egress` | Passwords / API keys detected leaving. The value is never stored — only its type and location. |
| `git history left machine` | Whether a git packfile/bundle (your commit history) was sent. |
| `read-vs-send` | Whether the agent sent more files than it reported reading. |

**The four checks**, in order, each list the specific files/findings.

**Destinations — where the bytes went:** each host, the vendor it belongs to
(e.g. `api.anthropic.com → Anthropic / Claude [model]`), request count, and size.
`[model]` = the AI model endpoint; `[telemetry]` = analytics/logging.

**In the dashboard**, each run is a card labeled with the **agent**, the
**project**, and colored badges:
- 🔴 **red** — something was flagged (ignored file sent, secret, git history).
- 🟡 **amber** — *unable to verify* (traffic not intercepted, or a check couldn't run). This is never treated as "clean."
- 🟢 **green** — nothing flagged.

Click a card to see the full detail. Every report leads with **"what this does not
prove"** — because a clean result means *not observed*, never *proven safe*.

---

## A real example (genuine — nothing staged)

We pointed Claude Code at a sample project (which has a gitignored `.env`) and
asked it a normal question — *"what does this project do?"* — with the same file
access it has in everyday use. We did **not** tell it to open the `.env`.

agentwatch reported:
- **3 files' contents left** — the `README`, `package.json`, and `server.js`, the
  files Claude read to answer. None private.
- **0 ignore-rule violations** — the gitignored `.env` was **not** sent. Its
  filename appeared in a directory listing, but agentwatch correctly reported that
  as *"path mentioned only — content NOT observed,"* not a leak.
- **0 secrets.**

So on a normal task, Claude respected the `.env`. Note the precision: agentwatch
didn't cry wolf just because the `.env` *filename* showed up — it only flags a file
when its actual **contents** leave. That distinction is the heart of the tool.

**agentwatch flags genuine behavior — you don't stage anything.** You run it, use
your agent normally, and *if* something worth flagging actually leaves, it turns up
red with the file, the amount, and the destination. (For contrast: when we
explicitly told Claude to *"read all the files,"* it did send the `.env` — because
`.gitignore` is a git setting, not a privacy wall. But that only happened because
we asked. Left alone, the agent's normal run above was clean.)

---

## How it works

agentwatch reads your agent's encrypted (HTTPS) traffic using the same technique as
Charles Proxy, Fiddler, and mitmproxy:

1. It generates a local certificate and tells **only the wrapped agent** to route
   its traffic through agentwatch and trust that certificate.
2. That lets it decrypt a copy, inspect it, and forward it **unchanged** to the
   real server.
3. It **fingerprints your local files** and matches them against the decrypted
   traffic — so "your `.env` left" means its *content* was found in what was sent,
   not just that its name appeared.

It touches **only the one agent you wrap** — not your browser, other apps, or the
rest of your machine. Nothing it sees is sent anywhere or written to disk.

## FAQ

**Does it record everything I do on my computer?**
No. It only sees an agent you explicitly wrap. It is not a background monitor.

**Where do results show up?**
Your terminal after each run, and the dashboard (`http://127.0.0.1:7777`). Both are
local to your machine — there is no website, on purpose.

**Why does a run say "unknown" or "nothing flagged"?**
You wrapped the demo or a non-agent command. Wrap a real agent to see its name,
vendor, and real findings.

## What agentwatch does *not* prove

- **It only sees cooperative traffic.** An agent that pins certificates or opens
  raw sockets can bypass it. It observes what the agent routes through it.
- **"No match" means "not observed," never "did not leave."**
- **If a check can't run, it says "unable to verify" — never "clean."**
- **Observing traffic is not an accusation.** Sending your code is how these agents
  work. agentwatch produces evidence, not verdicts.

## Responsible use

If you test a named product: report findings to the vendor first, report
**observations not intent** ("file X went to Y," never "vendor Z harvests code"),
and publish the limitations alongside any result.

## License

MIT — see [LICENSE](LICENSE). Built on [mockttp](https://github.com/httptoolkit/mockttp);
the analysis layer (content matching, the four checks, the diff engine) is
agentwatch's contribution.
