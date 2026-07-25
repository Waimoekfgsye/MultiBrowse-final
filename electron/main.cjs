const { app, BrowserWindow, ipcMain, nativeImage, Tray, screen, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const https = require('https');
const http = require('http');
const { execFile, spawn } = require('child_process');
const browserTheme = require('./browser-theme.cjs');

const PROFILE_SYNC_API = 'https://worker-setup-unrealvfx.unrealvfx.workers.dev';

// ── Launch safety switches ───────────────────────────────────────────
// Flip these while diagnosing crashes. Each one is independent.
const LAUNCH_SAFETY = {
  // webgl.force-enabled=true forces WebGL on even when the GPU driver is
  // on Firefox's blocklist. On a blocklisted driver, a page that hammers
  // WebGL (creepjs does exactly this) can hard-crash the content or GPU
  // process. WebGL still WORKS with this false — it just respects the
  // blocklist and falls back to software rendering instead of crashing.
  // Set true only if you've confirmed it isn't the crash source.
  forceWebGLPastBlocklist: false,

  // Your code injects a whole synthetic WebGL profile — extension list,
  // context attributes, ~100 numeric GL parameters and shader precision
  // formats (see webglProfiles.cjs). Camoufox applies those inside the
  // C++ graphics layer.
  //
  // In the log, every tab death happens immediately after creepjs walks
  // WEBGL_debug_renderer_info and enumerates GL parameters. If any
  // injected value disagrees with what the real driver reports, that
  // enumeration is where it would blow up — and a content-process crash
  // is exactly what "Gah. Your tab just crashed" + WerFault means.
  //
  // false = still spoof vendor + renderer strings (the part that
  // actually matters for fingerprinting), but let the numeric parameter
  // table come from the real driver. Turn back on once the crash source
  // is confirmed.
  spoofWebGLParameterBundle: false,

  // ── Search ─────────────────────────────────────────────────────────
  // Camoufox does not ship a broken search service by accident — it
  // ships a source patch. Inside its omni.ja,
  //   moz-src:///toolkit/components/search/SearchEngineSelector.sys.mjs
  // begins #getConfiguration with an `if (true)` short-circuit that
  // returns a single record in the OLD search-config schema
  // (appliesTo / webExtension, no `recordType`). Firefox 152 parses the
  // engine list in the Rust search component against search-config-v2,
  // where `recordType` is required, so it throws
  //   "JSON error: missing field `recordType`"
  //   -> "Search service failed to init"
  //   -> "cannot write without any engine"
  //   -> zero engines, and "gmail" becomes http://gmail/
  //
  // That short-circuit is compiled into the shipped JS, so NO pref can
  // reach it. services.settings.server, keyword.enabled, policies.json
  // and clearing prefs.js were all aimed at the wrong layer, which is
  // why every one of them changed nothing.
  //
  // electron/searchEngineFix.cjs patches the engine instead: it removes
  // the stub and unlocks the engine list Camoufox already ships at
  //   browser/omni.ja!defaults/settings/main/search-config-v2.json
  // (154 engines, ~200 KB, untouched). That file is on disk, so the fix
  // needs no network — nothing is fetched from Mozilla, and there is no
  // IP to leak past the profile's proxy.
  //
  // false = leave the engine alone and launch with search broken.
  patchSearchConfigInEngine: true,

  // Borderless browser window: the tab strip is hosted inside the title
  // bar, so there's no separate OS caption bar above it. The window
  // buttons are then drawn by Firefox — which is what produced the blank
  // outlined boxes, because its own button icons don't resolve on this
  // build. electron/browser-theme.cjs replaces them with flat colour
  // circles (THEME.trafficLights), matching the app's own window
  // controls, so no icon asset is involved anymore.
  //
  // Set to false to hand the title bar back to the OS instead: you get
  // native Windows buttons and an extra title bar row.
  borderlessWindow: true,

  // Writes everything the browser prints to
  //   <userData>/logs/<profileId>.log
  // and reports any crash minidumps after it exits. Leave on until the
  // crashing is solved.
  captureBrowserLogs: true,
};

let mainWindow;
let tray = null;
const activeProfiles = new Map();

// ── Camoufox Engine — cross-platform, always the latest release ──────
// Was hard-pinned to one Windows-only beta (see the old NIMBUS_ZIP /
// NIMBUS_URL constants this replaced). camoufoxEngine.cjs asks GitHub
// for daijro/camoufox's current release and picks the asset matching
// this OS + CPU architecture, so:
//   * macOS and Linux get a real engine instead of nothing at all
//   * every fresh install picks up whatever daijro has shipped since,
//     with no MultiBrowse code change required
const camoufoxEngine = require('./camoufoxEngine.cjs');
const searchEngineFix = require('./searchEngineFix.cjs');

// Applies the engine-level search patch to one installed Camoufox copy.
// Cheap after the first run: searchEngineFix keeps a marker file next to
// the binary and re-patches only when the patch version or the chosen
// default engine changes. Never fatal — a profile that fails to patch
// launches with search broken, which is strictly better than not
// launching at all.
async function applySearchFixToEngine(binPath, searchEngine) {
  if (!LAUNCH_SAFETY.patchSearchConfigInEngine) return false;
  try {
    return await searchEngineFix.applySearchEngineFix(
      camoufoxEngine.resourcesDirForBinary(binPath),
      searchEngine
    );
  } catch (err) {
    console.error('[MultiBrowse] Search engine patch failed:', err.message);
    return false;
  }
}

function getEngineCacheFile() {
  return path.join(app.getPath('userData'), 'camoufox-release-cache.json');
}

// Each OS/arch/version combination gets its own folder. This matters
// most for updates: if a user reinstalls on a different machine, or a
// newer Camoufox release becomes current, the old engine copy is left
// alone rather than being overwritten mid-use by something with a
// different folder layout.
function getNimbusDir(tag) {
  const platform = camoufoxEngine.platformToken();
  const arch = camoufoxEngine.archToken();
  const safeTag = String(tag || 'unresolved').replace(/[^\w.-]/g, '_');
  return path.join(app.getPath('userData'), 'nimbus-engine', `${platform}-${arch}-${safeTag}`);
}

// Points at whichever engine folder was installed last, regardless of
// its version tag — so the rest of the app doesn't need to track the
// tag on every call. Written by downloadNimbusEngine(), read by
// everything else.
function getActiveEngineMarkerFile() {
  return path.join(app.getPath('userData'), 'nimbus-engine', 'active.json');
}
function readActiveEngineDir() {
  try {
    const marker = JSON.parse(fs.readFileSync(getActiveEngineMarkerFile(), 'utf8'));
    if (marker?.dir && fs.existsSync(marker.dir)) return marker.dir;
  } catch {}
  return null;
}
function writeActiveEngineMarker(dir, tag) {
  try {
    fs.mkdirSync(path.dirname(getActiveEngineMarkerFile()), { recursive: true });
    fs.writeFileSync(getActiveEngineMarkerFile(), JSON.stringify({ dir, tag, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch {}
}

function getNimbusBinPath() {
  const dir = readActiveEngineDir();
  if (!dir) return null;
  return camoufoxEngine.locateBinary(dir);
}
function isNimbusInstalled() {
  const bin = getNimbusBinPath();
  return !!(bin && fs.existsSync(bin));
}
function getNimbusProfilesDir() {
  return path.join(app.getPath('userData'), 'nimbus-profiles');
}

// ── Auth token persistence ───────────────────────────────────────────
function getAuthTokenFilePath() { return path.join(app.getPath('userData'), 'auth-token.json'); }

function loadAuthTokenFromDisk() {
  try {
    const file = getAuthTokenFilePath();
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.encrypted && raw.data) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(raw.data, 'base64'));
    }
    return typeof raw.data === 'string' ? raw.data : null;
  } catch { return null; }
}

function saveAuthTokenToDisk(token) {
  try {
    const file = getAuthTokenFilePath();
    if (safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(token);
      fs.writeFileSync(file, JSON.stringify({ encrypted: true, data: enc.toString('base64') }), 'utf8');
    } else {
      fs.writeFileSync(file, JSON.stringify({ encrypted: false, data: token }), 'utf8');
    }
  } catch {}
}

function clearAuthTokenFromDisk() {
  try { const file = getAuthTokenFilePath(); if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

// ── Download engine ──────────────────────────────────────────────────
function followRedirects(url, callback) {
  const proto = url.startsWith('https') ? https : http;
  proto.get(url, { headers: { 'User-Agent': 'MultiBrowse/2.0' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      followRedirects(res.headers.location, callback);
    } else {
      callback(res);
    }
  }).on('error', (err) => callback(null, err));
}

function sendProgress(data) {
  mainWindow?.webContents.send('camoufox-download-progress', data);
}

// zipUtils.cjs is this app's own zip reader/writer, built on nothing but
// Node's built-in zlib. Was extract-zip (wraps yauzl) — that crashed the
// packaged app at startup with "Cannot find module 'archiver-utils'"
// (a transitive dependency of the sibling `archiver` package used below
// that didn't survive electron-builder's packaging). Same failure mode
// this project already hit once with `sharp`/`to-ico` — see iconGen.cjs
// and zipUtils.cjs's own header for the full story.
const { zipDirectory, extractZipFile } = require('./zipUtils.cjs');

/**
 * Downloads and installs whatever Camoufox build is CURRENTLY latest
 * for this OS + CPU. Always re-resolves against GitHub first (bypassing
 * the release-info cache) so a fresh install never quietly grabs a
 * stale pinned version — see camoufoxEngine.cjs for why that mattered.
 */
async function downloadNimbusEngine() {
  sendProgress({ status: 'resolving', percent: 0 });
  const { tag, asset } = await camoufoxEngine.resolveLatestEngine(getEngineCacheFile(), true);
  console.log(`[MultiBrowse] Installing Camoufox ${tag} (${asset.name}${asset.viaRosetta ? ', via Rosetta' : ''})`);

  const dir = getNimbusDir(tag);
  await fsp.mkdir(dir, { recursive: true });

  // Already installed at this tag — nothing to download, just point the
  // rest of the app at it.
  const existingBin = camoufoxEngine.locateBinary(dir);
  if (existingBin && fs.existsSync(existingBin)) {
    writeActiveEngineMarker(dir, tag);
    sendProgress({ status: 'done' });
    return;
  }

  const zipPath = path.join(app.getPath('temp'), asset.name);
  sendProgress({ status: 'downloading', percent: 0, speed: '0 MB/s', downloaded: '0', total: '0' });

  await new Promise((resolve, reject) => {
    followRedirects(asset.url, (res, err) => {
      if (err || !res) { sendProgress({ status: 'error', error: err?.message || 'Download failed' }); return reject(err || new Error('Download failed')); }
      if (res.statusCode !== 200) { sendProgress({ status: 'error', error: `HTTP ${res.statusCode}` }); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const totalBytes = parseInt(res.headers['content-length'] || String(asset.size || 0), 10);
      let downloadedBytes = 0, lastTime = Date.now(), lastBytes = 0;
      const file = fs.createWriteStream(zipPath);
      res.pipe(file);
      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now(), elapsed = (now - lastTime) / 1000;
        if (elapsed >= 0.4) {
          const speed = ((downloadedBytes - lastBytes) / elapsed / 1048576).toFixed(1);
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          sendProgress({ status: 'downloading', percent, speed: `${speed} MB/s`, downloaded: (downloadedBytes / 1048576).toFixed(1), total: (totalBytes / 1048576).toFixed(1) });
          lastTime = now; lastBytes = downloadedBytes;
        }
      });
      file.on('finish', () => file.close(resolve));
      file.on('error', (e) => { try { fs.unlinkSync(zipPath); } catch {} sendProgress({ status: 'error', error: e.message }); reject(e); });
    });
  });

  sendProgress({ status: 'extracting', percent: 100 });
  try {
    await extractZipFile(zipPath, dir);
  } catch (err) {
    sendProgress({ status: 'error', error: `Extract failed: ${err.message}` });
    throw err;
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
  }

  const binPath = camoufoxEngine.locateBinary(dir);
  if (!binPath) {
    const msg = `Extracted ${asset.name} but couldn't find a browser executable inside it`;
    sendProgress({ status: 'error', error: msg });
    throw new Error(msg);
  }
  // Zip archives don't preserve the executable bit reliably on
  // extraction — without this, launching fails silently with EACCES
  // on macOS and Linux.
  camoufoxEngine.ensureExecutable(binPath);

  // Used to patch the SHARED engine copy's own icon resource so that what
  // sat on disk showed MultiBrowse's icon rather than Camoufox's. Now a
  // no-op unless MULTIBROWSE_PATCH_EXE_ICON=1 — rewriting a PE resource
  // section at runtime is an antivirus trigger, and nothing user-visible
  // depended on it: each profile gets its window/taskbar icon from
  // writeProfileWindowIcons() and its file icon from a .lnk shortcut.
  try {
    const appIco = await getAppIconIco();
    if (appIco) await patchExeIcon(binPath, appIco);
  } catch (err) {
    console.warn('[MultiBrowse] Could not patch shared engine icon:', err.message);
  }

  writeActiveEngineMarker(dir, tag);
  sendProgress({ status: 'done' });
}

// ── Cloud session sync ───────────────────────────────────────────────
function getSyncMetaPath(d) { return path.join(d, '.cloud_sync_meta.json'); }
function readLocalSyncMeta(d) { try { const p = getSyncMetaPath(d); if (!fs.existsSync(p)) return null; return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function writeLocalSyncMeta(d, m) { try { fs.writeFileSync(getSyncMetaPath(d), JSON.stringify(m, null, 2), 'utf8'); } catch {} }
function hasSavedSession(d) { return ['sessionstore.jsonlz4', 'sessionstore-backups'].some(f => fs.existsSync(path.join(d, f))); }

// Cloud profile sync now reuses the same dependency-free zip writer as
// the engine installer — see the note above the zipUtils require, and
// zipUtils.cjs itself, for why archiver was dropped entirely rather
// than patched.
function zipProfileDir(profileDir, outZipPath) {
  return zipDirectory(profileDir, outZipPath, { exclude: ['.cloud_sync_meta.json'] });
}

async function fetchCloudProfileMeta(profileId, token) {
  const res = await fetch(`${PROFILE_SYNC_API}/profiles`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Cloud list failed (${res.status})`);
  const data = await res.json();
  return (data.profiles || []).find(p => p.id === profileId) || null;
}

async function downloadCloudProfileArchive(profileId, token, outZipPath) {
  const res = await fetch(`${PROFILE_SYNC_API}/profiles/${profileId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Cloud download failed (${res.status})`);
  fs.writeFileSync(outZipPath, Buffer.from(await res.arrayBuffer()));
}

async function uploadCloudProfileArchive(profileId, profileName, token, zipPath) {
  const body = fs.readFileSync(zipPath);
  const res = await fetch(`${PROFILE_SYNC_API}/profiles/${profileId}?name=${encodeURIComponent(profileName)}&type=session`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body });
  if (!res.ok) throw new Error(`Cloud upload failed (${res.status})`);
}

async function syncProfileDirFromCloudIfNewer(profileId, profileName, profileDir, token) {
  if (!token) return false;
  try {
    const cloudMeta = await fetchCloudProfileMeta(profileId, token);
    if (!cloudMeta || !cloudMeta.size_bytes) return false;
    const localMeta = readLocalSyncMeta(profileDir);
    const cloudTs = new Date(cloudMeta.last_synced_at || cloudMeta.created_at || 0).getTime();
    const localTs = localMeta?.last_synced_at ? new Date(localMeta.last_synced_at).getTime() : 0;
    if (localTs >= cloudTs && localTs !== 0 && hasSavedSession(profileDir)) return false;
    const tmpZip = path.join(app.getPath('temp'), `multibrowse-${profileId}.zip`);
    await downloadCloudProfileArchive(profileId, token, tmpZip);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(profileDir, { recursive: true });
    await extractZipFile(tmpZip, profileDir);
    try { fs.unlinkSync(tmpZip); } catch {}
    writeLocalSyncMeta(profileDir, { profile_id: profileId, name: profileName, last_synced_at: cloudMeta.last_synced_at || new Date().toISOString(), source: 'cloud' });
    return true;
  } catch { return false; }
}

async function syncProfileDirToCloud(profileId, profileName, profileDir, token) {
  if (!token) return false;
  try {
    const tmpZip = path.join(app.getPath('temp'), `multibrowse-${profileId}.zip`);
    await zipProfileDir(profileDir, tmpZip);
    await uploadCloudProfileArchive(profileId, profileName, token, tmpZip);
    try { fs.unlinkSync(tmpZip); } catch {}
    writeLocalSyncMeta(profileDir, { profile_id: profileId, name: profileName, last_synced_at: new Date().toISOString(), source: 'local' });
    return true;
  } catch { return false; }
}

// ── Build Camoufox engine config ─────────────────────────────────────
const { getWebGLBundle } = require('./webglProfiles.cjs');

// ── OS font sets ─────────────────────────────────────────────────────
// Mirrors src/utils/fingerprint.ts. Kept here as well so the engine
// config never depends on what the renderer happened to save — an older
// profile with no font data still gets a consistent list.
const FONT_SETS = {
  Windows: ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia', 'Impact', 'Ink Free', 'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic', 'Marlett', 'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue', 'Microsoft PhagsPa', 'Microsoft Sans Serif', 'Microsoft Tai Le', 'Microsoft YaHei', 'Mongolian Baiti', 'MS Gothic', 'MV Boli', 'Myanmar Text', 'Nirmala UI', 'Palatino Linotype', 'Segoe MDL2 Assets', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Historic', 'Segoe UI Symbol', 'SimSun', 'Sitka', 'Sylfaen', 'Symbol', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic'],
  macOS: ['American Typewriter', 'Andale Mono', 'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'Arial Unicode MS', 'Avenir', 'Avenir Next', 'Avenir Next Condensed', 'Baskerville', 'Big Caslon', 'Bodoni 72', 'Bradley Hand', 'Brush Script MT', 'Chalkboard', 'Chalkboard SE', 'Chalkduster', 'Charter', 'Cochin', 'Comic Sans MS', 'Copperplate', 'Courier', 'Courier New', 'Didot', 'DIN Alternate', 'DIN Condensed', 'Futura', 'Geneva', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Herculanum', 'Hoefler Text', 'Impact', 'Lucida Grande', 'Luminari', 'Marker Felt', 'Menlo', 'Microsoft Sans Serif', 'Monaco', 'Noteworthy', 'Optima', 'Palatino', 'Papyrus', 'Phosphate', 'Rockwell', 'Savoye LET', 'SignPainter', 'Skia', 'Snell Roundhand', 'Tahoma', 'Times', 'Times New Roman', 'Trattatello', 'Trebuchet MS', 'Verdana', 'Zapfino'],
  Linux: ['Bitstream Charter', 'C059', 'Century Schoolbook L', 'Cantarell', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'D050000L', 'Dingbats', 'FreeMono', 'FreeSans', 'FreeSerif', 'Liberation Mono', 'Liberation Sans', 'Liberation Sans Narrow', 'Liberation Serif', 'Nimbus Mono PS', 'Nimbus Roman', 'Nimbus Sans', 'Nimbus Sans Narrow', 'Noto Color Emoji', 'Noto Mono', 'Noto Sans', 'Noto Serif', 'P052', 'Standard Symbols PS', 'Ubuntu', 'Ubuntu Condensed', 'Ubuntu Mono', 'URW Bookman', 'URW Gothic', 'Z003'],
};

function getFontsForOS(os) {
  const name = String(os || '');
  if (name.includes('macOS') || name.includes('Mac')) return FONT_SETS.macOS;
  if (name.includes('Linux') || name.includes('Ubuntu') || name.includes('Debian') || name.includes('Fedora')) return FONT_SETS.Linux;
  return FONT_SETS.Windows;
}

function buildEngineConfig(config) {
  const fp = config?.fingerprint || {};
  const c = {};
  c['disableTheming'] = false;
  c['humanize'] = true;
  c['showcursor'] = false;
  c['defaultUrl'] = 'https://www.google.com';
  if (fp.userAgent) c['navigator.userAgent'] = fp.userAgent;
  if (fp.hardwareConcurrency) c['navigator.hardwareConcurrency'] = fp.hardwareConcurrency;
  if (fp.deviceMemory) c['navigator.deviceMemory'] = fp.deviceMemory;
  if (fp.language) {
    const [lang, region] = fp.language.split('-');
    c['navigator.language'] = fp.language;
    c['navigator.languages'] = [fp.language, lang];
    c['locale:language'] = lang;
    if (region) c['locale:region'] = region;
  }
  const os = fp.os || '';
  if (os.includes('Windows')) { c['navigator.platform'] = 'Win32'; c['navigator.oscpu'] = 'Windows NT 10.0; Win64; x64'; }
  else if (os.includes('macOS')) { c['navigator.platform'] = 'MacIntel'; c['navigator.oscpu'] = 'Intel Mac OS X 10.15'; }
  else { c['navigator.platform'] = 'Linux x86_64'; c['navigator.oscpu'] = 'Linux x86_64'; }
  if (fp.screenResolution) {
    const [w, h] = fp.screenResolution.split('x').map(Number);
    if (w && h) { c['screen.width'] = w; c['screen.height'] = h; c['screen.colorDepth'] = 24; c['screen.pixelDepth'] = 24; }
  }
  if (fp.webglSpoof !== false && fp.webglVendor && fp.webglRenderer) {
    c['webGl:vendor'] = fp.webglVendor;
    c['webGl:renderer'] = fp.webglRenderer;
    c['webGl2:vendor'] = fp.webglVendor;
    c['webGl2:renderer'] = fp.webglRenderer;
    try {
      const bundle = LAUNCH_SAFETY.spoofWebGLParameterBundle
        ? getWebGLBundle(fp.webglVendor, fp.webglRenderer)
        : null;
      if (bundle) {
        if (bundle.webGlSupportedExtensions) c['webGl:supportedExtensions'] = bundle.webGlSupportedExtensions;
        if (bundle.webGlContextAttributes) c['webGl:contextAttributes'] = bundle.webGlContextAttributes;
        if (bundle.webGlParameters) c['webGl:parameters'] = bundle.webGlParameters;
        if (bundle.webGlShaderPrecisionFormats) c['webGl:shaderPrecisionFormats'] = bundle.webGlShaderPrecisionFormats;
        if (bundle.webGl2SupportedExtensions) c['webGl2:supportedExtensions'] = bundle.webGl2SupportedExtensions;
        if (bundle.webGl2ContextAttributes) c['webGl2:contextAttributes'] = bundle.webGl2ContextAttributes;
        if (bundle.webGl2Parameters) c['webGl2:parameters'] = bundle.webGl2Parameters;
        if (bundle.webGl2ShaderPrecisionFormats) c['webGl2:shaderPrecisionFormats'] = bundle.webGl2ShaderPrecisionFormats;
      }
    } catch {}
  }
  if (fp.webrtcMode === 'disabled') c['webRtc:ipAddress'] = '';
  else if (fp.webrtcMode === 'altered') c['webRtc:localAddress'] = '192.168.1.' + (Math.floor(Math.random() * 254) + 1);
  if (fp.timezone) c['timezone'] = fp.timezone;
  if (fp.canvasNoise) { c['canvas:aaOffset'] = Math.floor(Math.random() * 101) - 50; c['canvas:aaCapOffset'] = true; }
  if (fp.audioNoise) {
    c['AudioContext:sampleRate'] = [44100, 48000, 96000][Math.floor(Math.random() * 3)];
    c['AudioContext:outputLatency'] = parseFloat((0.001 + Math.random() * 0.029).toFixed(6));
  }

  // ── Media devices ──────────────────────────────────────────────────
  // enumerateDevices() otherwise reports whatever hardware this machine
  // actually has, which has nothing to do with the profile's claimed OS.
  // A box with zero microphones and zero cameras is itself a signal, so
  // the default is a plain laptop.
  if (fp.mediaSpoof !== false) {
    const md = fp.mediaDevices || {};
    c['mediaDevices:enabled'] = true;
    c['mediaDevices:micros'] = Number.isFinite(md.micros) ? md.micros : 1;
    c['mediaDevices:webcams'] = Number.isFinite(md.webcams) ? md.webcams : 1;
    c['mediaDevices:speakers'] = Number.isFinite(md.speakers) ? md.speakers : 2;
  } else if (fp.audioNoise) {
    c['mediaDevices:enabled'] = true;
  }

  // ── Fonts ──────────────────────────────────────────────────────────
  // Font enumeration is one of the strongest signals there is: a profile
  // claiming macOS while exposing Segoe UI and Calibri is spotted
  // instantly. Report the font set that ships with the claimed OS
  // instead, and jitter text metrics with a per-profile seed so the
  // measurements are consistent across sessions but not shared between
  // profiles.
  if (fp.fontSpoof !== false) {
    const fonts = getFontsForOS(os);
    if (fonts.length) c['fonts'] = fonts;
    c['fonts:spacing_seed'] = Number.isFinite(fp.fontSpacingSeed)
      ? fp.fontSpacingSeed
      : Math.floor(Math.random() * 1000000);
  }
  if (fp.userAgent) c['headers.User-Agent'] = fp.userAgent;
  if (fp.language) c['headers.Accept-Language'] = `${fp.language},${fp.language.split('-')[0]};q=0.9,en;q=0.8`;
  return c;
}

function setEngineConfigFile(profileDir, env, configObj) {
  const configPath = path.join(profileDir, '.engine_config.json');
  fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');
  const json = JSON.stringify(configObj);
  const CHUNK_SIZE = 2047;
  for (const key of Object.keys(env)) {
    if (key.startsWith('CAMOU_CONFIG')) delete env[key];
  }
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    env[`CAMOU_CONFIG_${Math.floor(i / CHUNK_SIZE) + 1}`] = json.substring(i, i + CHUNK_SIZE);
  }
}

// ── Write user.js ────────────────────────────────────────────────────
function writeUserJs(profileDir, config) {
  const proxy = config?.proxy || {};
  const urls = config?.startupUrls || [];
  const restore = hasSavedSession(profileDir);
  // Google is the default for every new profile; the picker was
  // removed from the editor. Older profiles keep whatever they saved.
  const searchEngine = config?.searchEngine || 'Google';
  const prefs = [
    'user_pref("privacy.sanitize.sanitizeOnShutdown", false);',
    'user_pref("privacy.clearOnShutdown.cookies", false);',
    'user_pref("privacy.clearOnShutdown.sessions", false);',
    'user_pref("signon.rememberSignons", true);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("privacy.resistFingerprinting", false);',
    'user_pref("privacy.fingerprintingProtection", false);',
    'user_pref("webgl.disabled", false);',
    `user_pref("webgl.force-enabled", ${LAUNCH_SAFETY.forceWebGLPastBlocklist});`,
    'user_pref("webgl.enable-webgl2", true);',
    'user_pref("webgl.enable-debug-renderer-info", true);',
    'user_pref("webgl.forbid-software", false);',
    'user_pref("browser.tabs.warnOnClose", false);',
    // New tab = blank. This is what replaced the branded new-tab
    // extension: Firefox removed browser.newtab.url back in version 41,
    // so the page can't be pointed somewhere custom without an
    // extension — but it CAN be switched off entirely, which lands on a
    // blank tab. No Camoufox logo, no extension, and none of the
    // "Extension (...)" address bar marker that came with the old one.
    'user_pref("browser.newtabpage.enabled", false);',
    'user_pref("browser.newtabpage.activity-stream.feeds.topsites", false);',
    'user_pref("browser.startup.homepage", "about:blank");',
    'user_pref("browser.newtab.preload", false);',
    // 1 = draw the tab strip inside the title bar, so there is no
    // separate OS caption bar and the window reads as borderless. The
    // integer pref is the current one; the boolean is its
    // pre-Firefox-106 name, set too since Camoufox is a fork and it's
    // cheap to cover both.
    `user_pref("browser.tabs.inTitlebar", ${LAUNCH_SAFETY.borderlessWindow ? 1 : 0});`,
    `user_pref("browser.tabs.drawInTitlebar", ${LAUNCH_SAFETY.borderlessWindow});`,
    // Windows only. Firefox normally starts a small "launcher process"
    // that immediately spawns the real browser process and steps aside.
    // That extra hop is what made the PID we spawned die seconds after
    // launch, which the old code read as "the browser closed". Turning it
    // off keeps one process for the whole session. (The value is cached
    // per install, so it takes full effect from the second launch.)
    'user_pref("browser.launcherProcess.enabled", false);',
    'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);',
    // Firefox 67+ ignores chrome/icons/default/main-window.ico by
    // default — the feature was disabled outright for startup
    // performance (Mozilla bug 1553745), not just gated behind a
    // pref that defaults on. Without this, writeProfileWindowIcons()
    // writes a file Firefox never reads, and every profile keeps
    // showing Camoufox's own icon in the taskbar no matter what's on
    // disk. This is the actual fix for that; "windowIcon" — not the
    // "stylesheets" flag above — is the one that matters here.
    'user_pref("toolkit.legacyUserProfileCustomizations.windowIcon", true);',
    // Without this, Windows groups every MultiBrowse-launched window
    // under one taskbar button regardless of icon, since by default
    // Firefox groups by install location rather than profile — so
    // even a correct per-profile icon wouldn't show separately.
    'user_pref("taskbar.grouping.useprofile", true);',
    'user_pref("keyword.enabled", true);',
    'user_pref("browser.search.suggest.enabled", true);',
    'user_pref("browser.urlbar.suggest.searches", true);',
    'user_pref("browser.urlbar.showSearchSuggestionsFirst", true);',
    'user_pref("browser.search.separatePrivateDefault", false);',
    'user_pref("browser.search.region", "US");',
    // services.settings.server is deliberately NOT set here.
    //
    // A previous round pointed it at Mozilla's real endpoint, on the
    // theory that Camoufox blanking it was what killed the engine list.
    // It wasn't (see the LAUNCH_SAFETY comment above) — and setting it
    // has a real cost: it re-enables Remote Settings traffic to
    // firefox.settings.services.mozilla.com, which Camoufox blanked on
    // purpose. The engine list now comes from the copy packaged inside
    // omni.ja, so the pref can stay blank and the profile keeps its
    // no-phone-home guarantee.
    'user_pref("browser.search.update", true);',
    'user_pref("network.dns.disabled", false);',
    // keyword.enabled true + a working engine = typing a word searches.
    // Both halves are required; the pref alone does nothing without an
    // engine, which is what you were hitting.
    'user_pref("keyword.enabled", true);',
    // Only cosmetic (the text shown inside the empty URL bar). The
    // real default engine is pinned inside the patched engine config
    // (see mbFinalizeSearchConfig in searchEngineFix.cjs) rather than
    // through browser.search.defaultenginename, which modern Firefox
    // ignores — the default lives in search.json.mozlz4, not in prefs.
    `user_pref("browser.urlbar.placeholderName", "${searchEngine}");`,
    // false = single words like "gmail" go to the search engine instead
    // of being resolved as a hostname. Keep both of these false.
    'user_pref("browser.fixup.dns_first_for_single_words", false);',
    'user_pref("browser.fixup.alternate.enabled", false);',
    'user_pref("javascript.enabled", true);',
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("extensions.blocklist.enabled", false);',
    'user_pref("xpinstall.signatures.required", false);',
    'user_pref("browser.sessionhistory.max_entries", 50);',
    'user_pref("browser.sessionhistory.max_total_viewers", 0);',
    'user_pref("fission.bfcacheInParent", false);',
  ];
  if (restore) {
    prefs.push('user_pref("browser.startup.page", 3);');
  } else if (urls.length > 0) {
    prefs.push('user_pref("browser.startup.page", 1);');
    prefs.push(`user_pref("browser.startup.homepage", "${urls.join('|').replace(/"/g, '\\"')}");`);
  } else {
    prefs.push('user_pref("browser.startup.page", 1);');
    prefs.push('user_pref("browser.startup.homepage", "https://www.google.com");');
  }
  prefs.push('user_pref("browser.sessionstore.enabled", true);');
  prefs.push('user_pref("browser.sessionstore.resume_from_crash", true);');
  if (proxy.type && proxy.type !== 'none' && proxy.host) {
    prefs.push('user_pref("network.proxy.type", 1);');
    if (proxy.type === 'socks5') {
      prefs.push(`user_pref("network.proxy.socks", "${proxy.host}");`);
      prefs.push(`user_pref("network.proxy.socks_port", ${parseInt(proxy.port) || 1080});`);
      prefs.push('user_pref("network.proxy.socks_version", 5);');
    } else {
      prefs.push(`user_pref("network.proxy.http", "${proxy.host}");`);
      prefs.push(`user_pref("network.proxy.http_port", ${parseInt(proxy.port) || 8080});`);
      prefs.push(`user_pref("network.proxy.ssl", "${proxy.host}");`);
      prefs.push(`user_pref("network.proxy.ssl_port", ${parseInt(proxy.port) || 8080});`);
    }
  }
  fs.writeFileSync(path.join(profileDir, 'user.js'), prefs.join('\n'), 'utf8');
}

// ── Custom browser chrome theme ──────────────────────────────────────
// The whole look of the launched browser (tab strip, URL bar, menus,
// colours, profile badge) is generated in electron/browser-theme.cjs.
// Edit that file to change the design — nothing here needs to change.
function writeUserChrome(profileDir, config, iconPath) {
  return browserTheme.writeBrowserTheme(profileDir, config, iconPath || null);
}

// The day/night toggle extension (and its toolbar button) has been
// removed — it had the only visible presence of the three bundled
// extensions (a browser_action icon + an entry in about:addons).
//
// Nothing is installed into the launched browser anymore. search-fallback
// was the last one standing, and it's gone too now that the search
// service itself is repaired — see searchEngineFix.cjs. The launched
// profile ships with zero extensions.

// ── Search fallback extension — REMOVED ──────────────────────────────
// This used to install a WebExtension that watched for the bad
// http://<bareword>/ navigation and rewrote it into a real search URL.
// It worked, but it was a bandage over a broken search service: no
// suggestions, no engine picker, no keyword aliases, an extra entry in
// about:debugging, and one more thing making the profile look unlike a
// stock Firefox.
//
// searchEngineFix.cjs fixes the search service itself, so the extension
// has no job left. This tears down any copy an earlier build left
// behind — the profile directory outlives the app version, so simply
// not installing it is not enough.
const SEARCH_FALLBACK_EXTENSION_ID = 'search-fallback@multibrowse.local';

function removeSearchFallbackExtension(profileDir) {
  try {
    const pointer = path.join(profileDir, 'extensions', SEARCH_FALLBACK_EXTENSION_ID);
    const payload = path.join(profileDir, 'mb-extensions', 'search-fallback');
    let removed = false;
    for (const target of [pointer, payload]) {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed = true;
      }
    }
    if (removed) console.log('[MultiBrowse] Removed the old search-fallback extension');
  } catch (err) {
    console.error('[MultiBrowse] Could not remove search fallback extension:', err.message);
  }
}

// The branded new-tab extension has been removed. Firefox has had no
// pref-based way to set the new tab page since version 41, so a
// WebExtension was the only route to replacing Camoufox's own branded
// page — and that came with the "Extension (...)" marker Firefox stamps
// on any extension-provided page, which is shown by design and can't be
// switched off. Disabling the new tab page outright (see
// browser.newtabpage.enabled in writeUserJs) gets a plain blank tab
// instead: no Camoufox branding, no extension, no marker.

// ── Diagnostics: what does the engine actually say about search? ─────
// Dumps every line in the engine's own config files that mentions the
// settings server or search, so the next round of debugging is based on
// what's there rather than on guesses.
async function logSearchConfigDiagnostics(binPath) {
  const engineDir = camoufoxEngine.resourcesDirForBinary(binPath);
  const scanDirs = [engineDir, path.join(engineDir, 'defaults', 'pref'), path.join(engineDir, 'defaults', 'preferences'), path.join(engineDir, 'browser', 'defaults', 'preferences')];
  const hits = [];
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const file of await fsp.readdir(dir)) {
        if (!file.endsWith('.cfg') && !file.endsWith('.js')) continue;
        try {
          const content = await fsp.readFile(path.join(dir, file), 'utf8');
          for (const line of content.split('\n')) {
            if (/services\.settings|browser\.search|keyword\.enabled|browser\.fixup/.test(line)) {
              hits.push(`${file}: ${line.trim()}`);
            }
          }
        } catch {}
      }
    } catch {}
  }
  if (hits.length) console.log('[MultiBrowse] Engine search config:\n  ' + hits.join('\n  '));
  else console.log('[MultiBrowse] Engine search config: no matching prefs found in engine config files');
}

function writePoliciesJson(binPath, searchEngine) {
  const defaultEngine = searchEngine || 'Google';
  // NOTE: the "SearchEngines" policy is Enterprise/ESR-only. Camoufox is
  // built from a release Firefox, so it was silently ignored — while
  // still interfering with search-service startup. Firefox's built-in
  // engines (Google, DuckDuckGo, Bing...) work fine on their own, so we
  // only keep the policies that actually apply here.
  void defaultEngine;
  const policies = { policies: {
    OverrideFirstRunPage: '', OverridePostUpdatePage: '',
    DontCheckDefaultBrowser: true, NoDefaultBookmarks: true }};
  const policiesJson = JSON.stringify(policies, null, 2);
  // policies.json lives next to Firefox's other config files — Contents/
  // Resources on macOS, same folder as the binary everywhere else.
  const profileDistDir = path.join(camoufoxEngine.resourcesDirForBinary(binPath), 'distribution');
  if (!fs.existsSync(profileDistDir)) fs.mkdirSync(profileDistDir, { recursive: true });
  fs.writeFileSync(path.join(profileDistDir, 'policies.json'), policiesJson, 'utf8');
  const sharedBin = getNimbusBinPath();
  const sharedDistDir = sharedBin ? path.join(camoufoxEngine.resourcesDirForBinary(sharedBin), 'distribution') : null;
  if (sharedDistDir && sharedDistDir !== profileDistDir) {
    if (!fs.existsSync(sharedDistDir)) fs.mkdirSync(sharedDistDir, { recursive: true });
    fs.writeFileSync(path.join(sharedDistDir, 'policies.json'), policiesJson, 'utf8');
  }
}

// ── Per-profile icons ────────────────────────────────────────────────
//  Was: render an SVG with `sharp`, convert with `to-ico` — both native
//  modules that silently failed once packaged (see iconGen.cjs's own
//  header). Then: a hand-rolled bitmap font — technically packaging-safe,
//  but blocky at any size, which is why the badge looked pixelated and
//  didn't match the crisp text ProfileList.tsx renders for the same
//  label. profileIconRender.cjs renders the actual same markup through
//  Chromium itself, so what you see in the sidebar is what ships to the
//  tab bar and the taskbar.
const profileIconGen = require('./profileIconRender.cjs');
const { encodeIco } = require('./iconGen.cjs');

// ── App-level icon (public/icon.png) as a real .ico ────────────────────
//  For places that need MultiBrowse's own logo rather than a per-profile
//  badge — right now, just the shared engine copy before any profile has
//  claimed it. Built once and cached; nativeImage does the resizing, the
//  same well-tested path profileIconRender.cjs already uses.
let cachedAppIconIco = null;

function findAppIconPngPath() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}

