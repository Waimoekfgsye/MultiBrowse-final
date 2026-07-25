// ─────────────────────────────────────────────────────────────────────
//  MultiBrowse — zip read/write (zero dependencies)
// ─────────────────────────────────────────────────────────────────────
//  WHY THIS FILE EXISTS
//
//  main.cjs used to lean on two npm packages for zip handling:
//      const extractZip = require('extract-zip');   // wraps yauzl
//      const archiver   = require('archiver');       // wraps zip-stream,
//                                                      // archiver-utils,
//                                                      // readdir-glob...
//
//  In the packaged app this crashed at startup:
//      Error: Cannot find module 'archiver-utils'
//  archiver pulls in a chain of its own dependencies; somewhere between
//  npm's hoisting and electron-builder's dependency walker, one of them
//  (archiver-utils) didn't end up where the packaged app looked for it.
//  Because the require() sat at the top of main.cjs, it ran on startup
//  and took the whole app down before a window ever opened — this repo
//  already hit the exact same failure mode once before with `sharp` and
//  `to-ico` (see iconGen.cjs).
//
//  Rather than debug npm hoisting a second time, this implements just
//  the two operations MultiBrowse actually needs — zip a folder, unzip
//  a folder — directly on top of Node's built-in zlib. Nothing to
//  hoist, nothing to lose track of when packaged, identical behaviour
//  in dev and in the built app on all three platforms.
//
//  Scope: standard (non-Zip64) ZIP, DEFLATE or STORE per entry. That
//  covers every case this app produces or consumes — Camoufox releases
//  are well under the 4GB/65535-entry Zip64 threshold, and so is any
//  profile data directory. Zip64 archives are detected and rejected
//  with a clear error rather than silently mis-read.
// ─────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const deflateRaw = promisify(zlib.deflateRaw);
const inflateRaw = promisify(zlib.inflateRaw);

// ═════════════════════════════════════════════════════════════════════
//  CRC-32 (standard zip/PNG polynomial)
// ═════════════════════════════════════════════════════════════════════

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ═════════════════════════════════════════════════════════════════════
//  DOS date/time — every zip entry needs one
// ═════════════════════════════════════════════════════════════════════

function toDosDateTime(date) {
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { dosDate, dosTime };
}

// ═════════════════════════════════════════════════════════════════════
//  WRITER
// ═════════════════════════════════════════════════════════════════════

/**
 * Recursively lists files (not directories) under root, returning paths
 * relative to root with forward slashes (the zip standard, regardless
 * of host OS).
 */
function listFilesRecursive(root, excludeSet) {
  const out = [];
  function walk(dir, relDir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (excludeSet.has(rel)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
      // symlinks are skipped deliberately — profile directories and the
      // Camoufox engine don't contain any we need to preserve, and
      // resolving them correctly cross-platform adds real complexity
      // for zero benefit here.
    }
  }
  walk(root, '');
  return out;
}

/**
 * Zips every file under srcDir into outZipPath, preserving the relative
 * directory structure. Mirrors the one feature the old archiver() call
 * used (excluding a single bookkeeping file) via `exclude`.
 *
 * @param {string} srcDir
 * @param {string} outZipPath
 * @param {{ exclude?: string[] }} [opts]
 */
