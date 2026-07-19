# Agent Watcher

[![CI](https://github.com/Pooja-Yogeshwaran/agentwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/Pooja-Yogeshwaran/agentwatch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**See exactly what your AI coding agent sends off your machine.**

*(Run it with the `agentwatch` command.)*

Modern AI coding agents — Claude Code, Cursor, Codex, and others — read files from
your project and send them to a company's servers to do their work. That's normal;
it's how they function. The catch is that you're trusting their word about *what*
they send.

That word isn't always reliable. In 2026, analysis of one "local-first" coding
agent found it quietly uploading **entire tracked repositories — git history
included** — regardless of which files it actually used, and even with its privacy
setting switched off. A tracked `.env` full of real API keys went out in plain
sight. Catching something like that normally takes a security researcher with
specialized tooling. Almost nobody else can.

**agentwatch makes it one command.** You run your agent behind it, and it tells you,
in plain English, exactly what left your machine.

```bash
agentwatch -- claude
```

## What it tells you

For any single run of an agent:

- **Did a private file leave?** — anything in `.gitignore`, `.cursorignore`, etc.
- **Did any secrets leave?** — API keys, passwords, tokens.
- **Did your git *history* leave** — not just the current files?
- **Did it send more than it admitted to reading?**

## Install

Requires [Node.js](https://nodejs.org) 18+ and [Git](https://git-scm.com).

```bash
git clone https://github.com/Pooja-Yogeshwaran/agentwatch.git
cd agentwatch
npm install
```

## Quick start

**1. See it work first** — optional, no agent or credentials needed:

```bash
npm run demo
```

A stand-in agent runs entirely on localhost — it reads a gitignored `.env`, sends
it, and uploads a fake git bundle — so you can see a full report before pointing
agentwatch at anything real.

**2. Run your own agent** — put `agentwatch --` in front of it, from inside the
project you're working on:

```bash
cd path/to/your/project
node path/to/agentwatch/bin/agentwatch -- claude
```

Use the agent exactly as you normally would. (Works the same in your editor — just
run that line in the editor's built-in terminal.)

**3. See your results.** The report prints in your terminal when the agent
finishes. For the visual dashboard of every run you've done:

- **Windows:** double-click **`agentwatch-dashboard.cmd`** — your browser opens the
  dashboard automatically.
- **macOS / Linux:** run **`./agentwatch-dashboard.sh`**.

## What you can monitor

agentwatch watches a command-line agent that it launches. That covers CLI agents
run anywhere — including inside your editor's terminal.

| How you use AI | agentwatch |
|---|---|
| A CLI agent — Claude Code CLI, `codex`, `aider`, `grok` | ✅ Supported |
| A CLI agent in your editor's terminal — Zed, VS Code, JetBrains | ✅ Supported |
| Your editor's built-in AI panel — Copilot, Cursor chat, Zed assistant | Out of scope |
| A desktop app — Claude Desktop, ChatGPT | Out of scope |
| A website — claude.ai, chatgpt.com | Out of scope |

*Out of scope* means agentwatch can't watch it: an editor's own AI and desktop apps
make their traffic themselves (not through a process agentwatch started), and a
website can't reach your local files in the first place — so there's nothing to
watch there.

## Understanding the output

Every run — in the terminal or the dashboard — reports the same things, color-coded
by how much they matter:

- 🔴 **Red — needs attention:** a private/gitignored file, a secret, or git history
  left the machine.
- 🟡 **Amber — unable to verify:** a check couldn't run (e.g. traffic wasn't
  intercepted). Never treated as "clean."
- 🔵 **Blue — informational:** files whose content left as part of normal work.
  Context, not an alarm.
- 🟢 **Green — clean:** nothing flagged.

A run shows a summary line, then the details: which files' content left, ignore-rule
violations, secrets, git history, read-vs-send, and the destinations — each host
labeled with the vendor it belongs to (e.g. `api.anthropic.com → Anthropic / Claude`).

## Example

We ran Claude Code on a small project and asked it a normal question — *"what does
this project do?"* agentwatch showed the files Claude read to answer, and confirmed
it did **not** send the gitignored `.env`: the filename appeared in a directory
listing, but its *contents* never left. (agentwatch flags a file only when its
actual bytes are sent — not when its name merely shows up.)

<!-- Screenshot goes here. Save it as docs/screenshot.png, then replace this comment with:
![agentwatch dashboard showing a real Claude Code run](docs/screenshot.png) -->

## How it works

agentwatch reads your agent's encrypted (HTTPS) traffic using the same technique as
Charles Proxy, Fiddler, and mitmproxy:

1. It generates a local certificate and tells **only the wrapped agent** to route
   its traffic through agentwatch and trust that certificate.
2. That lets it decrypt a copy of the traffic, inspect it, and forward it
   **unchanged** to the real server.
3. It **fingerprints your local files** and matches them against the decrypted
   traffic — so "your `.env` left" means its *content* was found in what was sent,
   not just that its name appeared.

It touches **only the one agent you wrap** — not your browser, other apps, or the
rest of your machine. Nothing it sees is sent anywhere or written to disk.

## Limitations

Being honest about the edges is part of the tool:

- **It only sees cooperative traffic.** An agent that pins certificates or opens raw
  sockets can bypass it. agentwatch observes what the agent routes through it.
- **"No match" means "not observed," never "did not leave."**
- **If a check can't run, it says "unable to verify" — never "clean."**
- **Observing traffic is not an accusation.** Sending your code is how these agents
  work; agentwatch produces evidence, not verdicts.

## Responsible use

If you use agentwatch to test a named product: report findings to the vendor first
with reasonable time to respond, report **observations, not intent** ("file X went
to Y," never "vendor Z harvests your code"), and publish the limitations alongside
any result.

## License

MIT — see [LICENSE](LICENSE). Built on
[mockttp](https://github.com/httptoolkit/mockttp); the analysis layer (content
matching, the four checks, the diff engine) is agentwatch's own.
