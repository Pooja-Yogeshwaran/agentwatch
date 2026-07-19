'use strict';
// Capture recorder. Forwards the child's HTTPS traffic UNMODIFIED (passive tap)
// while decoding a copy for inspection. Records TLS failures / pinning and the
// no-traffic case so the session can honestly say "unable to verify" instead of
// implying a clean result it never observed.
const mockttp = require('mockttp');
// cross-spawn resolves Windows .cmd/.bat shims (npm, codex, claude, …) and
// handles PATHEXT + arg escaping — plain child_process.spawn can't launch those.
const spawn = require('cross-spawn');
const { ensureCa, caEnv } = require('./ca');
const { inspectBody } = require('./inspect');

async function rawBuffer(body) {
  // Prefer the raw (still-encoded) bytes so our own decoder is authoritative and
  // can honestly flag encodings it cannot handle.
  if (body && Buffer.isBuffer(body.buffer)) return { buf: body.buffer, encodingHandledByProxy: false };
  try {
    const d = await body.getDecodedBuffer();
    return { buf: d || Buffer.alloc(0), encodingHandledByProxy: true };
  } catch {
    return { buf: Buffer.alloc(0), encodingHandledByProxy: true };
  }
}

/**
 * Run a wrapped command under capture.
 * @param {string[]} command  argv, e.g. ["claude","-p","hi"]
 * @returns capture result: { requests, seenHosts, tlsErrors, stdout, stderr,
 *          exitCode, intercepted, startedAt, endedAt, proxyUrl, capabilities }
 */
async function runWrapped(command, { onStdout } = {}) {
  const ca = await ensureCa();
  const server = mockttp.getLocal({ https: { cert: ca.cert, key: ca.key } });

  const requests = [];
  const seenHosts = new Set();
  const tlsErrors = [];
  let turn = 0;

  await server.forAnyRequest().thenPassThrough(); // forward unmodified

  await server.on('request', async (req) => {
    try {
      const host = hostOf(req);
      seenHosts.add(host);
      const headers = lower(req.headers);
      const { buf, encodingHandledByProxy } = await rawBuffer(req.body);
      const contentEncoding = encodingHandledByProxy ? '' : (headers['content-encoding'] || '');
      const { texts, buffers, undecodable } = inspectBody(buf, { ...headers, 'content-encoding': contentEncoding });
      requests.push({
        turn: turn++,
        ts: new Date().toISOString(),
        method: req.method,
        destination: host,
        url: req.url,
        contentType: headers['content-type'] || '',
        contentEncoding: headers['content-encoding'] || '',
        bytesOut: buf.length,
        texts,
        buffers,
        undecodable,
      });
    } catch (e) {
      tlsErrors.push({ kind: 'capture-error', message: String(e && e.message || e) });
    }
  });

  // TLS failures (incl. cert pinning / rejection of our CA) => cannot inspect.
  await server.on('tls-client-error', (e) => {
    tlsErrors.push({ kind: 'tls-client-error', host: (e && e.tlsMetadata && e.tlsMetadata.sniHostname) || e.hostname || null });
  });
  await server.on('client-error', (e) => {
    tlsErrors.push({ kind: 'client-error', message: (e && e.error && e.error.message) || null });
  });

  await server.start();
  const proxyUrl = `http://127.0.0.1:${server.port}`;

  const startedAt = new Date().toISOString();
  const env = {
    ...process.env,
    HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl,
    http_proxy: proxyUrl, https_proxy: proxyUrl, all_proxy: proxyUrl,
    NO_PROXY: '', no_proxy: '',
    ...caEnv(ca.certPath),
  };

  const child = spawn(command[0], command.slice(1), { env, shell: false });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; process.stdout.write(d); if (onStdout) onStdout(d); });
  child.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });

  const exitCode = await new Promise((resolve) => {
    child.on('error', (e) => { stderr += `\n[agentwatch] failed to spawn: ${e.message}\n`; resolve(127); });
    child.on('exit', (code) => resolve(code == null ? 1 : code));
  });

  await new Promise((r) => setTimeout(r, 300)); // let in-flight captures settle
  await server.stop();
  const endedAt = new Date().toISOString();

  return {
    command, requests, seenHosts: [...seenHosts], tlsErrors,
    stdout, stderr, exitCode, startedAt, endedAt, proxyUrl,
    intercepted: requests.length > 0,
    env: { os: process.platform, nodeVersion: process.version },
    capabilities: require('../util/decode').capabilities,
  };
}

function hostOf(req) {
  try { return new URL(req.url).hostname; }
  catch { return String((lower(req.headers)['host'] || 'unknown')).split(':')[0]; }
}
function lower(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) out[k.toLowerCase()] = headers[k];
  return out;
}

module.exports = { runWrapped };