async function getAppIconIco() {
  if (cachedAppIconIco) return cachedAppIconIco;
  const pngPath = findAppIconPngPath();
  if (!pngPath) return null;
  const master = nativeImage.createFromPath(pngPath);
  if (master.isEmpty()) return null;
  const sizes = [16, 32, 48, 256];
  const entries = sizes.map((size) => ({
    size,
    png: master.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  const ico = encodeIco(entries);
  const icoPath = path.join(app.getPath('userData'), 'app-icon.ico');
  await fsp.writeFile(icoPath, ico);
  cachedAppIconIco = icoPath;
  return icoPath;
}

const PROFILE_ICON_SIZES = [16, 32, 48, 128, 256];

// Rendering now spins up a real (if tiny, offscreen) Chromium window,
// which costs more than the old pure-JS bitmap draw — cheap once, but
// not something to redo on every single launch of a profile that hasn't
// changed. This cache file records what a profile's icon was last
// rendered FOR; a launch only re-renders when the label or color has
// actually changed since.
function getProfileIconMetaPath(iconDir, profileId) {
  return path.join(iconDir, `${profileId}.meta.json`);
}

async function createProfileIcon(profileId, config) {
  const iconDir = path.join(app.getPath('userData'), 'profile-icons');
  try {
    await fsp.mkdir(iconDir, { recursive: true });
    const label = profileIconGen.labelFromName(config?.name);
    const color = config?.color || '#e8d44d';

    const pngPath = path.join(iconDir, `${profileId}.png`);
    const icoPath = path.join(iconDir, `${profileId}.ico`);
    const sized = {};
    for (const size of PROFILE_ICON_SIZES) sized[size] = path.join(iconDir, `${profileId}-${size}.png`);

    const metaPath = getProfileIconMetaPath(iconDir, profileId);
    const wantMeta = JSON.stringify({ label, color });
    const filesExist = fs.existsSync(pngPath) && fs.existsSync(icoPath)
      && PROFILE_ICON_SIZES.every((s) => fs.existsSync(sized[s]));
    let haveMeta = null;
    try { haveMeta = fs.readFileSync(metaPath, 'utf8'); } catch {}
    if (filesExist && haveMeta === wantMeta) {
      return { png: pngPath, ico: icoPath, sized };
    }

    const { pngs, ico } = await profileIconGen.renderProfileIcon(label, color, PROFILE_ICON_SIZES);
    await fsp.writeFile(pngPath, pngs[256]);
    await fsp.writeFile(icoPath, ico);
    for (const size of PROFILE_ICON_SIZES) await fsp.writeFile(sized[size], pngs[size]);
    await fsp.writeFile(metaPath, wantMeta, 'utf8');

    return { png: pngPath, ico: icoPath, sized };
  } catch (err) {
    console.error('[MultiBrowse] Profile icon generation failed:', err.message);
    return null;
  }
}

// ── Per-profile WINDOW / taskbar icon ────────────────────────────────
//  Firefox has supported this since forever and it needs no extra
//  permissions: whatever lives in
//
//      <profile>/chrome/icons/default/main-window.ico        (Windows)
//      <profile>/chrome/icons/default/main-window<N>.png     (Linux)
//
//  replaces the browser's own window icon — which is what Windows shows
//  in the taskbar, in Alt-Tab and in the top-left corner of the window.
//
//  This is a better mechanism than the rcedit exe-icon patch that was
//  here before, because:
//    * it needs no external binary (rcedit.exe was being packed INSIDE
//      app.asar, where it can't be executed anyway)
//    * it applies per profile directory, so it can't get out of sync
//    * it works on Linux too
//
//  The rcedit patch is still attempted afterwards, since it additionally
//  fixes the icon Explorer shows for the copied .exe itself.
async function writeProfileWindowIcons(profileDir, icons) {
  if (!icons) return;
  try {
    const dir = path.join(profileDir, 'chrome', 'icons', 'default');
    await fsp.mkdir(dir, { recursive: true });
    if (icons.ico && fs.existsSync(icons.ico)) {
      await fsp.copyFile(icons.ico, path.join(dir, 'main-window.ico'));
    }
    for (const size of [16, 32, 48, 128]) {
      const src = icons.sized?.[size];
      if (src && fs.existsSync(src)) {
        await fsp.copyFile(src, path.join(dir, `main-window${size}.png`));
      }
    }
    console.log('[MultiBrowse] Window icon written to', dir);
  } catch (err) {
    console.error('[MultiBrowse] Could not write window icon:', err.message);
  }
}

function getProfileBinDir(profileId) {
  return path.join(app.getPath('userData'), 'nimbus-profiles', profileId, 'engine');
}

// Was a fixed list of Windows .exe names. Now delegates to the same
// layout-aware search used for the shared engine copy, so a profile's
// private copy resolves correctly on macOS (inside the .app bundle) and
// Linux too, not just Windows.
function getProfileBinPath(profileId) {
  return camoufoxEngine.locateBinary(getProfileBinDir(profileId));
}

// NOTE: this copies the whole engine folder (several hundred MB) the
// first time a profile is launched. It MUST stay async — the previous
// fs.cpSync version blocked Electron's main thread for seconds, which
// froze the entire UI (including the custom cursor) on every launch.
async function ensureProfileBinaryCopy(profileId) {
  const sharedBin = getNimbusBinPath();
  if (!sharedBin) throw new Error('Engine not installed');
  const sharedDir = readActiveEngineDir();
  const profileBinDir = getProfileBinDir(profileId);
  const existing = getProfileBinPath(profileId);
  if (existing && fs.existsSync(existing)) return existing;
  // Patch the SHARED copy before duplicating it, so every profile made
  // from here on inherits an already-fixed engine and the per-profile
  // patch on launch is just a marker-file check. Patching after the copy
  // instead would rewrite a 45 MB omni.ja once per profile.
  await applySearchFixToEngine(sharedBin);
  await fsp.mkdir(profileBinDir, { recursive: true });
  await fsp.cp(sharedDir, profileBinDir, { recursive: true });
  const binPath = getProfileBinPath(profileId);
  // Zip extraction and directory copies don't reliably carry the
  // executable bit across — this is what makes launch fail silently
  // with EACCES on the profile's private copy specifically, even when
  // the shared copy launches fine.
  camoufoxEngine.ensureExecutable(binPath);
  return binPath;
}

// Gives a profile its own launcher with its own icon, without touching a
// single byte of the .exe — the icon lives inside the .lnk, not in the
// binary's resource section. This is what patchExeIcon() was for, minus
// the antivirus problem: writing a shortcut is an ordinary file write,
// while rewriting a PE resource section at runtime is the signature of a
// resource-patching dropper.
//
// Side benefit: the user gets something they can pin to the taskbar or
// Start menu that opens one specific profile.
//
// Windows only. macOS uses the .app bundle's own icon and Linux uses
// .desktop files, neither of which has this problem in the first place.
function writeProfileShortcut(profileDir, profileExe, icoPath, profileName) {
  if (process.platform !== 'win32') return false;
  if (!icoPath || !fs.existsSync(icoPath)) return false;
  if (!profileExe || !fs.existsSync(profileExe)) return false;
  try {
    // Windows rejects these in filenames; a profile called "Client: A/B"
    // would otherwise throw and take the launch down with it.
    const safeName = String(profileName || 'Profile').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\.+$/, '').trim() || 'Profile';
    const linkPath = path.join(profileDir, `${safeName}.lnk`);
    // 'update' would fail when the .lnk doesn't exist yet; 'create'
    // overwrites an existing one, which is what we want on rename.
    const ok = shell.writeShortcutLink(linkPath, 'create', {
      target: profileExe,
      icon: icoPath,
      iconIndex: 0,
      description: `Launch the ${safeName} browser profile`,
      cwd: path.dirname(profileExe),
    });
    if (ok) console.log('[MultiBrowse] Shortcut written:', linkPath);
    else console.warn('[MultiBrowse] Shortcut write returned false for', linkPath);
    return ok;
  } catch (err) {
    // An icon is not worth failing a launch over.
    console.warn('[MultiBrowse] Could not write profile shortcut:', err.message);
    return false;
  }
}

// Rewriting the resource section of an .exe on disk, at runtime, with a
// bundled third-party tool is one of the most reliable ways to get an app
// quarantined: it is exactly what a resource-patching dropper does, and
// heuristic engines (Defender's Wacatac/Sabsik family especially) score it
// heavily. It is also redundant here — writeProfileWindowIcons() already
// sets the taskbar, Alt-Tab and window icon for each profile through
// Firefox's own chrome/icons/default mechanism, on every platform. All
// this adds is the icon Explorer draws on the copied .exe file itself.
//
// So it is off unless someone deliberately turns it on:
//   set MULTIBROWSE_PATCH_EXE_ICON=1
//
// If you re-enable it, ship a signed rcedit.exe and expect to submit
// false-positive reports (docs/ANTIVIRUS.md).
const EXE_ICON_PATCH_ENABLED = process.env.MULTIBROWSE_PATCH_EXE_ICON === '1';

function patchExeIcon(exePath, icoPath) {
  if (!EXE_ICON_PATCH_ENABLED) return Promise.resolve(false);
  // rcedit only exists for Windows PE executables — nothing to do on
  // macOS or Linux, where the per-profile icon comes from
  // writeProfileWindowIcons() instead.
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    const candidates = [
      path.join(__dirname, 'rcedit.exe'),
      path.join(__dirname, '..', 'rcedit.exe'),
      path.join(process.resourcesPath || '', 'rcedit.exe'),
      path.join(app.getPath('userData'), 'rcedit.exe'),
    ];
    let rcedit = null;
    for (const p of candidates) { try { if (fs.existsSync(p)) { rcedit = p; break; } } catch {} }
    if (!rcedit) {
      console.warn('[MultiBrowse] rcedit.exe not found — skipping exe icon patch. Checked:', candidates.join(', '));
      return resolve(false);
    }
    if (!icoPath || !fs.existsSync(icoPath)) {
      console.warn('[MultiBrowse] No .ico to patch in for', exePath);
      return resolve(false);
    }
    execFile(rcedit, [exePath, '--set-icon', icoPath], { windowsHide: true }, (err) => {
      if (err) console.warn('[MultiBrowse] rcedit failed for', exePath, '-', err.message);
      resolve(!err);
    });
  });
}

