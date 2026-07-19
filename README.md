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

## How to use it — step by step

### 1. Install (one time)

Install [Node.js](https://nodejs.org) (v18+) and [Git](https://git-scm.com), then:

```bash
git clone https://github.com/Pooja-Yogeshwaran/agentwatch.git
cd agentwatch
npm install
```

### 2. Run your agent behind agentwatch

Go to the project you want to work in, and put `agentwatch --` in front of however
you'd normally start your agent:

```bash
cd C:\path\to\your\project
node C:\path\to\agentwatch\bin\agentwatch -- claude
```

Use the agent exactly as you normally would. Everything it sends is watched.

> Running a CLI agent **inside your editor**? Same thing — open the editor's
> terminal (Zed, VS Code, …) and run the line above there.

### 3. Read the result

When the agent finishes, the report prints **in your terminal**. To see it as a
visual dashboard across all your runs:

```bash
node C:\path\to\agentwatch\bin\agentwatch dashboard
```

This opens **http://127.0.0.1:7777** in your browser. (On Windows you can instead
**double-click `agentwatch-dashboard.cmd`** — no typing.) The dashboard shows every
run you've done, on your machine only — it is a *viewer*, not a system monitor; it
only ever shows the agents you ran through agentwatch.

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

## A real example (a test we ran on purpose)

To show what a real finding looks like, we deliberately pointed Claude Code at a
sample project (with a gitignored `.env`) and told it: *"read the files and
summarize this project."*

agentwatch reported that the **`.env` contents went to `api.anthropic.com`** — a
100% content match — along with the fake keys inside it.

**The honest reading:** this is *not* "Claude secretly steals your `.env`." We
**told** it to read the files, and `.env` is a file. It did what it was asked.

**The genuinely useful lesson:** **`.gitignore` is not a privacy boundary for AI
agents.** It's a *git* setting — it does nothing to stop an agent from reading and
sending a file. If you don't want a file reaching a model, gitignore alone won't
protect it. That's the kind of true, non-accusatory thing agentwatch surfaces:
**you run it, and it tells you what actually happened — you decide what it means.**

---

## Try it in 30 seconds (no agent or credentials)

```bash
npm run demo
```

Runs a stand-in agent that reads a gitignored `.env`, sends it to a local endpoint,
and uploads a fake git bundle — all on localhost. agentwatch catches every bit and
prints the report ([full sample](examples/sample-report.txt)). It's a safe way to
see the output before pointing it at a real agent.

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