async function zipDirectory(srcDir, outZipPath, opts = {}) {
  const excludeSet = new Set(opts.exclude || []);
  const files = listFilesRecursive(srcDir, excludeSet);
  if (files.length === 0) throw new Error('No files to zip');

  const chunks = [];
  const centralRecords = [];
  let offset = 0;

  for (const relPath of files) {
    const absPath = path.join(srcDir, ...relPath.split('/'));
    const data = fs.readFileSync(absPath);
    const crc = crc32(data);
    let stat;
    try { stat = fs.statSync(absPath); } catch { stat = null; }
    const { dosDate, dosTime } = toDosDateTime(stat ? stat.mtime : new Date());

    const compressed = await deflateRaw(data, { level: 6 });
    // Only use the compressed form if it's actually smaller — tiny or
    // already-compressed files sometimes grow slightly under deflate.
    const useStore = compressed.length >= data.length;
    const method = useStore ? 0 : 8;
    const payload = useStore ? data : compressed;

    const nameBuf = Buffer.from(relPath, 'utf8');
    const useUtf8Flag = 1 << 11; // general-purpose bit 11: filename is UTF-8

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);           // version needed
    localHeader.writeUInt16LE(useUtf8Flag, 6);  // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    chunks.push(localHeader, nameBuf, payload);

    centralRecords.push({
      nameBuf, method, dosTime, dosDate, crc,
      compSize: payload.length, uncompSize: data.length,
      offset, mode: stat ? stat.mode : 0o100644,
    });
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  for (const rec of centralRecords) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // version made by: unix, 2.0
    central.writeUInt16LE(20, 6);            // version needed
    central.writeUInt16LE(1 << 11, 8);       // flags: UTF-8 name
    central.writeUInt16LE(rec.method, 10);
    central.writeUInt16LE(rec.dosTime, 12);
    central.writeUInt16LE(rec.dosDate, 14);
    central.writeUInt32LE(rec.crc, 16);
    central.writeUInt32LE(rec.compSize, 20);
    central.writeUInt32LE(rec.uncompSize, 24);
    central.writeUInt16LE(rec.nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    // High 16 bits = unix file mode, so extraction can restore the
    // executable bit if it's ever needed; low bits left at 0.
    // `<< 16` on a value with bit 31 set produces a NEGATIVE signed
    // 32-bit int in JS (e.g. mode 0o100644 << 16 overflows past
    // 2^31), and writeUInt32LE rejects negative numbers — `>>> 0`
    // reinterprets those same bits as unsigned before writing.
    central.writeUInt32LE(((rec.mode & 0xffff) << 16) >>> 0, 38);
    central.writeUInt32LE(rec.offset, 42);
    chunks.push(central, rec.nameBuf);
    offset += central.length + rec.nameBuf.length;
  }
  const centralSize = offset - centralStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);  // disk number
  eocd.writeUInt16LE(0, 6);  // disk with central dir
  eocd.writeUInt16LE(centralRecords.length, 8);
  eocd.writeUInt16LE(centralRecords.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  chunks.push(eocd);

  await fs.promises.writeFile(outZipPath, Buffer.concat(chunks));
}

