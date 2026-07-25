// ─────────────────────────────────────────────────────────────────────
//  MultiBrowse — profile icon rendering via Chromium (not a bitmap font)
// ─────────────────────────────────────────────────────────────────────
//  WHY THIS FILE EXISTS
//
//  iconGen.cjs's renderProfileIcon() drew letters with a hand-rolled 5×7
//  pixel-grid font, upscaled with a box filter. That's what made the tab
//  bar badge and taskbar icon look "pixelated" — it isn't a resolution
//  problem, the glyphs themselves are blocky by construction, no amount
//  of anti-aliasing fixes that.
//
//  Meanwhile ProfileList.tsx renders the exact same P1/M-style label as
//  real text — actual browser typography, crisp at any size, no bitmap
//  involved. This file gets the icons that ship to a title bar and to
//  Windows' taskbar to match: it renders the SAME markup (rounded tinted
//  box, bold colored label) through an offscreen Electron window and
//  captures the result, so what you see in the sidebar is what you get
//  everywhere else — same font rendering, same anti-aliasing, same
//  engine. No new dependency: BrowserWindow and nativeImage are already
//  part of Electron.
// ─────────────────────────────────────────────────────────────────────

const { app, BrowserWindow } = require('electron');
const { encodeIco } = require('./iconGen.cjs');

// Master render resolution. Every requested size is downsampled from
// this via nativeImage's own (high-quality) resizer, so 256 only needs
// to be big enough for the largest icon MultiBrowse ever asks for.
const RENDER_SIZE = 256;

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Turns a profile name into the same short label ProfileList.tsx shows
 * ("Profile 12" -> "P12", "Marketing" -> "M"). Kept in sync with
 * getProfileLabel() in src/components/ProfileList.tsx by hand — if one
 * changes, change the other.
 */
function labelFromName(name) {
  const str = String(name || '');
  const digits = str.match(/(\d+)/);
  if (digits) return `P${digits[1]}`.slice(0, 4);
  const letter = str.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(letter) ? letter : 'P';
}

// Same font stack the app itself actually renders with — 'Inter' isn't
// bundled as a webfont anywhere in this app (checked: no @font-face, no
// Google Fonts link), so both the UI and this render fall through to the
// system-ui stack. Matching that fallback, rather than assuming Inter is
// present, is what keeps the two visually identical.
const FONT_STACK = "-apple-system, 'Segoe UI', system-ui, Roboto, sans-serif";

function buildHtml(label, color) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#e8d44d';
  const safeLabel = escapeHtml(label);
  // Two layers, same idea as the old bitmap version: a solid dark tile
  // (so the icon reads clearly on any taskbar/title bar, not just the
  // app's own dark theme) with the profile's tinted-and-bordered badge
  // inset — same tint math ProfileList.tsx uses (color + '22' alpha).
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body {
  margin: 0; padding: 0; width: ${RENDER_SIZE}px; height: ${RENDER_SIZE}px;
  background: transparent; overflow: hidden;
}
.tile {
  width: ${RENDER_SIZE}px; height: ${RENDER_SIZE}px;
  border-radius: ${Math.round(RENDER_SIZE * 0.25)}px;
  background: #0a0a0f;
  display: flex; align-items: center; justify-content: center;
}
.inner {
  width: ${Math.round(RENDER_SIZE * 0.82)}px; height: ${Math.round(RENDER_SIZE * 0.82)}px;
  border-radius: ${Math.round(RENDER_SIZE * 0.19)}px;
  background: ${safeColor}22;
  outline: ${Math.max(2, Math.round(RENDER_SIZE * 0.012))}px solid ${safeColor}55;
  outline-offset: -${Math.max(2, Math.round(RENDER_SIZE * 0.012))}px;
  display: flex; align-items: center; justify-content: center;
}
.label {
  font-family: ${FONT_STACK};
  font-weight: 800;
  font-size: ${Math.round(RENDER_SIZE * 0.3)}px;
  color: ${safeColor};
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
</style></head><body>
<div class="tile"><div class="inner"><div class="label">${safeLabel}</div></div></div>
</body></html>`;
}

/** Renders the badge HTML in an offscreen window and captures it. */
async function captureBadge(label, color) {
  if (!app.isReady()) await app.whenReady();
  const win = new BrowserWindow({
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { backgroundThrottling: false },
  });
  try {
    const html = buildHtml(label, color);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // Letting one paint cycle pass avoids capturing a half-laid-out
    // frame — loadURL's promise resolves on navigation commit, not on
    // "the page has actually painted".
    await new Promise((resolve) => setTimeout(resolve, 50));
    return await win.webContents.capturePage();
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/**
 * Renders a profile badge and returns PNG buffers at each requested
 * size plus a Windows ICO built from the standard icon sizes.
 * @param {string} label
 * @param {string} color
 * @param {number[]} sizes
 */
async function renderProfileIcon(label, color, sizes = [16, 32, 48, 128, 256]) {
  const master = await captureBadge(label, color);
  const pngs = {};
  const wanted = Array.from(new Set([...sizes, 16, 32, 48, 256])).sort((a, b) => a - b);
  for (const size of wanted) {
    pngs[size] = size === RENDER_SIZE
      ? master.toPNG()
      : master.resize({ width: size, height: size, quality: 'best' }).toPNG();
  }
  const ico = encodeIco([16, 32, 48, 256].map((size) => ({ size, png: pngs[size] })));
  return { pngs, ico };
}

module.exports = { renderProfileIcon, labelFromName };
