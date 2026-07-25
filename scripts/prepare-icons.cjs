/**
 * Puts the app icon where electron-builder expects it.
 *
 * The old flow ran scripts/png-to-ico.cjs, which needs `sharp` and
 * `to-ico` — two native modules. That is fine on a developer's Windows
 * box but a liability in CI across three operating systems.
 *
 * electron-builder converts a single square PNG (256px or larger) into
 * the .ico Windows wants and the .icns macOS wants, entirely on its own.
 * So all this has to do is drop public/icon.png at build/icon.png.
 *
 * Usage: node scripts/prepare-icons.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'icon.png');
const buildDir = path.join(root, 'build');
const dest = path.join(buildDir, 'icon.png');

if (!fs.existsSync(src)) {
  console.error('ERROR: public/icon.png not found — cannot build app icons.');
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(src, dest);

// PNG dimensions live at a fixed offset in the IHDR chunk.
const head = fs.readFileSync(src).subarray(0, 33);
const width = head.readUInt32BE(16);
const height = head.readUInt32BE(20);

console.log(`App icon ready: build/icon.png (${width}x${height})`);
if (width < 256 || height < 256) {
  console.warn('WARNING: icon should be at least 256x256 — 512x512 is ideal.');
}
