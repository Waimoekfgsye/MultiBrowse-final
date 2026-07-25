// ─────────────────────────────────────────────────────────────────────
//  MultiBrowse — engine-level search fix (replaces the search-fallback
//  WebExtension)
// ─────────────────────────────────────────────────────────────────────
//  WHAT WAS ACTUALLY WRONG
//
//  Every previous round of this bug was chasing preferences, and none
//  of them could ever have worked, because the breakage is not in a
//  pref. Camoufox ships a *source patch*. Inside its own omni.ja, in
//
//      moz-src:///toolkit/components/search/SearchEngineSelector.sys.mjs
//
//  the private method that fetches the search engine list begins:
//
//      async #getConfiguration(firstTime = true) {
//        if (true) {
//          return [
//            { "appliesTo": [{ "default": "yes",
//                              "included": { "everywhere": true },
//                              "webExtension": { "id": "none@mozilla.org" } }] },
//          ];
//        }
//        let result = [];        // <- upstream code, now unreachable
//        ...
//
//  That `if (true)` short-circuit hands back one record in the OLD
//  search-config schema (appliesTo / webExtension), which Firefox
//  retired when the engine list moved to search-config-v2 and parsing
//  moved into the Rust search component. The Rust deserializer needs
//  `recordType` on every record, doesn't find it, and throws:
//
//      JSON error: missing field `recordType`
//        -> "Search service failed to init"
//        -> "cannot write without any engine"
//        -> zero engines
//
//  With zero engines the URL bar has nothing to hand a bare word to, so
//  "gmail" falls through to URL fixup and becomes http://gmail/.
//
//  Because the short-circuit is compiled into the shipped JS, NO pref
//  can reach it: not services.settings.server, not keyword.enabled, not
//  policies.json. That is why the only thing that ever worked was a
//  WebExtension rewriting the bad navigation after the fact.
//
//  WHAT THIS DOES INSTEAD
//
//  Patches the engine itself, once per installed copy:
//
//   1. SearchEngineSelector.sys.mjs — removes the `if (true)` stub so
//      upstream's real code runs again, and adds a local fallback
//      config so the method can never return an empty list.
//
//   2. Utils.sys.mjs — forces Utils.LOAD_DUMPS true.
//
//      Firefox packages the full engine list at
//        browser/omni.ja!defaults/settings/main/search-config-v2.json
//      and Camoufox still ships it, untouched, ~200 KB, all 154 engines.
//      Loading it needs no network at all. But LOAD_DUMPS is gated on
//      the Remote Settings server URL being Mozilla's real one, and
//      Camoufox deliberately blanks that pref to stop the browser
//      phoning home. Forcing the getter true unlocks the packaged copy
//      while leaving the blanked server exactly as Camoufox intended —
//      reading a file that's already on disk is not a connection, so
//      the profile still never talks to firefox.settings.services.
//      mozilla.com, and there is no IP leak to design around.
//
//  Net effect: real Google/DuckDuckGo/Bing/etc. engines, offline,
//  proxy-independent, no extension, and about:preferences#search works
//  like it does in a normal Firefox.
//
//  The fallback in (1) is built at patch time from the engine's own
//  packaged config, so it always matches the schema of whatever
//  Camoufox build is installed rather than a shape hardcoded here that
//  goes stale on the next upstream bump.
// ─────────────────────────────────────────────────────────────────────

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { readZipEntry, replaceZipEntries } = require('./zipUtils.cjs');

// Bump when the patch itself changes, so already-patched engine copies
// get re-patched instead of being skipped by a stale marker.
const PATCH_VERSION = 1;
const MARKER_NAME = '.mb-search-engine-patched';

const SELECTOR_ENTRY = 'moz-src:///toolkit/components/search/SearchEngineSelector.sys.mjs'
  .replace('moz-src:///', 'moz-src/');
