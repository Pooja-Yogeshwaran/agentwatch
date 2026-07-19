#!/usr/bin/env bash
# Double-click (or run) to open the agentwatch dashboard in your browser.
# On macOS you may need: chmod +x agentwatch-dashboard.sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js is required: https://nodejs.org"; exit 1; }
[ -d node_modules ] || { echo "First-time setup: installing dependencies..."; npm install; }
echo "Starting the agentwatch dashboard - your browser will open shortly."
echo "Keep this window open while you use it. Press Ctrl+C to stop."
node bin/agentwatch dashboard
