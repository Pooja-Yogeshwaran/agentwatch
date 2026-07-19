// A local stand-in for a "model API" so the demo runs anywhere with no network
// and no credentials. Plain HTTP keeps the demo cert-free; a real agent talks
// HTTPS, which agentwatch also intercepts (see the hermetic HTTPS test).
const http = require('http');
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, received: Buffer.concat(chunks).length })); });
});
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(String(server.address().port));
});