async function patchCamoufoxCfg(binPath) {
  const engineDir = camoufoxEngine.resourcesDirForBinary(binPath);
  const patches = [
    ['webgl.disabled', 'false'],
    ['webgl.force-enabled', String(LAUNCH_SAFETY.forceWebGLPastBlocklist)],
    ['privacy.resistFingerprinting', 'false'],
    ['privacy.fingerprintingProtection', 'false'],
    ['toolkit.legacyUserProfileCustomizations.stylesheets', 'true'],
    ['toolkit.legacyUserProfileCustomizations.windowIcon', 'true'],
  ];
  const scanDirs = [engineDir, path.join(engineDir, 'defaults', 'pref'), path.join(engineDir, 'defaults', 'preferences'), path.join(engineDir, 'browser', 'defaults', 'preferences')];
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const file of await fsp.readdir(dir)) {
        if (!file.endsWith('.cfg') && !file.endsWith('.js')) continue;
        const filePath = path.join(dir, file);
        try {
          let content = await fsp.readFile(filePath, 'utf8');
          const original = content;
          for (const [prefName, desiredValue] of patches) {
            const escaped = prefName.replace(/\./g, '\\.');
            content = content.replace(
              new RegExp(`((pref|defaultPref|lockPref)\\s*\\(\\s*["']${escaped}["']\\s*,\\s*)(true|false)(\\s*\\))`, 'g'),
              (match, prefix, fn, val, suffix) => val !== desiredValue ? `${prefix}${desiredValue}${suffix}` : match
            );
          }

          if (content !== original) await fsp.writeFile(filePath, content, 'utf8');
        } catch {}
      }
    } catch {}
  }
}

