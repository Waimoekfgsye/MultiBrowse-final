// ─────────────────────────────────────────────────────────────────────
//  MultiBrowse — Camoufox engine resolver
// ─────────────────────────────────────────────────────────────────────
//  WHY THIS FILE EXISTS
//
//  The previous code had the engine hard-pinned:
//
//      const NIMBUS_ZIP = 'camoufox-152.0.4-beta.27-win.x86_64.zip';
//      const NIMBUS_URL = 'https://github.com/daijro/camoufox/releases/
//                           download/v152.0.4-beta.27/camoufox-152.0.4-
//                           beta.27-win.x86_64.zip';
//
//  That's ONE specific release, for ONE specific platform (Windows),
//  frozen at whatever version happened to be current when it was
//  written. Two problems follow from that:
//
//    1. No macOS or Linux user could ever install the engine — there is
//       no win.x86_64 binary to run on those OSes.
//    2. Every Windows user is stuck on that exact beta forever, missing
//       every fix daijro ships afterwards, until someone edits this
//       constant by hand and cuts a new MultiBrowse release.
//
//  This module replaces the constant with a live lookup: it asks
//  GitHub for daijro/camoufox's latest release, picks whichever asset
//  matches the machine MultiBrowse is running on, and hands back a
//  download URL. Call it every time you're about to install the engine
//  and you always get whatever is current — no code change needed when
//  daijro cuts a new build.
//
//  Release asset naming (confirmed against the actual releases page):
//      camoufox-<version>-<release>-<platform>.<arch>.zip
//      e.g. camoufox-152.0.4-beta.28-win.x86_64.zip
//           camoufox-152.0.4-beta.28-lin.x86_64.zip
//           camoufox-152.0.4-beta.28-mac.arm64.zip
//  platform: win | lin | mac      arch: x86_64 | arm64 | i686
// ─────────────────────────────────────────────────────────────────────

const REPO_API = 'https://api.github.com/repos/daijro/camoufox/releases/latest';
// Anything under 6 hours old is considered fresh enough — this exists
// purely to stay well under GitHub's 60 requests/hour unauthenticated
// rate limit, not because the data goes stale that fast.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** process.platform -> the token camoufox uses in its asset names. */
function platformToken() {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'lin'; // linux, freebsd, etc. all get the Linux build
}

/** process.arch -> the token camoufox uses in its asset names. */
function archToken() {
  const map = { x64: 'x86_64', arm64: 'arm64', ia32: 'i686' };
  return map[process.arch] || 'x86_64';
}

/**
 * Picks the asset matching this machine out of a release's asset list.
 * Falls back from arm64 to x86_64 on mac (Rosetta 2 runs x86_64 fine)
 * since not every release ships a native Apple Silicon build.
 */
function pickAsset(assets, platform, arch) {
  const suffix = (a) => `-${platform}.${a}.zip`;
  let asset = assets.find((a) => a.name.endsWith(suffix(arch)));
  let usedArch = arch;
  let rosetta = false;
  if (!asset && platform === 'mac' && arch === 'arm64') {
    asset = assets.find((a) => a.name.endsWith(suffix('x86_64')));
    usedArch = 'x86_64';
    rosetta = !!asset;
  }
  if (!asset) return null;
  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    arch: usedArch,
    viaRosetta: rosetta,
  };
}

/**
 * Fetches daijro/camoufox's latest release from the GitHub API and
 * caches it on disk so repeated "is the engine installed" checks
 * don't re-hit the network (and the rate limit) every time.
 *
 * @param {string} cacheFile absolute path to a JSON cache file
 * @param {boolean} force skip the cache and hit the network
 */