const UTILS_ENTRY = 'modules/services-settings/Utils.sys.mjs';
const CONFIG_DUMP_ENTRY = 'defaults/settings/main/search-config-v2.json';

// UI label -> the identifier used inside search-config-v2.
const ENGINE_IDENTIFIERS = {
  Google: 'google',
  DuckDuckGo: 'ddg',
  Bing: 'bing',
};

// Engines kept in the local fallback list. Only used if the packaged
// dump can't be read at all; the dump itself carries all 154.
const FALLBACK_ENGINE_IDS = ['google', 'ddg', 'bing', 'wikipedia'];

// Last-resort config if the engine ships no dump to build from. Minimal
// but schema-valid: one general engine plus the default-engine record.
const HARDCODED_FALLBACK = [
  {
    recordType: 'engine',
    identifier: 'google',
    id: 'mb-fallback-google',
    last_modified: 1,
    base: {
      name: 'Google',
      classification: 'general',
      aliases: ['google'],
      urls: {
        search: {
          base: 'https://www.google.com/search',
          searchTermParamName: 'q',
        },
        suggestions: {
          base: 'https://www.google.com/complete/search',
          params: [{ name: 'client', value: 'firefox' }],
          searchTermParamName: 'q',
        },
      },
    },
    variants: [{ environment: { allRegionsAndLocales: true } }],
  },
  {
    recordType: 'defaultEngines',
    id: 'mb-fallback-defaults',
    last_modified: 1,
    globalDefault: 'google',
    specificDefaults: [],
  },
];

// ── Locating the two omni.ja bundles ─────────────────────────────────
//  omni.ja            = the GRE bundle (toolkit + services code)
//  browser/omni.ja    = the app bundle (branding + Remote Settings dumps)
//  On macOS both live under Contents/Resources, which is what
//  resourcesDirForBinary() already hands us.
function omniPaths(resourcesDir) {
  return {
    gre: path.join(resourcesDir, 'omni.ja'),
    browser: path.join(resourcesDir, 'browser', 'omni.ja'),
  };
}

/**
 * Builds a small but schema-valid config array out of the engine's own
 * packaged search-config-v2 dump. Falls back to HARDCODED_FALLBACK if
 * the dump is missing or unreadable.
 */
async function buildFallbackConfig(browserOmniPath) {
  try {
    const raw = await readZipEntry(browserOmniPath, CONFIG_DUMP_ENTRY);
    if (!raw) return HARDCODED_FALLBACK;
    const parsed = JSON.parse(raw.toString('utf8'));
    const records = Array.isArray(parsed) ? parsed : parsed.data;
    if (!Array.isArray(records) || !records.length) return HARDCODED_FALLBACK;

    const kept = records.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      if (r.recordType === 'engine') return FALLBACK_ENGINE_IDS.includes(r.identifier);
      // defaultEngines / engineOrders / availableLocales are single
      // records the selector expects to be present.
      return r.recordType && r.recordType !== 'engine';
    });
    const hasEngine = kept.some((r) => r.recordType === 'engine');
    return hasEngine ? kept : HARDCODED_FALLBACK;
  } catch {
    return HARDCODED_FALLBACK;
  }
}

