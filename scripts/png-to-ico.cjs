/**
 * Build a proper multi-size Windows ICO from public/icon.png.
 * This is used by electron-builder for the EXE/portable file icon.
 * 
 * Why this exists:
 * - Explorer/EXE icons need true multi-resolution ICO resources
 * - A single embedded PNG entry can work inconsistently
 * - We generate 16/24/32/48/64/128/256 sizes from the user's real logo
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const pngPath = path.join(__dirname, '..', 'public', 'icon.png');
const outputPath = process.argv[3] || path.join(__dirname, '..', 'build', 'icon.ico');
const outDir = path.dirname(outputPath);

(async () => {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(pngPath)) {
    console.error('ERROR: public/icon.png not found.');
    process.exit(1);
  }

  try {
    const source = sharp(pngPath, { failOn: 'none' });
    const meta = await source.metadata();
    console.log(`Source PNG: ${meta.width || '?'}x${meta.height || '?'}`);

    const sizes = [16, 24, 32, 48, 64, 128, 256];

    const pngBuffers = await Promise.all(
      sizes.map((size) =>
        sharp(pngPath, { failOn: 'none' })
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer()
      )
    );

    const icoBuffer = await toIco(pngBuffers);
    fs.writeFileSync(outputPath, icoBuffer);

    const stat = fs.statSync(outputPath);
    console.log(`ICO created from custom PNG: ${outputPath} (${stat.size} bytes, sizes: ${sizes.join(', ')})`);
  } catch (err) {
    console.error('ERROR: Failed to convert PNG to ICO:', err?.message || err);
    process.exit(1);
  }
})();