// ═════════════════════════════════════════════════════════════════════
//  READER
// ═════════════════════════════════════════════════════════════════════

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** Scans backward from the end of the buffer for the EOCD signature. */
function findEndOfCentralDirectory(buf) {
  // The EOCD is fixed size (22 bytes) plus up to a 65535-byte comment,
  // so it always lives in the last ~64KB of the file.
  const maxBack = Math.min(buf.length, 22 + 65535);
  const start = buf.length - maxBack;
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * Extracts every entry in a zip file into destDir, recreating the
 * directory structure. Rejects Zip64 archives explicitly rather than
 * mis-parsing them — see the module header for why that's fine here.
 *
 * @param {string} zipPath
 * @param {string} destDir
 */
async function extractZipFile(zipPath, destDir) {
  const buf = await fs.promises.readFile(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buf);
  if (eocdOffset === -1) throw new Error('Not a valid zip file (no end-of-central-directory record)');

  let entryCount = buf.readUInt16LE(eocdOffset + 10);
  let centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralDirOffset === 0xffffffff) {
    throw new Error('This zip uses Zip64 (very large archive) — not supported');
  }

  await fs.promises.mkdir(destDir, { recursive: true });

  let ptr = centralDirOffset;
  let extracted = 0;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(ptr) !== CENTRAL_SIG) {
      throw new Error(`Corrupt zip: expected central directory entry at offset ${ptr}`);
    }
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const externalAttrs = buf.readUInt32LE(ptr + 38);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (compSize === 0xffffffff || uncompSize === 0xffffffff) {
      throw new Error(`This zip uses Zip64 for entry "${name}" — not supported`);
    }

    // Guard against a maliciously or corruptly crafted path escaping
    // destDir (e.g. "../../evil"). Anything that normalizes outside the
    // destination is skipped rather than trusted.
    const normalized = path.normalize(name).replace(/^(\.\.[/\\])+/, '');
    const outPath = path.join(destDir, normalized);
    if (!outPath.startsWith(path.normalize(destDir))) continue;

    if (name.endsWith('/')) {
      await fs.promises.mkdir(outPath, { recursive: true });
      continue;
    }

    // Local header repeats some fields and can have a different extra
    // field length than the central directory copy, so it has to be
    // parsed separately to find where the actual file data starts.
    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`Corrupt zip: expected local file header at offset ${localOffset}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const rawData = buf.subarray(dataStart, dataStart + compSize);

    let fileData;
    if (method === 0) fileData = rawData;
    else if (method === 8) fileData = await inflateRaw(rawData);
    else throw new Error(`Unsupported compression method ${method} for "${name}" (only store/deflate handled)`);

    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await fs.promises.writeFile(outPath, fileData);

    // External attrs' high 16 bits are the unix file mode when the
    // archive was made on unix (which every Camoufox release is) —
    // restoring it here means the executable bit survives extraction
    // instead of relying solely on the caller's own chmod afterward.
    const unixMode = externalAttrs >>> 16;
    if (unixMode & 0o111) {
      try { await fs.promises.chmod(outPath, unixMode & 0o777); } catch {}
    }
    extracted++;
  }
  return extracted;
}

// ═════════════════════════════════════════════════════════════════════
//  SURGICAL ENTRY ACCESS  (added for the search-engine fix)
// ═════════════════════════════════════════════════════════════════════
//  extractZipFile() explodes a whole archive to disk. That's the wrong
//  shape for omni.ja, which is Firefox's ~45 MB code bundle: we need to
//  read one file out of it, change a few lines, and put it back with
//  every other entry untouched.
//
//  Handy fact that makes this cheap: Firefox packages omni.ja with
//  every entry STORED (method 0, no compression) so the runtime can
//  read code straight out of the mapped file. Rewriting it is therefore
//  a memcpy rather than a re-compress, and entries we aren't touching
//  are copied byte-for-byte — same bytes, same CRC, same method.

/**
 * Parses a zip's central directory into a list of entry descriptors.
 * Shared by readZipEntry and replaceZipEntries.
 *
 * @param {Buffer} buf
 * @returns {Array<object>}
 */
function parseCentralDirectory(buf) {
  const eocdOffset = findEndOfCentralDirectory(buf);
  if (eocdOffset === -1) throw new Error('Not a valid zip file (no end-of-central-directory record)');

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralDirOffset === 0xffffffff) {
    throw new Error('This zip uses Zip64 (very large archive) — not supported');
  }

  const entries = [];
  let ptr = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(ptr) !== CENTRAL_SIG) {
      throw new Error(`Corrupt zip: expected central directory entry at offset ${ptr}`);
    }
    const flags = buf.readUInt16LE(ptr + 8);
    const method = buf.readUInt16LE(ptr + 10);
    const dosTime = buf.readUInt16LE(ptr + 12);
    const dosDate = buf.readUInt16LE(ptr + 14);
    const crc = buf.readUInt32LE(ptr + 16);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const externalAttrs = buf.readUInt32LE(ptr + 38);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (compSize === 0xffffffff || uncompSize === 0xffffffff) {
      throw new Error(`This zip uses Zip64 for entry "${name}" — not supported`);
    }
    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`Corrupt zip: expected local file header at offset ${localOffset}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;

    entries.push({
      name, flags, method, dosTime, dosDate, crc,
      compSize, uncompSize, externalAttrs, dataStart,
    });
  }
  return entries;
}

