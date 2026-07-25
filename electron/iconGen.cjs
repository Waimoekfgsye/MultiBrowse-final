// ─────────────────────────────────────────────────────────────────────
//  MultiBrowse — profile icon generator (zero dependencies)
// ─────────────────────────────────────────────────────────────────────
//  WHY THIS FILE EXISTS
//
//  The old code did this:
//      const sharp = require('sharp');          // native module
//      const toIco = require('to-ico');         // pulls in more native
//
//  Both are NATIVE modules. electron-builder packs `electron/**` and
//  `node_modules/**` into app.asar, and a .node binary cannot be loaded
//  from inside an asar archive. So in the PACKAGED build (the .exe you
//  actually run) `require('sharp')` threw, createProfileIcon() caught it
//  and returned null, and from there:
//
//      no PNG  ->  no title-bar badge
//      no ICO  ->  no per-profile taskbar icon  ->  Camoufox logo
//                  everywhere
//
//  It worked in `npm run dev` and quietly died once packaged, which is
//  exactly the "why did you remove it" symptom.
//
//  Rather than fight asar unpacking and native rebuilds on three
//  operating systems in CI, this writes the PNG and ICO bytes directly.
//  Node's built-in zlib is the only thing needed. Nothing to compile,
//  nothing to unpack, identical behaviour on Windows, macOS and Linux.
// ─────────────────────────────────────────────────────────────────────

const zlib = require('zlib');

// ═════════════════════════════════════════════════════════════════════
//  Tiny RGBA canvas
// ═════════════════════════════════════════════════════════════════════
//  Everything is drawn at 4x the final size with hard edges, then box-
//  downsampled at the end. That is where the anti-aliasing comes from —
//  no per-shape coverage maths required.

const SS = 1024; // supersample working resolution

function createCanvas(size) {
  return { w: size, h: size, data: Buffer.alloc(size * size * 4) };
}

/** Alpha-blend one pixel. r/g/b are 0-255, a is 0-1. */
function blend(c, x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const dstA = c.data[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  c.data[i] = Math.round((r * a + c.data[i] * dstA * (1 - a)) / outA);
  c.data[i + 1] = Math.round((g * a + c.data[i + 1] * dstA * (1 - a)) / outA);
  c.data[i + 2] = Math.round((b * a + c.data[i + 2] * dstA * (1 - a)) / outA);
  c.data[i + 3] = Math.round(outA * 255);
}

/** "#e8d44d" -> [232, 212, 77]. Falls back to the app accent. */
function parseHex(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return [232, 212, 77];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function fillRoundRect(c, x, y, w, h, radius, rgb, alpha) {
  const [r, g, b] = rgb;
  const rad = Math.min(radius, w / 2, h / 2);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(c.w, Math.ceil(x + w));
  const y1 = Math.min(c.h, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      // Distance from the nearest corner circle centre, if we're in a corner.
      const dx = px < x + rad ? x + rad - px : (px > x + w - rad ? px - (x + w - rad) : 0);
      const dy = py < y + rad ? y + rad - py : (py > y + h - rad ? py - (y + h - rad) : 0);
      if (dx * dx + dy * dy > rad * rad) continue;
      blend(c, px, py, r, g, b, alpha);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
//  5x7 bitmap font — enough for "P1", "A", "12" and so on
// ═════════════════════════════════════════════════════════════════════
//  Only the characters a profile label can produce are included:
//  digits and uppercase letters. Anything else falls back to a dot.

const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
};

function drawLabel(c, text, rgb) {
  const chars = String(text).toUpperCase().split('').slice(0, 3).map((ch) => FONT[ch] || FONT['?']);
  if (chars.length === 0) return;

  // Cap height ~55% of the canvas looks right at every icon size.
  const px = Math.round((c.h * 0.55) / 7);
  const glyphW = 5 * px;
  const glyphH = 7 * px;
  const gap = Math.round(px * 0.9);
  const totalW = chars.length * glyphW + (chars.length - 1) * gap;
  let startX = Math.round((c.w - totalW) / 2);
  const startY = Math.round((c.h - glyphH) / 2);

  for (const glyph of chars) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== '1') continue;
        const bx = startX + col * px;
        const by = startY + row * px;
        for (let y = 0; y < px; y++) {
          for (let x = 0; x < px; x++) blend(c, bx + x, by + y, rgb[0], rgb[1], rgb[2], 1);
        }
      }
    }
    startX += glyphW + gap;
  }
}

