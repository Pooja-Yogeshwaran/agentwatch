'use strict';
// Detection #3: Git packfile / bundle detector.
// Finding a packfile in egress means commit HISTORY left the machine, not just
// current files — the larger exposure (deleted secrets live in history). We scan
// decoded buffers (incl. multipart parts and base64-decoded blobs) for the PACK
// signature and git-bundle headers. Header parsing yields the object count; we
// do NOT reconstruct the tree (that would mean writing recovered history to disk).
const PACK_SIG = Buffer.from('PACK');
const BUNDLE_V2 = Buffer.from('# v2 git bundle\n');
const BUNDLE_V3 = Buffer.from('# v3 git bundle\n');

function scanBuffer(buf) {
  const hits = [];
  // PACK signature followed by a plausible version (2 or 3) and object count.
  let idx = 0;
  while ((idx = buf.indexOf(PACK_SIG, idx)) !== -1) {
    if (idx + 12 <= buf.length) {
      const version = buf.readUInt32BE(idx + 4);
      if (version === 2 || version === 3) {
        const objectCount = buf.readUInt32BE(idx + 8);
        // sanity: object count shouldn't be absurd relative to remaining bytes.
        if (objectCount > 0 && objectCount < 50_000_000) {
          hits.push({ kind: 'packfile', offset: idx, version, objectCount });
        }
      }
    }
    idx += 4;
  }
  if (buf.indexOf(BUNDLE_V2) === 0 || buf.indexOf(BUNDLE_V3) === 0) {
    hits.push({ kind: 'git-bundle', offset: 0, version: buf.indexOf(BUNDLE_V3) === 0 ? 3 : 2 });
  }
  return hits;
}

/**
 * @param requests [{turn, ts, destination, buffers:Buffer[]}]
 */
function scan(requests) {
  const findings = [];
  const ordered = [...requests].sort((a, b) => a.turn - b.turn);
  for (const req of ordered) {
    for (const buf of req.buffers || []) {
      if (!buf || buf.length < 12) continue;
      for (const hit of scanBuffer(buf)) {
        findings.push({
          ...hit,
          status: 'verified',
          destination: req.destination,
          firstSeen: { turn: req.turn, ts: req.ts, destination: req.destination },
          approxBytes: buf.length,
        });
      }
    }
  }
  // Dedup identical (kind,destination,objectCount) to first occurrence.
  const seen = new Set();
  const deduped = [];
  for (const f of findings) {
    const key = `${f.kind}:${f.destination}:${f.objectCount || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }
  return { findings: deduped };
}

module.exports = { scan, scanBuffer };