/**
 * Reads a single entry out of a zip without unpacking anything else.
 *
 * @param {string} zipPath
 * @param {string} entryName  Exact archive path, e.g. "modules/Foo.sys.mjs"
 * @returns {Promise<Buffer|null>} null if the entry isn't in the archive.
 */
async function readZipEntry(zipPath, entryName) {
  const buf = await fs.promises.readFile(zipPath);
  const entry = parseCentralDirectory(buf).find((e) => e.name === entryName);
  if (!entry) return null;
  const raw = buf.subarray(entry.dataStart, entry.dataStart + entry.compSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRaw(raw);
  throw new Error(`Unsupported compression method ${entry.method} for "${entryName}"`);
}

/**
 * Rewrites a zip with some entries replaced, leaving every other entry
 * bit-identical. Entries not named in `replacements` are copied across
 * as raw bytes — no inflate/deflate round trip, so nothing can be lost
 * or subtly re-encoded in the 99.9% of the archive we don't care about.
 *
 * Written to a sibling temp file and renamed into place, so a crash
 * mid-write can't leave a half-written omni.ja behind (which would make
 * the browser unlaunchable).
 *
 * @param {string} zipPath
 * @param {Record<string, Buffer>} replacements  archive path -> new contents
 * @returns {Promise<string[]>} the entry names that were actually replaced
 */
async function replaceZipEntries(zipPath, replacements) {
  const buf = await fs.promises.readFile(zipPath);
  const entries = parseCentralDirectory(buf);
  const wanted = new Set(Object.keys(replacements));
  const replaced = [];

  const chunks = [];
  const centralRecords = [];
  let offset = 0;

  for (const entry of entries) {
    let payload;
    let crc = entry.crc;
    let method = entry.method;
    let uncompSize = entry.uncompSize;

    if (wanted.has(entry.name)) {
      const data = replacements[entry.name];
      // Stay STORED to match how Firefox packages omni.ja. The file
      // grows by however many bytes we added, which is nothing next to
      // a 45 MB archive, and the runtime keeps its direct-read path.
      payload = data;
      crc = crc32(data);
      method = 0;
      uncompSize = data.length;
      replaced.push(entry.name);
    } else {
      payload = buf.subarray(entry.dataStart, entry.dataStart + entry.compSize);
    }

    const nameBuf = Buffer.from(entry.name, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_SIG, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(entry.dosTime, 10);
    localHeader.writeUInt16LE(entry.dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(uncompSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, nameBuf, payload);
    centralRecords.push({
      nameBuf, flags: entry.flags, method, dosTime: entry.dosTime, dosDate: entry.dosDate,
      crc, compSize: payload.length, uncompSize, externalAttrs: entry.externalAttrs, offset,
    });
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const missing = [...wanted].filter((n) => !replaced.includes(n));
  if (missing.length) throw new Error(`Entries not found in ${path.basename(zipPath)}: ${missing.join(', ')}`);

  const centralStart = offset;
  for (const rec of centralRecords) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(rec.flags, 8);
    central.writeUInt16LE(rec.method, 10);
    central.writeUInt16LE(rec.dosTime, 12);
    central.writeUInt16LE(rec.dosDate, 14);
    central.writeUInt32LE(rec.crc, 16);
    central.writeUInt32LE(rec.compSize, 20);
    central.writeUInt32LE(rec.uncompSize, 24);
    central.writeUInt16LE(rec.nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(rec.externalAttrs >>> 0, 38);
    central.writeUInt32LE(rec.offset, 42);
    chunks.push(central, rec.nameBuf);
    offset += central.length + rec.nameBuf.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralRecords.length, 8);
  eocd.writeUInt16LE(centralRecords.length, 10);
  eocd.writeUInt32LE(offset - centralStart, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);

  const tmpPath = `${zipPath}.mbtmp`;
  await fs.promises.writeFile(tmpPath, Buffer.concat(chunks));
  await fs.promises.rename(tmpPath, zipPath);
  return replaced;
}

module.exports = { zipDirectory, extractZipFile, crc32, readZipEntry, replaceZipEntries };