// ── Patch 1: SearchEngineSelector.sys.mjs ────────────────────────────
function patchSelectorSource(src, fallbackConfig, defaultEngineId) {
  if (src.includes(MB_BEGIN)) return null; // already patched

  const sigIdx = src.indexOf('async #getConfiguration(');
  if (sigIdx === -1) throw new Error('#getConfiguration not found — engine layout changed');

  const bodyStart = src.indexOf('{', sigIdx);
  if (bodyStart === -1) throw new Error('#getConfiguration body not found');

  // Everything between the opening brace and upstream's own first
  // statement is Camoufox's short-circuit. Cutting from brace to
  // `let result = [];` removes it whether it's the `if (true)` block
  // seen on 152.0.4-beta.28 or some later variation of the same idea —
  // and removes nothing at all on a build that never had one.
  const resultIdx = src.indexOf('let result = [];', bodyStart);
  if (resultIdx === -1) throw new Error('upstream #getConfiguration body not found');
  const lineStart = src.lastIndexOf('\n', resultIdx) + 1;

  let out = src.slice(0, bodyStart + 1) + '\n' + src.slice(lineStart);

  // Route the return value through our helper: supplies the local
  // fallback if the list came back empty, and pins the default engine.
  const retIdx = out.indexOf('return result;', bodyStart);
  if (retIdx === -1) throw new Error('#getConfiguration return not found');
  out = out.slice(0, retIdx) + 'return mbFinalizeSearchConfig(result);' + out.slice(retIdx + 'return result;'.length);

  const prelude = `
/* MB-SEARCH-FIX:BEGIN */
// ── MultiBrowse ──────────────────────────────────────────────────────
// Camoufox shipped this file with an \`if (true)\` short-circuit at the
// top of #getConfiguration that returned a single old-schema record
// with no \`recordType\`, which the Rust selector rejects, leaving the
// profile with zero search engines. The short-circuit has been removed
// so upstream's code runs; these two pieces make sure it can't come
// back empty-handed.
const MB_SEARCH_CONFIG = ${JSON.stringify(fallbackConfig)};
const MB_DEFAULT_ENGINE_ID = ${JSON.stringify(defaultEngineId || 'google')};

function mbFinalizeSearchConfig(records) {
  let out = Array.isArray(records) && records.length ? records : MB_SEARCH_CONFIG;
  // Pin the default so it doesn't drift with the detected region — a
  // profile geolocating to CN would otherwise come up on Baidu. Only
  // rewrites the record when the wanted default differs from what the
  // config already says, so the common case touches nothing.
  return out.map(record => {
    if (
      record &&
      record.recordType === "defaultEngines" &&
      record.globalDefault !== MB_DEFAULT_ENGINE_ID
    ) {
      return { ...record, globalDefault: MB_DEFAULT_ENGINE_ID, specificDefaults: [] };
    }
    return record;
  });
}
/* MB-SEARCH-FIX:END */

`;

  const classIdx = out.indexOf('export class SearchEngineSelector');
  if (classIdx === -1) throw new Error('SearchEngineSelector class not found');
  // Back up over the JSDoc block attached to the class so the comment
  // stays with the class it documents.
  let insertAt = classIdx;
  const docStart = out.lastIndexOf('/**', classIdx);
  if (docStart !== -1 && out.indexOf('*/', docStart) < classIdx) insertAt = docStart;

  return out.slice(0, insertAt) + prelude.trimStart() + '\n' + out.slice(insertAt);
}

// ── Patch 2: Utils.sys.mjs (LOAD_DUMPS) ──────────────────────────────
function patchUtilsSource(src) {
  if (src.includes('MultiBrowse: always load')) return null; // already patched

  const idx = src.indexOf('get LOAD_DUMPS() {');
  if (idx === -1) throw new Error('LOAD_DUMPS getter not found — engine layout changed');
  const insertAt = idx + 'get LOAD_DUMPS() {'.length;

  const injected =
    '\n    // MultiBrowse: always load the packaged Remote Settings dumps.' +
    '\n    // Upstream gates this on the settings server being Mozilla\'s' +
    '\n    // real endpoint; Camoufox blanks that pref on purpose, which' +
    '\n    // also blocked the search engine list that ships inside' +
    '\n    // omni.ja. Reading a packaged file is local-only, so this' +
    '\n    // restores the engine list without opening any connection.' +
    '\n    return true;';

  return src.slice(0, insertAt) + injected + src.slice(insertAt);
}

// ── Entry point ──────────────────────────────────────────────────────

function markerPath(resourcesDir) {
  return path.join(resourcesDir, MARKER_NAME);
}