// ── One-time search repair ───────────────────────────────────────────
// This is why search was STILL broken after the last fix. Removing a
// line from user.js does not undo it: on every startup Firefox copies
// user.js values into the profile's prefs.js, and they stay there
// forever afterwards. So "browser.search.defaultenginename" was still
// sitting in prefs.js pointing at an engine ID that doesn't exist,
// leaving the profile with no resolvable default engine — which is
// exactly why typing "gmail" went to http://gmail.
//
// This strips those specific lines out of prefs.js and clears the
// search index once, then drops a marker so it never runs again.
const STALE_SEARCH_PREFS = [
  'browser.search.defaultenginename',
  'browser.search.selectedEngine',
  'browser.search.order.1',
  'browser.urlbar.placeholderName.private',
];

// Bump this number whenever the repair itself changes. Profiles that
// already ran an OLDER repair will then run the new one. Without this,
// the marker from a previous build permanently blocks later fixes --
// which is exactly what happened with the services.settings.server fix.
const SEARCH_REPAIR_VERSION = 4;

async function repairSearchPrefs(profileDir) {
  const marker = path.join(profileDir, '.mb-search-repaired');
  try {
    if (fs.existsSync(marker)) {
      const done = await fsp.readFile(marker, 'utf8').catch(() => '');
      if (done.includes(`v${SEARCH_REPAIR_VERSION}`)) return false;
    }

    const prefsPath = path.join(profileDir, 'prefs.js');
    if (fs.existsSync(prefsPath)) {
      const original = await fsp.readFile(prefsPath, 'utf8');
      const cleaned = original
        .split('\n')
        .filter((line) => !STALE_SEARCH_PREFS.some((k) => line.includes(`"${k}"`)))
        .join('\n');
      if (cleaned !== original) {
        await fsp.writeFile(prefsPath, cleaned, 'utf8');
        console.log('[MultiBrowse] Cleared stale search prefs from prefs.js');
      }
    }

    // Force one clean rebuild of the engine list now that nothing is
    // pointing at a bogus engine.
    for (const f of ['search.json.mozlz4', 'search.json', 'search-metadata.json', 'search.sqlite']) {
      try { await fsp.unlink(path.join(profileDir, f)); } catch {}
    }

    // The search engine list itself is a Remote Settings collection. It
    // was cached while services.settings.server was blank, so the cache
    // holds the broken/empty copy that produced
    //   "JSON error: missing field `recordType`"
    // Dropping it forces a clean reload from the packaged dump.
    // 'settings'      — the Remote Settings cache, written while the
    //                   engine list was empty.
    // 'startupCache'  — Firefox caches compiled JS from omni.ja here,
    //                   and searchEngineFix.cjs rewrites two modules
    //                   inside it. Dropping the cache guarantees the
    //                   patched code is what actually runs.
    for (const dir of ['settings', 'startupCache']) {
      try { await fsp.rm(path.join(profileDir, dir), { recursive: true, force: true }); } catch {}
    }

    await fsp.writeFile(marker, `v${SEARCH_REPAIR_VERSION} ${new Date().toISOString()}`, 'utf8');
    console.log(`[MultiBrowse] Search repair v${SEARCH_REPAIR_VERSION} applied`);
    return true;
  } catch (err) {
    console.error('[MultiBrowse] Search repair failed:', err.message);
    return false;
  }
}