async function fetchLatestRelease(cacheFile, force = false) {
  const fs = require('fs');
  if (!force) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached;
      }
    } catch {} // no cache yet, or it's corrupt — fetch fresh
  }

  const res = await fetch(REPO_API, {
    headers: {
      'User-Agent': 'MultiBrowse-App',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    // A stale cache is better than nothing if GitHub is rate-limiting
    // or briefly unreachable.
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.warn(`[MultiBrowse] GitHub API returned ${res.status}; using cached release info from`, new Date(cached.fetchedAt).toISOString());
      return cached;
    } catch {}
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub is temporarily rate-limiting this connection. Wait a few minutes and try again.');
    }
    throw new Error(`Could not reach GitHub to check the latest Camoufox release (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const result = {
    fetchedAt: Date.now(),
    tag: data.tag_name,
    assets: (data.assets || []).map((a) => ({
      name: a.name,
      browser_download_url: a.browser_download_url,
      size: a.size,
    })),
  };
  try { fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8'); } catch {}
  return result;
}

/**
 * Resolves the download for whatever Camoufox build matches this
 * machine, always against the CURRENT latest release.
 *
 * @param {string} cacheFile
 * @param {boolean} force
 * @returns {{ tag: string, asset: { name, url, size, arch, viaRosetta } }}
 */
async function resolveLatestEngine(cacheFile, force = false) {
  const release = await fetchLatestRelease(cacheFile, force);
  const platform = platformToken();
  const arch = archToken();
  const asset = pickAsset(release.assets, platform, arch);
  if (!asset) {
    const have = release.assets.map((a) => a.name).join(', ') || '(none)';
    throw new Error(
      `No Camoufox build for ${platform}.${arch} in release ${release.tag}. ` +
      `Assets available: ${have}`
    );
  }
  return { tag: release.tag, asset };
}

// ═════════════════════════════════════════════════════════════════════
//  Locating the right executable inside an extracted engine folder
// ═════════════════════════════════════════════════════════════════════
//  Windows and Linux releases put the binary directly at the top level.
//  macOS releases ship an app bundle (Camoufox.app), with the real
//  executable nested at Contents/MacOS/<name>. This walks the extracted
//  folder looking for whichever shape is actually there, rather than
//  assuming one fixed layout — release packaging has changed before and
//  will again.

const path = require('path');
const fs = require('fs');

const WIN_NAMES = ['camoufox.exe', 'Camoufox.exe', 'nimbus.exe', 'Nimbus.exe', 'firefox.exe'];
const UNIX_NAMES = ['camoufox', 'camoufox-bin', 'firefox', 'firefox-bin'];

function findAppBundle(dir, depth = 0) {
  if (depth > 2) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.toLowerCase().endsWith('.app')) {
      return path.join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findAppBundle(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findNamedBinary(dir, names, depth = 0) {
  if (depth > 2) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (entry.isFile() && names.includes(entry.name)) return path.join(dir, entry.name);
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findNamedBinary(path.join(dir, entry.name), names, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Finds the executable to spawn inside an extracted Camoufox folder,
 * accounting for the different layouts each OS ships.
 * @param {string} engineDir
 * @returns {string|null} absolute path to the executable, or null
 */
function locateBinary(engineDir) {
  if (process.platform === 'darwin') {
    const bundle = findAppBundle(engineDir);
    if (bundle) {
      const macosDir = path.join(bundle, 'Contents', 'MacOS');
      try {
        const files = fs.readdirSync(macosDir).filter((f) => {
          try { return fs.statSync(path.join(macosDir, f)).isFile(); } catch { return false; }
        });
        // Prefer a file whose name matches the bundle, else take the
        // first executable in there — bundles only ever ship one.
        const bundleBase = path.basename(bundle, '.app');
        const preferred = files.find((f) => f.toLowerCase() === bundleBase.toLowerCase());
        const chosen = preferred || files[0];
        if (chosen) return path.join(macosDir, chosen);
      } catch {}
    }
    // Some builds skip the .app wrapper entirely.
    return findNamedBinary(engineDir, UNIX_NAMES);
  }
  if (process.platform === 'win32') {
    return findNamedBinary(engineDir, WIN_NAMES);
  }
  return findNamedBinary(engineDir, UNIX_NAMES);
}

/** chmod +x on a binary. No-op (and harmless) on Windows. */
function ensureExecutable(binPath) {
  if (process.platform === 'win32' || !binPath) return;
  try { fs.chmodSync(binPath, 0o755); } catch {}
}

/**
 * Firefox looks for its own config/preference files (.cfg, defaults/pref,
 * etc.) relative to what it calls GRE_HOME. On Windows and Linux that's
 * just the folder the binary sits in. On macOS it's Contents/Resources
 * inside the .app bundle — a different folder from the one holding the
 * binary itself (Contents/MacOS). Anything that scans for those files by
 * binary location needs this distinction or it silently finds nothing
 * on macOS and every patch/diagnostic becomes a no-op there.
 * @param {string} binPath as returned by locateBinary()
 */
function resourcesDirForBinary(binPath) {
  const dir = path.dirname(binPath);
  if (process.platform === 'darwin') {
    // .../Camoufox.app/Contents/MacOS/camoufox -> .../Contents/Resources
    const contents = path.dirname(dir); // Contents
    if (path.basename(dir) === 'MacOS' && path.basename(contents) === 'Contents') {
      return path.join(contents, 'Resources');
    }
  }
  return dir;
}

module.exports = {
  platformToken,
  archToken,
  pickAsset,
  fetchLatestRelease,
  resolveLatestEngine,
  locateBinary,
  ensureExecutable,
  resourcesDirForBinary,
};
