'use strict';
// Transport decoding. Every path that cannot fully decode returns an explicit
// `unsupported` reason so callers can mark a body "unable to verify" — this
// module must never silently hand back partial/garbled data as if it were clean.
const zlib = require('zlib');

const hasZstd = typeof zlib.zstdDecompressSync === 'function';
const hasBrotli = typeof zlib.brotliDecompressSync === 'function';

/**
 * Decompress a body per its Content-Encoding header (which may list several,
 * comma-separated, applied in order — we reverse them).
 * @returns {{ok: boolean, buffer: Buffer|null, reason: string|null, note: string|null}}
 */
function decompress(buf, contentEncoding) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf || '');
  const enc = String(contentEncoding || '').trim().toLowerCase();
  if (!enc || enc === 'identity') return { ok: true, buffer: buf, reason: null, note: null };

  // Encodings are applied left-to-right by the sender; decode right-to-left.
  const layers = enc.split(',').map((s) => s.trim()).filter(Boolean).reverse();
  let cur = buf;
  for (const layer of layers) {
    try {
      if (layer === 'gzip' || layer === 'x-gzip') cur = zlib.gunzipSync(cur);
      else if (layer === 'deflate') {
        // Some servers send raw deflate; try zlib then raw.
        try { cur = zlib.inflateSync(cur); } catch { cur = zlib.inflateRawSync(cur); }
      } else if (layer === 'br') {
        if (!hasBrotli) return unsupported('br', buf);
        cur = zlib.brotliDecompressSync(cur);
      } else if (layer === 'zstd') {
        if (!hasZstd) return unsupported('zstd', buf);
        cur = zlib.zstdDecompressSync(cur);
      } else {
        return unsupported(layer, buf);
      }
    } catch (e) {
      return { ok: false, buffer: null, reason: `decode-failed:${layer}:${e.code || e.message}`, note: null };
    }
  }
  return { ok: true, buffer: cur, reason: null, note: null };
}

function unsupported(enc, original) {
  return { ok: false, buffer: null, reason: `unsupported-encoding:${enc}`, note: `raw ${original.length} bytes retained` };
}

/**
 * If the body is multipart/*, split into parts. Returns null if not multipart.
 * @returns {Array<{headers: Object, body: Buffer}>|null}
 */
function parseMultipart(buf, contentType) {
  const ct = String(contentType || '');
  const m = /multipart\/[^;]+;.*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(ct);
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const parts = [];
  let idx = 0;
  const positions = [];
  while ((idx = buf.indexOf(boundary, idx)) !== -1) { positions.push(idx); idx += boundary.length; }
  for (let i = 0; i < positions.length - 1; i++) {
    let start = positions[i] + boundary.length;
    // skip trailing CRLF after boundary
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    const end = positions[i + 1];
    let seg = buf.slice(start, end);
    // split headers / body on the first blank line
    const sep = seg.indexOf('\r\n\r\n');
    let headers = {};
    let body = seg;
    if (sep !== -1) {
      const rawHeaders = seg.slice(0, sep).toString('utf8');
      body = seg.slice(sep + 4);
      // strip trailing CRLF before next boundary
      if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
        body = body.slice(0, body.length - 2);
      }
      for (const line of rawHeaders.split('\r\n')) {
        const c = line.indexOf(':');
        if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
      }
    }
    parts.push({ headers, body });
  }
  return parts;
}

// Find long base64 runs and return decoded buffers (bounded), for detecting
// content/packfiles/secrets that were base64-wrapped inside a JSON payload.
function findBase64Blobs(text, { minLen = 80, maxBlobs = 40, maxDecodedBytes = 8 * 1024 * 1024 } = {}) {
  const out = [];
  const re = /[A-Za-z0-9+/]{80,}={0,2}/g;
  let m;
  while ((m = re.exec(text)) && out.length < maxBlobs) {
    const s = m[0];
    if (s.length < minLen) continue;
    try {
      const dec = Buffer.from(s, 'base64');
      if (dec.length > 8 && dec.length <= maxDecodedBytes) out.push({ offset: m.index, buffer: dec });
    } catch { /* not valid base64; ignore */ }
  }
  return out;
}

module.exports = { decompress, parseMultipart, findBase64Blobs, capabilities: { hasZstd, hasBrotli } };
