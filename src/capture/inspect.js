'use strict';
// Turn a raw captured request body into inspectable text/binary segments,
// decoding transport layers. Anything that cannot be decoded is reported in
// `undecodable` so downstream detections mark it "unable to verify" — a body we
// could not read is NEVER treated as containing nothing.
const { decompress, parseMultipart, findBase64Blobs } = require('../util/decode');

/**
 * @param {Buffer} rawBody
 * @param {Object} headers  lowercased header map
 * @returns {{texts:string[], buffers:Buffer[], undecodable:Array<{reason:string,note?:string}>}}
 */
function inspectBody(rawBody, headers = {}) {
  const texts = [];
  const buffers = [];
  const undecodable = [];
  if (!rawBody || rawBody.length === 0) return { texts, buffers, undecodable };

  const contentEncoding = headers['content-encoding'] || '';
  const contentType = headers['content-type'] || '';

  const dec = decompress(rawBody, contentEncoding);
  if (!dec.ok) {
    // Keep the raw bytes for byte-signature scans (e.g. PACK) but flag that the
    // textual content could not be inspected.
    undecodable.push({ reason: dec.reason, note: dec.note || null });
    buffers.push(rawBody);
    return { texts, buffers, undecodable };
  }

  const body = dec.buffer;
  const parts = parseMultipart(body, contentType);
  if (parts) {
    for (const p of parts) {
      const pdec = decompress(p.body, p.headers['content-encoding'] || '');
      if (!pdec.ok) { undecodable.push({ reason: `part:${pdec.reason}` }); buffers.push(p.body); continue; }
      absorbSegment(pdec.buffer, texts, buffers);
    }
  } else {
    absorbSegment(body, texts, buffers);
  }

  return { texts, buffers, undecodable };
}

function absorbSegment(buf, texts, buffers) {
  buffers.push(buf);
  const text = buf.toString('utf8');
  texts.push(text);
  // Sub-scan for base64-wrapped content/packfiles/secrets hidden in the payload.
  for (const blob of findBase64Blobs(text)) {
    buffers.push(blob.buffer);
    // Only add decoded text if it looks textual (avoid binary noise in matching).
    if (!blob.buffer.includes(0)) texts.push(blob.buffer.toString('utf8'));
  }
}

module.exports = { inspectBody };
