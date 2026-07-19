// One-command demo: `npm run demo` (or `node examples/run-demo.js`).
// Starts a local stand-in "model API", runs agentwatch wrapping a mock agent
// inside the demo repo, and prints the report. No real agent, network, or
// credentials involved — everything runs on localhost.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');

const root = path.join(__dirname, '..');
const demoRepo = path.join(__dirname, 'demo-repo');

// The demo's .env is intentionally gitignored (it's the boundary being tested),
// so it isn't in the repo. Generate it here with obviously-fake values so a
// fresh clone works and no fake secret is ever committed.
const envPath = path.join(demoRepo, '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath,
    'API_KEY=demo1234-fake-key-do-not-use-000abc\n' +
    'DB_PASSWORD=demo-fake-password-hunter2-supersecret-xyz\n');
}

// 1. Start the local echo "model" server and learn its port.
const echo = spawn(process.execPath, [path.join(__dirname, 'echo-server.js')], { stdio: ['ignore', 'pipe', 'inherit'] });
let port = '';
echo.stdout.on('data', (d) => { port += d; });

echo.stdout.once('data', () => {
  const target = `http://127.0.0.1:${port.trim()}`;
  console.log('\n=== agentwatch demo ===');
  console.log('A mock agent will read a gitignored .env, send file contents to a');
  console.log('local "model" endpoint, and upload a fake git packfile. Watch what');
  console.log('agentwatch reports.\n');

  // 2. Run the real CLI, wrapping the mock agent, from inside the demo repo.
  const res = spawnSync(process.execPath, [
    path.join(root, 'bin', 'agentwatch'), '--',
    process.execPath, path.join(__dirname, 'mock-agent.js'),
  ], {
    cwd: demoRepo,
    stdio: 'inherit',
    env: { ...process.env, DEMO_TARGET: target },
  });

  echo.kill();
  process.exit(res.status || 0);
});

setTimeout(() => { if (!port) { console.error('echo server did not start'); echo.kill(); process.exit(1); } }, 5000);