// ── Browser logging + crash detection ────────────────────────────────
function getBrowserLogPath(profileId) {
  return path.join(app.getPath('userData'), 'logs', `${profileId}.log`);
}

// Firefox writes a .dmp minidump here whenever a process crashes.
async function reportCrashDumps(profileId, profileDir) {
  try {
    const pending = path.join(profileDir, 'crashes', 'pending');
    if (!fs.existsSync(pending)) return;
    const dumps = (await fsp.readdir(pending)).filter((f) => f.endsWith('.dmp'));
    if (dumps.length === 0) return;
    console.log(
      `[MultiBrowse] ${dumps.length} crash dump(s) for ${profileId} in ${pending}\n` +
      `[MultiBrowse] Newest: ${dumps[dumps.length - 1]}`
    );
  } catch {}
}
// ═════════════════════════════════════════════════════════════════════
//  PROCESS TRACKING — why Start/Stop was out of sync
// ═════════════════════════════════════════════════════════════════════
//  Two separate bugs were at work.
//
//  1. STOP DIDN'T KILL ANYTHING.
//     The old code ran `process.kill(-entry.proc.pid)`. A negative PID
//     means "the whole process group" — and process groups are a POSIX
//     concept. On Windows that call just throws, and the catch block
//     swallowed it. `entry.proc.kill()` then only signals the one
//     process we spawned, which is not necessarily the browser (see 2).
//     So the button flipped back to green while the browser stayed open.
//
//  2. THE PROCESS WE SPAWN ISN'T ALWAYS THE PROCESS THAT LIVES.
//     Firefox re-executes itself during startup, so the PID we hold can
//     exit seconds after launch while the browser is perfectly alive.
//     `proc.on('exit')` then fired immediately and the UI was told the
//     profile had stopped — button back to green, browser still open.
//     Closing the browser by its own X sent no event at all.
//
//  THE FIX
//  Stop trusting the spawn handle as the source of truth. Every profile
//  already gets its own private copy of the engine at
//      <userData>/nimbus-profiles/<profileId>/engine/camoufox.exe
//  so the executable path is a unique, reliable fingerprint for "is this
//  profile running". One cheap process scan every few seconds answers
//  that for every profile at once, and the answer is pushed to the UI.
//  Stop kills the whole process tree by PID, then verifies with the same
//  scan before reporting success.
// ═════════════════════════════════════════════════════════════════════

