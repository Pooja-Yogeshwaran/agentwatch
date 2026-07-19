# agentwatch — VS Code / Cursor extension

Brings agentwatch into your editor. This is an early v1.

## Commands (open the Command Palette → type "agentwatch")

- **agentwatch: Run an agent under watch** — asks which agent to wrap, then runs
  `agentwatch -- <agent>` in the integrated terminal, in your workspace folder.
- **agentwatch: Open dashboard** — starts the local dashboard and opens it in your
  browser.
- **agentwatch: Show last report** — renders your most recent run in a panel
  beside your code.

## Requirements

Install the agentwatch CLI so the extension can call it:

```
npm install -g agentwatch
```

If it isn't on your `PATH`, set **Settings → agentwatch: Command** to something like
`node /path/to/agentwatch/bin/agentwatch`.

## Scope (honest)

This v1 wraps a **CLI agent you launch from the editor** and shows its report. It
does **not** yet intercept the editor's *own* built-in AI (e.g. Copilot or Cursor's
internal assistant) — that requires routing the extension host's traffic through
the proxy and is a harder step tracked in the main repo. For now, use it with CLI
agents (`claude`, `codex`, `grok`, …) run from the integrated terminal.

## Developing / testing this extension

```
cd extension
# open this folder in VS Code and press F5 to launch an Extension Development Host
# or package it:
npm install -g @vscode/vsce
vsce package        # produces agentwatch-vscode-0.1.0.vsix
```

Then install the `.vsix` via "Extensions: Install from VSIX…".
