'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { decompress, parseMultipart, findBase64Blobs } = require('../src/util/decode');
const { inspectBody } = require('../src/capture/inspect');

test('gzip decodes', () => {
  const r = decompress(zlib.gzipSync(Buffer.from('hello world')), 'gzip');
  assert.equal(r.ok, true);
  assert.equal(r.buffer.toString(), 'hello world');
});

test('brotli decodes when supported', () => {
  const r = decompress(zlib.brotliCompressSync(Buffer.from('hi br')), 'br');
  assert.equal(r.ok, true);
  assert.equal(r.buffer.toString(), 'hi br');
});

test('deflate (raw and zlib) decodes', () => {
  assert.equal(decompress(zlib.deflateSync(Buffer.from('a')), 'deflate').buffer.toString(), 'a');
  assert.equal(decompress(zlib.deflateRawSync(Buffer.from('b')), 'deflate').buffer.toString(), 'b');
});

test('unsupported encoding => NOT ok, explicit reason (never silent clean)', () => {
  const r = decompress(Buffer.from('whatever'), 'made-up-encoding');
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported-encoding/);
});

test('multipart splits into parts', () => {
  const body = Buffer.from(
    '--BOUND\r\nContent-Disposition: form-data; name="a"\r\n\r\nvalue-a\r\n' +
    '--BOUND\r\nContent-Disposition: form-data; name="file"\r\n\r\nfile-body-content\r\n--BOUND--\r\n');
  const parts = parseMultipart(body, 'multipart/form-data; boundary=BOUND');
  assert.equal(parts.length, 2);
  assert.equal(parts[1].body.toString(), 'file-body-content');
});

test('base64 blob detection recovers embedded content', () => {
  const secret = 'THIS_IS_A_BASE64_WRAPPED_SECRET_9F3A_padding_padding_padding_padding_1234';
  const b64 = Buffer.from(secret).toString('base64');
  const blobs = findBase64Blobs('prefix ' + b64 + ' suffix');
  assert.ok(blobs.some((b) => b.buffer.toString().includes('9F3A')));
});

test('inspectBody: gzip body yields decoded text', () => {
  const gz = zlib.gzipSync(Buffer.from('{"k":"decoded-value-123"}'));
  const { texts, undecodable } = inspectBody(gz, { 'content-encoding': 'gzip', 'content-type': 'application/json' });
  assert.equal(undecodable.length, 0);
  assert.ok(texts.join('').includes('decoded-value-123'));
});

test('inspectBody: unsupported encoding flags undecodable but keeps raw buffer', () => {
  const { texts, buffers, undecodable } = inspectBody(Buffer.from('rawbytes'), { 'content-encoding': 'zstd-xyz' });
  assert.ok(undecodable.length >= 1);
  assert.equal(texts.length, 0);
  assert.equal(buffers.length, 1); // raw retained for byte-signature scans
});