/**
 * Applies both patches to one installed engine copy. Idempotent: a
 * marker file records the patch version, and the source patches
 * themselves detect their own previous output.
 *
 * @param {string} resourcesDir  from camoufoxEngine.resourcesDirForBinary()
 * @param {string} [searchEngine]  UI label, e.g. "Google"
 * @returns {Promise<boolean>} true if anything was written
 */
async function applySearchEngineFix(resourcesDir, searchEngine) {
  const marker = markerPath(resourcesDir);
  const wantedId = ENGINE_IDENTIFIERS[searchEngine] || 'google';

  try {
    const done = await fsp.readFile(marker, 'utf8').catch(() => '');
    if (done.includes(`v${PATCH_VERSION}`) && done.includes(`engine=${wantedId}`)) return false;
  } catch {}

  const { gre, browser } = omniPaths(resourcesDir);
  if (!fs.existsSync(gre)) {
    console.warn('[MultiBrowse] search fix: no omni.ja at', gre);
    return false;
  }

  const fallbackConfig = fs.existsSync(browser)
    ? await buildFallbackConfig(browser)
    : HARDCODED_FALLBACK;

  const selectorRaw = await readZipEntry(gre, SELECTOR_ENTRY);
  if (!selectorRaw) throw new Error(`${SELECTOR_ENTRY} not found in omni.ja`);
  const utilsRaw = await readZipEntry(gre, UTILS_ENTRY);
  if (!utilsRaw) throw new Error(`${UTILS_ENTRY} not found in omni.ja`);

  const replacements = {};

  // A re-patch (engine choice changed, or PATCH_VERSION bumped) needs
  // the ORIGINAL file, not our previous output. patchSelectorSource
  // returns null when it sees its own marker, so strip the old prelude
  // first and re-run rather than layering patches on patches.
  let selectorSrc = stripPreviousSelectorPatch(selectorRaw.toString('utf8'));
  const selectorPatched = patchSelectorSource(selectorSrc, fallbackConfig, wantedId);
  if (selectorPatched) replacements[SELECTOR_ENTRY] = Buffer.from(selectorPatched, 'utf8');

  const utilsPatched = patchUtilsSource(utilsRaw.toString('utf8'));
  if (utilsPatched) replacements[UTILS_ENTRY] = Buffer.from(utilsPatched, 'utf8');

  if (Object.keys(replacements).length) {
    await replaceZipEntries(gre, replacements);
    console.log(
      `[MultiBrowse] search fix v${PATCH_VERSION} applied to ${path.basename(resourcesDir)} ` +
      `(${Object.keys(replacements).length} module(s), default=${wantedId})`
    );
  }

  await fsp.writeFile(marker, `v${PATCH_VERSION} engine=${wantedId} ${new Date().toISOString()}`, 'utf8');
  return Object.keys(replacements).length > 0;
}

// Undoes a previous run's edits so a re-patch (engine choice changed,
// or PATCH_VERSION bumped) starts from the file as it was shipped
// rather than layering a patch on top of a patch. Camoufox's `if (true)`
// stub stays gone — removing it twice is the same as removing it once.
const MB_BEGIN = '/* MB-SEARCH-FIX:BEGIN */';
const MB_END = '/* MB-SEARCH-FIX:END */';

function stripPreviousSelectorPatch(src) {
  let out = src.replace(
    'return mbFinalizeSearchConfig(result);',
    'return result;'
  );
  const start = out.indexOf(MB_BEGIN);
  if (start === -1) return out;
  const end = out.indexOf(MB_END, start);
  if (end === -1) return out;
  const endLine = out.indexOf('\n', end + MB_END.length);
  return (out.slice(0, start) + out.slice(endLine + 1)).replace(/\n{3,}/g, '\n\n');
}

module.exports = {
  applySearchEngineFix,
  PATCH_VERSION,
  ENGINE_IDENTIFIERS,
  // exported for tests / manual verification
  patchSelectorSource,
  patchUtilsSource,
  buildFallbackConfig,
};