/** Box-filter downsample. This is what turns hard edges into smooth ones. */
function downsample(src, size) {
  const out = createCanvas(size);
  const factor = src.w / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx0 = Math.floor(x * factor);
      const sy0 = Math.floor(y * factor);
      const sx1 = Math.min(src.w, Math.ceil((x + 1) * factor));
      const sy1 = Math.min(src.h, Math.ceil((y + 1) * factor));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.w + sx) * 4;
          const pa = src.data[i + 3] / 255;
          // Premultiply so transparent pixels don't drag colour in.
          r += src.data[i] * pa;
          g += src.data[i + 1] * pa;
          b += src.data[i + 2] * pa;
          a += pa;
          n++;
        }
      }
      if (n === 0) continue;
      const o = (y * size + x) * 4;
      const avgA = a / n;
      if (avgA > 0) {
        out.data[o] = Math.round(r / n / avgA);
        out.data[o + 1] = Math.round(g / n / avgA);
        out.data[o + 2] = Math.round(b / n / avgA);
      }
      out.data[o + 3] = Math.round(avgA * 255);
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════
//  PNG encoder
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

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(canvas) {
  const { w, h, data } = canvas;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte (0 = none).
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ═════════════════════════════════════════════════════════════════════
//  ICO encoder
// ═════════════════════════════════════════════════════════════════════
//  Windows Vista and later accept PNG-compressed entries inside an ICO,
//  which is what both Explorer and Firefox's window-icon loader use.

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  const blobs = [];

  entries.forEach((entry, i) => {
    const base = i * 16;
    dir[base] = entry.size >= 256 ? 0 : entry.size;     // 0 means 256
    dir[base + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[base + 2] = 0; // palette size
    dir[base + 3] = 0; // reserved
    dir.writeUInt16LE(1, base + 4);  // colour planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
    blobs.push(entry.png);
  });

  return Buffer.concat([header, dir, ...blobs]);
}

// ═════════════════════════════════════════════════════════════════════
//  Public API
// ═════════════════════════════════════════════════════════════════════

/**
 * Renders a profile badge and returns PNG buffers plus a Windows ICO.
 *
 * @param {string} label  short text, e.g. "P1" or "A"
 * @param {string} color  profile accent, e.g. "#e8d44d"
 * @param {number[]} sizes PNG sizes to produce
 * @returns {{ pngs: Record<number, Buffer>, ico: Buffer }}
 */
function renderProfileIcon(label, color, sizes = [16, 32, 48, 128, 256]) {
  const accent = parseHex(color);

  // Same design the old SVG described: dark rounded tile, a soft tinted
  // inset panel, and the label in the profile colour.
  const big = createCanvas(SS);
  fillRoundRect(big, 0, 0, SS, SS, SS * 0.25, [10, 10, 15], 1);
  fillRoundRect(big, SS * 0.094, SS * 0.094, SS * 0.812, SS * 0.812, SS * 0.187, accent, 0.16);
  drawLabel(big, label, accent);

  const pngs = {};
  const wanted = Array.from(new Set([...sizes, 16, 32, 48, 256])).sort((a, b) => a - b);
  for (const size of wanted) pngs[size] = encodePng(downsample(big, size));

  const ico = encodeIco([16, 32, 48, 256].map((size) => ({ size, png: pngs[size] })));
  return { pngs, ico };
}

/**
 * Turns a profile name into a short badge label, matching the old
 * behaviour: "Profile 12" -> "P12", "Marketing" -> "M".
 */
function labelFromName(name) {
  const str = String(name || '');
  const digits = str.match(/(\d+)/);
  if (digits) return `P${digits[1]}`.slice(0, 3);
  const letter = str.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(letter) ? letter : 'P';
}

module.exports = { renderProfileIcon, labelFromName, encodePng, encodeIco };