// How often to reconcile the UI with reality.
const PROCESS_POLL_MS = 2500;
// A freshly launched profile is treated as running even if the scan
// hasn't spotted it yet — engine startup can take a while on a cold disk.
// This only applies BEFORE the first confirmed sighting; once the scan has
// seen the profile, its disappearance is believed immediately.
const LAUNCH_GRACE_MS = 20000;

let pollTimer = null;
let lastKnownActive = new Set();

// Remembers where a profile's data lives so the cloud sync can still run
// after its process is gone.
const stoppedProfileMeta = new Map();

function quotePs(str) {
  return String(str).replace(/'/g, "''");
}

function runCommand(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => resolve(err && !stdout ? '' : String(stdout || '')));
    } catch { resolve(''); }
  });
}

/**
 * Scans the OS process table once and returns a map of
 *   profileId -> [pid, pid, ...]
 * for every profile whose private engine copy is currently running.
 */
async function scanRunningProfiles() {
  const root = getNimbusProfilesDir();
  const result = new Map();
  const add = (profileId, pid) => {
    if (!profileId || !Number.isFinite(pid)) return;
    if (!result.has(profileId)) result.set(profileId, []);
    result.get(profileId).push(pid);
  };
  // Windows reports paths with whatever casing the filesystem stored, so
  // the folder name we pull out of a path is matched back against the
  // real directory listing rather than used verbatim. Otherwise a
  // case difference would produce a profile ID the renderer never
  // recognises, and the button would stay stuck.
  let knownIds = [];
  try { knownIds = fs.readdirSync(root); } catch {}
  const canonicalId = (raw) => {
    if (!raw) return null;
    const exact = knownIds.find((id) => id === raw);
    if (exact) return exact;
    const ci = knownIds.find((id) => id.toLowerCase() === raw.toLowerCase());
    return ci || raw;
  };

  // Everything under <root>/<profileId>/engine/... belongs to that profile.
  const idFromPath = (execPath) => {
    const norm = String(execPath).replace(/\\/g, '/');
    const base = root.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
    if (!norm.toLowerCase().startsWith(base.toLowerCase())) return null;
    return canonicalId(norm.slice(base.length).split('/')[0] || null);
  };

  try {
    if (process.platform === 'win32') {
      // Get-CimInstance is the supported replacement for wmic, which has
      // been removed from recent Windows builds.
      // StartsWith rather than -like: -like treats [ and ] as wildcard
      // syntax, which a path containing them would silently break.
      const script =
        `$root = '${quotePs(root)}'; ` +
        `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ` +
        `Where-Object { $_.ExecutablePath -and ` +
        `$_.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } | ` +
        `ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)" }`;
      const out = await runCommand('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
      for (const line of out.split(/\r?\n/)) {
        const idx = line.indexOf('|');
        if (idx === -1) continue;
        add(idFromPath(line.slice(idx + 1).trim()), parseInt(line.slice(0, idx), 10));
      }
    } else {
      const out = await runCommand('ps', ['-A', '-o', 'pid=,args=']);
      for (const line of out.split(/\r?\n/)) {
        const m = /^\s*(\d+)\s+(.*)$/.exec(line);
        if (!m) continue;
        if (!m[2].includes(root)) continue;
        const hit = m[2].indexOf(root);
        add(idFromPath(m[2].slice(hit).split(/\s+/)[0]), parseInt(m[1], 10));
      }
    }
  } catch (err) {
    console.error('[MultiBrowse] Process scan failed:', err.message);
  }
  return result;
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code === 'EPERM'; } // exists, we just can't signal it
}

/** Kills a PID and everything it spawned. */
async function killProcessTree(pid) {
  if (!Number.isFinite(pid)) return;
  if (process.platform === 'win32') {
    // /T = tree, /F = force. This is the only reliable way on Windows.
    await runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
  await new Promise((r) => setTimeout(r, 1200));
  if (isPidAlive(pid)) {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

/** The authoritative list of profile IDs that are running right now. */
async function getActiveProfileIds() {
  const scanned = await scanRunningProfiles();
  const active = new Set(scanned.keys());
  for (const [profileId, entry] of activeProfiles) {
    if (active.has(profileId)) { entry.confirmed = true; continue; }
    // Once the scan has confirmed a profile, trust the scan: it vanishing
    // means the user closed the browser, and the button must go green.
    if (entry.confirmed) continue;
    // Before that first sighting, hold the row as running so a slow start
    // doesn't make the button flicker back and forth.
    const young = Date.now() - (entry.startedAt || 0) < LAUNCH_GRACE_MS;
    if (young || isPidAlive(entry.pid)) active.add(profileId);
  }
  // Forget bookkeeping for anything that is definitely gone.
  for (const profileId of Array.from(activeProfiles.keys())) {
    if (!active.has(profileId)) activeProfiles.delete(profileId);
  }
  return active;
}

function broadcast(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  } catch {}
}

/**
 * Compares reality against the last state we told the renderer about and
 * emits only what changed, plus the full list so the UI can hard-sync.
 */
async function reconcileActiveProfiles() {
  const active = await getActiveProfileIds();

  for (const profileId of lastKnownActive) {
    if (active.has(profileId)) continue;
    console.log('[MultiBrowse] Profile stopped:', profileId);
    broadcast('browser-profile-stopped', profileId);
    broadcast('camoufox-profile-stopped', profileId); // legacy channel name
    const entry = stoppedProfileMeta.get(profileId);
    if (entry) {
      stoppedProfileMeta.delete(profileId);
      setTimeout(() => {
        syncProfileDirToCloud(profileId, entry.name, entry.dir, authToken).catch(() => {});
      }, 2000);
    }
  }
  for (const profileId of active) {
    if (!lastKnownActive.has(profileId)) {
      console.log('[MultiBrowse] Profile running:', profileId);
      broadcast('browser-profile-started', profileId);
    }
  }

  lastKnownActive = active;
  broadcast('browser-active-changed', Array.from(active));
  return active;
}

function startProcessPolling() {
  if (pollTimer) return;
  const tick = () => { reconcileActiveProfiles().catch(() => {}); };
  pollTimer = setInterval(tick, PROCESS_POLL_MS);
  tick();
}

function stopProcessPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** Terminates every process belonging to a profile. Returns true if gone. */
async function stopProfile(profileId) {
  const pids = new Set();
  const entry = activeProfiles.get(profileId);
  if (entry?.pid) pids.add(entry.pid);

  const scanned = await scanRunningProfiles();
  for (const pid of scanned.get(profileId) || []) pids.add(pid);

  for (const pid of pids) await killProcessTree(pid);

  activeProfiles.delete(profileId);

  // Verify rather than assume. If anything survived, one more pass.
  await new Promise((r) => setTimeout(r, 500));
  let survivors = (await scanRunningProfiles()).get(profileId) || [];
  if (survivors.length) {
    for (const pid of survivors) await killProcessTree(pid);
    await new Promise((r) => setTimeout(r, 500));
    survivors = (await scanRunningProfiles()).get(profileId) || [];
  }

  const stillRunning = survivors.length > 0;
  if (stillRunning) console.warn(`[MultiBrowse] ${profileId} survived the kill:`, survivors);
  lastKnownActive.delete(profileId);
  broadcast('browser-profile-stopped', profileId);
  broadcast('camoufox-profile-stopped', profileId);
  broadcast('browser-active-changed', Array.from(lastKnownActive));

  const meta = stoppedProfileMeta.get(profileId);
  if (meta) {
    stoppedProfileMeta.delete(profileId);
    setTimeout(() => {
      syncProfileDirToCloud(profileId, meta.name, meta.dir, authToken).catch(() => {});
    }, 2000);
  }
  return !stillRunning;
}

async function launchNimbus(profileId, config) {
  if (!isNimbusInstalled()) await downloadNimbusEngine();

  const profileExe = await ensureProfileBinaryCopy(profileId);
  if (!profileExe || !fs.existsSync(profileExe)) throw new Error('Engine not found');

  const profileIcon = await createProfileIcon(profileId, config);
  if (profileIcon?.ico) await patchExeIcon(profileExe, profileIcon.ico);

  const binPath = profileExe;
  const profileDir = path.join(getNimbusProfilesDir(), profileId);
  const isNewProfile = !fs.existsSync(profileDir);
  if (isNewProfile) await fsp.mkdir(profileDir, { recursive: true });
  await syncProfileDirFromCloudIfNewer(profileId, config?.name || 'Profile', profileDir, authToken);

  // The tab-bar badge renders at ~18 CSS px, so hand it the 128px variant
  // rather than the 256px master — less downscaling, crisper edges on a
  // HiDPI display. Falls back to the master if that variant is missing.
  const badgeIconPath = profileIcon?.sized?.[128] || profileIcon?.png || null;
  await writeUserChrome(profileDir, config, badgeIconPath);
  // Replaces the Camoufox logo in the taskbar / Alt-Tab / window corner
  // with this profile's badge.
  await writeProfileWindowIcons(profileDir, profileIcon);
  // Explorer / Start-menu / pin-to-taskbar icon for this profile. The
  // window and taskbar icons above come from Firefox reading
  // chrome/icons/default; this covers the file the user can click.
  writeProfileShortcut(profileDir, binPath, profileIcon?.ico, config?.name);
  writeUserJs(profileDir, config);
  writePoliciesJson(binPath, config?.searchEngine);
  removeSearchFallbackExtension(profileDir);
  await patchCamoufoxCfg(binPath);
  // Firefox caches compiled JS from omni.ja in <profile>/startupCache.
  // If the patch just rewrote two modules inside omni.ja, that cache is
  // holding the OLD code — drop it so the fixed code is what runs. Only
  // on the launch where something actually changed; it's rebuilt on the
  // next start, so throwing it away every time would just cost startup
  // time for nothing.
  if (await applySearchFixToEngine(binPath, config?.searchEngine)) {
    try { await fsp.rm(path.join(profileDir, 'startupCache'), { recursive: true, force: true }); } catch {}
  }
  await logSearchConfigDiagnostics(binPath);
  // Strips the bad autoconfig block an earlier build injected into
  // camoufox.cfg. That block was crashing the browser at startup.
  await browserTheme.applyThemeLoader(binPath);
  console.log('[MultiBrowse] Theme written to', path.join(profileDir, 'chrome', 'userChrome.css'));
  await repairSearchPrefs(profileDir);

  // The search index is only cleared for a brand-new profile. Deleting
  // it on EVERY launch forced Firefox to rebuild its engine list each
  // time, and when that rebuild failed there was no default engine at
  // all — which is why typing "gmail" navigated to http://gmail
  // instead of searching.
  if (isNewProfile) {
    for (const f of ['search.json.mozlz4', 'search.json', 'search-metadata.json']) {
      try { await fsp.unlink(path.join(profileDir, f)); } catch {}
    }
  }

  const display = screen.getPrimaryDisplay();
  const workArea = display?.workAreaSize || { width: 1440, height: 900 };
  // The log showed Camoufox rejecting these:
  //   "Warning: unrecognized command line flag" "-width" / "-height"
  // They never did anything, so they're gone. Window size comes from the
  // engine config instead.
  void workArea;
  const args = ['-profile', profileDir, '-no-remote'];

  const env = { ...process.env };
  const fp = config?.fingerprint || {};
  if (fp.timezone) env.TZ = fp.timezone;

  const engineConfig = buildEngineConfig(config);
  setEngineConfigFile(profileDir, env, engineConfig);

  console.log('[MultiBrowse] Launching for', profileId);

  // Launch with stdout/stderr captured to a log file so crashes leave
  // evidence behind instead of vanishing silently.
  let stdio = 'ignore';
  let logPath = null;
  if (LAUNCH_SAFETY.captureBrowserLogs) {
    try {
      logPath = getBrowserLogPath(profileId);
      await fsp.mkdir(path.dirname(logPath), { recursive: true });
      const logFd = fs.openSync(logPath, 'w');
      stdio = ['ignore', logFd, logFd];
      console.log('[MultiBrowse] Browser log:', logPath);
    } catch (err) {
      console.error('[MultiBrowse] Could not open log file:', err.message);
    }
  }

  const proc = spawn(binPath, args, { detached: true, env, stdio, windowsHide: false });

  proc.on('error', (err) => {
    console.error(`[MultiBrowse] Failed to start ${profileId}:`, err.message);
  });

  // NOTE: this handler no longer decides whether the profile is running.
  // Firefox re-executes itself during startup, so this PID can exit while
  // the browser is very much alive — which is what made the Stop button
  // flip back to green a second after launch. It now only logs. The
  // authoritative answer comes from reconcileActiveProfiles().
  proc.on('exit', (code, signal) => {
    if (code !== 0 || signal) {
      console.log(`[MultiBrowse] ${profileId} launcher PID exited — code=${code} signal=${signal}`);
      if (logPath) console.log('[MultiBrowse] See log:', logPath);
      reportCrashDumps(profileId, profileDir);
    }
    // Give the real browser process a moment to appear, then re-check.
    setTimeout(() => { reconcileActiveProfiles().catch(() => {}); }, 1500);
  });

  activeProfiles.set(profileId, {
    proc,
    pid: proc.pid,
    config,
    profileDir,
    startedAt: Date.now(),
  });
  stoppedProfileMeta.set(profileId, { name: config?.name || 'Profile', dir: profileDir });

  // Tell the UI immediately, then let the poller confirm.
  lastKnownActive.add(profileId);
  broadcast('browser-profile-started', profileId);
  broadcast('browser-active-changed', Array.from(lastKnownActive));
  startProcessPolling();
  return true;
}

// ── MultiBrowse app window ───────────────────────────────────────────
function getIconPath() {
  // resourcesPath first: in a packaged build everything under __dirname
  // lives inside app.asar, and some native icon APIs cannot read from
  // there. electron-builder copies public/icon.png to resources/icon.png.
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(path.dirname(app.getPath('exe')), 'resources', 'icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../public/icon.png'),
  ];
  for (const p of candidates) { try { if (p && fs.existsSync(p)) return p; } catch {} }
  return null;
}

function createWindow() {
  const iconPath = getIconPath();
  const opts = { width: 1280, height: 800, minWidth: 1024, minHeight: 600, frame: false, titleBarStyle: 'hidden', backgroundColor: '#0a0a0f', show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.cjs') } };
  if (iconPath) opts.icon = iconPath;
  mainWindow = new BrowserWindow(opts);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (iconPath) { try { tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })); tray.setToolTip('MultiBrowse'); tray.on('click', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } }); } catch {} }
  if (iconPath && process.platform === 'win32') { try { mainWindow.setIcon(nativeImage.createFromPath(iconPath)); } catch {} }
  if (process.env.NODE_ENV === 'development') mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
  // Keeps the Start/Stop buttons honest: reconciles the UI against the
  // real process table every few seconds, so closing a browser with its
  // own X button turns the button back to green without the user having
  // to do anything.
  startProcessPolling();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => { stopProcessPolling(); if (tray) tray.destroy(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => stopProcessPolling());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC ──────────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.on('window-close', () => mainWindow?.close());

let authToken = loadAuthTokenFromDisk();

ipcMain.handle('auth-set-token', (_, token) => { authToken = token; if (token) saveAuthTokenToDisk(token); });
ipcMain.handle('auth-get-token', () => authToken || loadAuthTokenFromDisk());
ipcMain.handle('auth-clear-token', () => { authToken = null; clearAuthTokenFromDisk(); });

ipcMain.handle('browser-check-installed', () => isNimbusInstalled());
ipcMain.handle('browser-launch', async (_, profileId, config) => {
  try { await launchNimbus(profileId, config); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('browser-stop', async (_, profileId) => {
  try { return await stopProfile(profileId); }
  catch (err) { console.error('[MultiBrowse] Stop failed:', err.message); return false; }
});
// Returns what is ACTUALLY running, not what we think we launched.
ipcMain.handle('browser-list-active', async () => {
  try { return Array.from(await getActiveProfileIds()); }
  catch { return Array.from(activeProfiles.keys()); }
});
ipcMain.handle('browser-is-running', async (_, profileId) => {
  try { return (await getActiveProfileIds()).has(profileId); } catch { return false; }
});
ipcMain.handle('browser-stop-all', async () => {
  const ids = Array.from(await getActiveProfileIds());
  for (const id of ids) { try { await stopProfile(id); } catch {} }
  return ids.length;
});
ipcMain.handle('browser-download', async () => {
  try { await downloadNimbusEngine(); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.on('app-quit', () => app.quit());
