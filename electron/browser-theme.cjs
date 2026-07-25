// ─────────────────────────────────────────────────────────────────────
//  MultiBrowse — custom browser chrome theme
// ─────────────────────────────────────────────────────────────────────
//  This file controls how the launched browser LOOKS: the tab strip,
//  the URL bar, menus, popups, scrollbars.
//
//  👉 If you only want to change colours or rounding, edit the THEME
//     object below and nothing else. Everything is generated from it.
//
//  How it works (short version):
//    1. writeBrowserTheme()  → writes <profile>/chrome/userChrome.css
//    2. installThemeLoader() → adds a few lines to the engine's
//       camoufox.cfg so the browser is guaranteed to load that file
//       at startup, even if a preference is missing.
// ─────────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
// Only used to find where Firefox keeps its own .cfg files, which sits
// in a different folder from the executable on macOS (Contents/Resources
// vs Contents/MacOS) — see resourcesDirForBinary() for why.
const { resourcesDirForBinary } = require('./camoufoxEngine.cjs');

// ═════════════════════════════════════════════════════════════════════
//  1. THEME SETTINGS — this is the part you edit
// ═════════════════════════════════════════════════════════════════════
const THEME = {
  // ── MASTER SWITCH ──────────────────────────────────────────────────
  // false = don't theme the browser at all. Camoufox keeps its stock
  //         Firefox chrome, which also means the native new-tab "+",
  //         tab close buttons and window controls all behave normally.
  // true  = apply the custom look described by everything below.
  //
  // Turning this off also strips any userChrome.css a previous launch
  // wrote, so the old theme doesn't linger in existing profiles.
  enabled: false,

  // Works even when `enabled` is false: writes a one-rule stylesheet
  // that puts the profile's icon in the title bar and nothing else. It's
  // how you tell two stock-looking windows apart at a glance.
  badgeWhenDisabled: true,

  // 'themed'  → your custom look, all controls visible   (recommended)
  // 'compact' → same look, no tab bar (single-tab kiosk feel)
  // 'hidden'  → NO browser UI at all, just the web page.
  //             Use this later if you draw tabs/URL bar in Electron.
  layout: 'themed',

  // Window background + toolbars (matches src/index.css dark theme)
  bg: '#0a0a0f',          // window frame / tab strip
  bgToolbar: '#101018',   // nav bar (where the URL bar lives)
  bgTabActive: '#1a1a25', // selected tab
  bgTabHover: '#16161f',
  bgField: '#12121a',     // URL bar background
  bgPopup: '#101018',     // right-click menus, dropdowns

  border: '#1e1e2a',
  text: '#e8e8f0',
  textDim: '#8888a0',

  // Fallback accent. Each profile's own colour overrides this.
  accent: '#e8d44d',

  radius: 8,              // corner rounding, in px
  tabHeight: 32,          // tab strip height, in px
  toolbarHeight: 38,      // nav bar height, in px

  fontUI: "'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",

  showTabCloseButtons: true,  // Camoufox hides these by default
  showProfileBadge: true,     // profile icon badge in the title bar
  badgeSize: 18,              // profile badge icon size, in px
  showBookmarksBar: false,

  // ── Window buttons ─────────────────────────────────────────────────
  // macOS-style traffic lights, matched to the app's own WindowControls
  // component so the browser and the manager window look like one
  // product. Values are copied from src/components/WindowControls.tsx —
  // if you restyle them there, change them here too.
  //
  // These also happen to be the fix for the blank-box buttons: Firefox
  // draws its own min/max/close glyphs from internal icon assets, and on
  // this build those assets don't resolve, so the buttons paint as empty
  // outlined squares. The rules below hide that glyph entirely and paint
  // a solid colour circle with plain CSS instead — nothing is left to
  // fail to load.
  trafficLights: true,
  trafficLightSize: 13,          // px — matches w-[13px] h-[13px]
  trafficLightGap: 8,            // px — matches gap-2
  trafficLightMinimize: '#ffbd2e',
  trafficLightMaximize: '#27c93f',
  trafficLightClose: '#ff5f56',

  // Strips Firefox's own drawn window border and the separator line
  // under the toolbar, for the borderless look. Note: the thin resize
  // frame immediately around the window is drawn by the OS, not by
  // Firefox, so no stylesheet can remove that part.
  borderlessWindow: true,

  // Back / forward / reload — in px. Firefox's own icons are 16px, so
  // don't go below that for the icon or they become unreadable.
  navButtonSize: 30,
  navIconSize: 16,

  // ── Stylesheet loading ─────────────────────────────────────────────
  // false = rely on toolkit.legacyUserProfileCustomizations.stylesheets
  //         alone to load userChrome.css.
  // true  = ALSO inject a small script into the engine's camoufox.cfg
  //         that registers the stylesheet directly with Gecko.
  //
  // Now on, because the preference route alone wasn't applying the theme
  // on this build. The injected block is wrapped in try/catch, so a
  // failure inside it can't stop the browser starting — but camoufox.cfg
  // is still the engine's own startup config, so if a profile ever
  // refuses to launch, set this back to false first.
  forceLoadStylesheet: true,
};

// ═════════════════════════════════════════════════════════════════════
//  2. CSS GENERATION — you normally don't need to touch this
// ═════════════════════════════════════════════════════════════════════

/** Strip anything that could break out of a CSS string. */
function safe(str) {
  return String(str == null ? '' : str).replace(/["\\<>{}]/g, '').trim();
}

/** "#e8d44d" + 0.13 → "rgba(232,212,77,0.13)". Falls back gracefully. */
function alpha(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return `rgba(232,212,77,${a})`;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${a})`;
}

/** Turns an absolute filesystem path into a file:// URL CSS can load. */
function toFileUrl(p) {
  if (!p) return null;
  let norm = String(p).replace(/\\/g, '/');
  if (!norm.startsWith('/')) norm = '/' + norm; // Windows: C:/... -> /C:/...
  // encodeURI (not encodeURIComponent) so ":" in "C:" and "/" separators
  // survive untouched — only spaces and other unsafe chars get escaped.
  return 'file://' + encodeURI(norm);
}

function buildUserChromeCss(config, iconPath) {
  const t = THEME;
  const accent = /^#[0-9a-f]{6}$/i.test(String(config?.color || '')) ? config.color : t.accent;
  const name = safe(config?.name || 'Profile');
  const iconUrl = toFileUrl(iconPath);

  // ── "hidden" layout: remove every piece of browser UI ──────────────
  if (t.layout === 'hidden') {
    return `@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");
/* MultiBrowse — layout:'hidden'. Web page only, no browser controls. */
#navigator-toolbox,
#titlebar,
#TabsToolbar,
#nav-bar,
#PersonalToolbar,
#sidebar-box { visibility: collapse !important; }
#browser, #appcontent, #tabbrowser-tabbox { margin: 0 !important; border: 0 !important; }
:root { background: ${t.bg} !important; }
`;
  }

  const hideTabs = t.layout === 'compact';

  return `@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");
/* ═══════════════════════════════════════════════════════════════════
   MultiBrowse custom chrome — GENERATED FILE, do not edit by hand.
   Edit electron/browser-theme.cjs instead; this is rewritten on every
   profile launch.
   ═══════════════════════════════════════════════════════════════════ */

:root {
  --mb-accent: ${accent} !important;
  --mb-accent-soft: ${alpha(accent, 0.14)} !important;
  --mb-accent-line: ${alpha(accent, 0.55)} !important;
  --mb-bg: ${t.bg} !important;
  --mb-toolbar: ${t.bgToolbar} !important;
  --mb-field: ${t.bgField} !important;
  --mb-border: ${t.border} !important;
  --mb-text: ${t.text} !important;
  --mb-text-dim: ${t.textDim} !important;
  --mb-radius: ${t.radius}px !important;

  /* Override Firefox's own theme variables so nothing leaks through */
  --toolbar-bgcolor: ${t.bgToolbar} !important;
  --toolbar-color: ${t.text} !important;
  --tabpanel-background-color: ${t.bg} !important;
  --lwt-accent-color: ${t.bg} !important;
  --lwt-text-color: ${t.text} !important;
  --toolbar-field-background-color: ${t.bgField} !important;
  --toolbar-field-color: ${t.text} !important;
  --toolbar-field-focus-background-color: ${t.bgField} !important;
  --toolbar-field-border-color: ${t.border} !important;
  --toolbar-field-focus-border-color: ${accent} !important;
  --arrowpanel-background: ${t.bgPopup} !important;
  --arrowpanel-color: ${t.text} !important;
  --arrowpanel-border-color: ${t.border} !important;
  --panel-background: ${t.bgPopup} !important;
  --panel-color: ${t.text} !important;
  --panel-border-color: ${t.border} !important;
  --panel-border-radius: ${t.radius}px !important;
  --tab-min-height: ${t.tabHeight}px !important;
  --tab-max-height: ${t.tabHeight}px !important;
  --urlbar-height: ${t.toolbarHeight - 8}px !important;
  --urlbar-toolbar-height: ${t.toolbarHeight}px !important;
  --focus-outline-color: ${accent} !important;
}

/* ── Window frame ───────────────────────────────────────────────── */
#main-window, #browser, #tabbrowser-tabbox { background: var(--mb-bg) !important; }
${t.borderlessWindow ? '' : '#navigator-toolbox { border-bottom: 1px solid var(--mb-border) !important; }'}
${t.trafficLights ? buildTrafficLightRule() : ''}
${t.borderlessWindow ? buildBorderlessRule() : ''}

/* ── Tab strip ──────────────────────────────────────────────────── */
#TabsToolbar {
  background: var(--mb-bg) !important;
  min-height: ${t.tabHeight + 4}px !important;
  padding: 2px 4px 0 4px !important;
  ${hideTabs ? 'visibility: collapse !important;' : ''}
}
.tabbrowser-tab {
  max-height: ${t.tabHeight}px !important;
  min-height: ${t.tabHeight}px !important;
  padding-inline: 2px !important;
  margin-inline: 2px !important;
}
.tab-background {
  border-radius: var(--mb-radius) !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  max-height: ${t.tabHeight}px !important;
  transition: background .12s ease !important;
}
.tabbrowser-tab:hover .tab-background { background: ${t.bgTabHover} !important; }
.tabbrowser-tab[selected="true"] .tab-background {
  background: ${t.bgTabActive} !important;
  outline: 1px solid var(--mb-accent-line) !important;
  outline-offset: -1px !important;
  box-shadow: 0 1px 3px rgba(0,0,0,.35) !important;
}
.tab-label {
  font-family: ${t.fontUI} !important;
  font-size: 11.5px !important;
  color: var(--mb-text-dim) !important;
  margin-inline: 6px 4px !important;
}
.tabbrowser-tab[selected="true"] .tab-label { color: var(--mb-text) !important; font-weight: 600 !important; }
/* Camoufox centres tab text and kills clicks — undo both */
.tab-content { pointer-events: auto !important; }
.tab-label-container { max-width: none !important; margin-inline-end: 0 !important; }
.tab-icon-stack { margin-inline-start: 0 !important; }
${t.showTabCloseButtons ? `.tab-close-button { display: flex !important; opacity: .55 !important; border-radius: 4px !important; }
.tab-close-button:hover { opacity: 1 !important; background: ${alpha('#ff5f56', 0.2)} !important; }` : ''}

/* ── New-tab "+" ────────────────────────────────────────────────── */
/* There are two of these buttons and only one is shown at a time:
     #tabs-newtab-button  lives INSIDE the tab strip, right after the
                          last tab. This is the one we want.
     #new-tab-button      is the toolbar version, which is what you get
                          if the button was dragged out of the tab strip
                          — that's why it was sitting next to the
                          extensions icon.
   Forcing the in-strip one visible and hiding the toolbar one puts it
   back where it belongs. Both are addressed without #TabsToolbar in
   front so the rule still applies if Camoufox reparents them. */
#tabs-newtab-button {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  align-items: center !important;
  justify-content: center !important;
  width: ${t.tabHeight - 6}px !important;
  height: ${t.tabHeight - 6}px !important;
  min-width: ${t.tabHeight - 6}px !important;
  margin: 3px 0 0 4px !important;
  padding: 0 !important;
  border-radius: var(--mb-radius) !important;
  fill: var(--mb-text-dim) !important;
  order: 0 !important;
}
#tabs-newtab-button > .toolbarbutton-icon {
  width: 16px !important;
  height: 16px !important;
  padding: 0 !important;
  opacity: 1 !important;
}
#tabs-newtab-button:hover {
  background: var(--mb-accent-soft) !important;
  fill: var(--mb-accent) !important;
}
/* The duplicate that ends up beside the extensions button */
#nav-bar #new-tab-button,
#TabsToolbar > #new-tab-button { display: none !important; }

/* ── Nav bar / URL bar ──────────────────────────────────────────── */
#nav-bar {
  background: var(--mb-toolbar) !important;
  min-height: ${t.toolbarHeight}px !important;
  max-height: ${t.toolbarHeight}px !important;
  border-top: none !important;
  box-shadow: none !important;
  padding-inline: 6px !important;
}
#urlbar, #urlbar-container { --urlbar-height: ${t.toolbarHeight - 10}px !important; }
#urlbar-background {
  background: var(--mb-field) !important;
  border: 1px solid var(--mb-border) !important;
  border-radius: var(--mb-radius) !important;
  transition: border-color .15s ease, box-shadow .15s ease !important;
}
#urlbar[focused="true"] > #urlbar-background {
  border-color: var(--mb-accent) !important;
  box-shadow: 0 0 0 3px var(--mb-accent-soft) !important;
}
#urlbar-input, #urlbar-input::placeholder {
  font-family: ${t.fontMono} !important;
  font-size: 12px !important;
}
#urlbar-input { color: var(--mb-text) !important; }
#urlbar-input::placeholder { color: var(--mb-text-dim) !important; }

/* Toolbar buttons (back / forward / reload / extensions) */
#nav-bar .toolbarbutton-1 > .toolbarbutton-icon,
#nav-bar .toolbarbutton-1 > .toolbarbutton-badge-stack {
  fill: var(--mb-text-dim) !important;
  border-radius: 6px !important;
  padding: 5px !important;
}
#nav-bar .toolbarbutton-1:hover > .toolbarbutton-icon,
#nav-bar .toolbarbutton-1:hover > .toolbarbutton-badge-stack {
  background: var(--mb-accent-soft) !important;
  fill: var(--mb-accent) !important;
}

/* Back / forward / reload / stop — compact, was oversized by default */
#back-button, #forward-button,
#stop-reload-button, #reload-button, #stop-button {
  width: ${t.navButtonSize}px !important;
  height: ${t.navButtonSize}px !important;
  min-width: ${t.navButtonSize}px !important;
  min-height: ${t.navButtonSize}px !important;
  margin-inline: 1px !important;
}
#back-button > .toolbarbutton-icon, #forward-button > .toolbarbutton-icon,
#stop-reload-button > .toolbarbutton-icon,
#reload-button > .toolbarbutton-icon, #stop-button > .toolbarbutton-icon {
  width: ${t.navIconSize}px !important;
  height: ${t.navIconSize}px !important;
  padding: 3px !important;
}
/* No extensions have a toolbar icon anymore (the day/night toggle was
   the only one, and it's been removed), so there's nothing left to
   reach here — hide the puzzle piece rather than force it visible. */
#unified-extensions-button { display: none !important; }

/* ── Bookmarks bar ──────────────────────────────────────────────── */
#PersonalToolbar {
  ${t.showBookmarksBar
    ? 'display: flex !important; background: var(--mb-toolbar) !important; border-top: 1px solid var(--mb-border) !important;'
    : 'visibility: collapse !important;'}
}

/* ── Menus, popups, dropdowns ───────────────────────────────────── */
menupopup, panel {
  --panel-background: ${t.bgPopup} !important;
  --panel-border-radius: ${t.radius}px !important;
  --panel-border-color: var(--mb-border) !important;
}
menupopup > menuitem, menupopup > menu {
  font-family: ${t.fontUI} !important;
  font-size: 12px !important;
  color: var(--mb-text) !important;
  border-radius: 5px !important;
  padding-block: 5px !important;
}
menupopup > menuitem[_moz-menuactive="true"],
menupopup > menu[_moz-menuactive="true"] {
  background: var(--mb-accent-soft) !important;
  color: var(--mb-accent) !important;
}
menuseparator { border-color: var(--mb-border) !important; }

/* URL bar suggestion dropdown */
.urlbarView { background: ${t.bgPopup} !important; border-radius: 0 0 var(--mb-radius) var(--mb-radius) !important; }
.urlbarView-row[selected], .urlbarView-row:hover {
  background: var(--mb-accent-soft) !important;
  border-radius: 6px !important;
}
.urlbarView-title { font-family: ${t.fontUI} !important; color: var(--mb-text) !important; }
.urlbarView-url { font-family: ${t.fontMono} !important; color: var(--mb-accent) !important; opacity: .8 !important; }

/* Find bar */
findbar {
  background: var(--mb-toolbar) !important;
  border-top: 1px solid var(--mb-border) !important;
  color: var(--mb-text) !important;
}

/* Sidebar */
#sidebar-box, #sidebar-header {
  background: var(--mb-bg) !important;
  color: var(--mb-text) !important;
  border-inline-end: 1px solid var(--mb-border) !important;
}

/* ── Clutter we never want ──────────────────────────────────────── */
#firefox-view-button,
#alltabs-button,
#whats-new-menu-button,
#star-button-box,
#pocket-button,
#tracking-protection-icon-container,
.titlebar-spacer[type="post-tabs"],
#tab-notification-deck { display: none !important; }

${t.showProfileBadge && iconUrl ? buildBadgeRule(iconUrl, 'var(--mb-accent-line)') : ''}
`;
}

// ── The profile badge rule, shared by both stylesheets ───────────────
//
//  THE BUG THIS FIXES
//  The badge used to be drawn with:
//      content: url("file:///.../P1.png");
//      width: 18px; height: 18px;
//
//  In Gecko, `content: url(...)` on a pseudo-element inserts the image
//  as a replaced element that renders at its INTRINSIC size — the PNG is
//  256x256 — and `width`/`height` size the pseudo-element's box without
//  resizing the image inside it. The result is exactly what you saw: an
//  18px box with the accent outline (the "colour box"), and a full-size
//  256px icon spilling out behind it.
//
//  `background-image` has no such problem: `background-size: contain`
//  scales the bitmap to the box. So the box keeps its 18px footprint and
//  the icon is drawn to fit it.
// ── macOS-style traffic light window buttons ──────────────────────────
//  Replaces Firefox's own min/max/close rendering with three flat colour
//  circles matching the app's WindowControls component.
//
//  This is also what fixes the "buttons show as empty boxes" problem.
//  Firefox paints those buttons from its own icon assets; when they fail
//  to resolve you get an outlined box with nothing inside, and that
//  happens below any level a stylesheet can correct. Rather than trying
//  to repair the icon, this hides it (.toolbarbutton-icon -> display:
//  none) and paints the button element itself as a coloured circle. No
//  asset is involved anymore, so there's nothing left to fail.
//
//  -moz-window-dragging: no-drag is set on the container AND on each
//  button. Container-only is a known cause of buttons that look right
//  but swallow clicks as window-drags — it doesn't reliably inherit down
//  through XUL layout, so it's applied at every level.
function buildTrafficLightRule() {
  const t = THEME;
  const half = Math.round(t.trafficLightGap / 2);
  return `
/* ── Window buttons: macOS-style traffic lights ─────────────────── */
.titlebar-buttonbox-container,
#titlebar-buttonbox-container {
  -moz-window-dragging: no-drag !important;
  width: auto !important;
  position: relative !important;
  z-index: 500 !important;
}
.titlebar-buttonbox,
#titlebar-buttonbox {
  -moz-window-dragging: no-drag !important;
  align-items: center !important;
  margin-inline: ${t.trafficLightGap}px ${t.trafficLightGap + 2}px !important;
  position: relative !important;
  z-index: 500 !important;
}
toolbarbutton.titlebar-button,
.titlebar-button {
  -moz-window-dragging: no-drag !important;
  appearance: none !important;
  -moz-appearance: none !important;
  -moz-default-appearance: none !important;
  background-image: none !important;
  background-repeat: no-repeat !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  /* Some builds draw the min/max/close glyph on the BUTTON itself
     (list-style-image + -moz-context-properties: stroke, stroke:
     currentColor), not on a child element. Making the foreground fully
     transparent kills that rendering path no matter where it happens. */
  color: transparent !important;
  fill: transparent !important;
  stroke: transparent !important;
  -moz-context-properties: none !important;
  width: ${t.trafficLightSize}px !important;
  height: ${t.trafficLightSize}px !important;
  min-width: ${t.trafficLightSize}px !important;
  min-height: ${t.trafficLightSize}px !important;
  max-width: ${t.trafficLightSize}px !important;
  max-height: ${t.trafficLightSize}px !important;
  border-radius: 50% !important;
  margin: 0 ${half}px !important;
  padding: 0 !important;
  list-style-image: none !important;
  position: relative !important;
  z-index: 501 !important;
  pointer-events: auto !important;
  transition: opacity 0.15s ease !important;
}
/* The glyph Firefox would normally draw. Hiding it is what removes the
   empty-box rendering — see the note above this function.
   Covers every place the glyph can live: a direct <image> child, the
   .toolbarbutton-icon class (possibly nested inside a .box-inherit
   wrapper, hence the descendant selector), and ::before/::after
   pseudo-elements some builds use instead of a real child node. */
.titlebar-button::before,
.titlebar-button::after {
  display: none !important;
  content: none !important;
  background: none !important;
  background-image: none !important;
}
.titlebar-button image,
.titlebar-button > image,
.titlebar-button .toolbarbutton-icon,
.titlebar-button > .toolbarbutton-icon {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: none !important;
  background-image: none !important;
  list-style-image: none !important;
  pointer-events: none !important;
}
.titlebar-min, #titlebar-min,
.titlebar-min:hover, #titlebar-min:hover { background-color: ${t.trafficLightMinimize} !important; }
.titlebar-max, .titlebar-restore, #titlebar-max, #titlebar-restore,
.titlebar-max:hover, .titlebar-restore:hover,
#titlebar-max:hover, #titlebar-restore:hover { background-color: ${t.trafficLightMaximize} !important; }
.titlebar-close, #titlebar-close,
.titlebar-close:hover, #titlebar-close:hover { background-color: ${t.trafficLightClose} !important; }
/* Same hover/active feedback the app's own buttons use. */
.titlebar-button:hover { opacity: 0.8 !important; }
.titlebar-button:active { opacity: 0.6 !important; }`;
}

// ── Borderless window ─────────────────────────────────────────────────
//  Removes the frame Firefox draws for itself: the window border, the
//  separator line under the toolbar, and the titlebar spacers that pad
//  the chrome out to look like a classic title bar.
//
//  The thin resize frame right at the window edge belongs to the OS, not
//  to Firefox, and can't be removed from inside a stylesheet — that part
//  stays regardless.
function buildBorderlessRule() {
  return `
/* ── Borderless window frame ────────────────────────────────────── */
#main-window {
  border: none !important;
  box-shadow: none !important;
}
#navigator-toolbox {
  border-bottom: none !important;
  box-shadow: none !important;
}
#navigator-toolbox::after { display: none !important; }
:root {
  --chrome-content-separator-color: transparent !important;
}
.titlebar-spacer { display: none !important; }`;
}

function buildBadgeRule(iconUrl, outlineColor) {
  const t = THEME;
  return `
/* ── Profile badge in the tab bar ───────────────────────────────── */
/* Painted as a background image, NOT via content:url() — see the note
   above buildBadgeRule() in electron/browser-theme.cjs for why.

   Kept deliberately scoped to the ::before pseudo-element: no rule here
   sets anything on #TabsToolbar-customization-target itself, so this
   cannot affect how the toolbar lays out its real children. (An earlier
   version set align-items on the container, on a guess that it was
   breaking the window buttons. That guess was wrong — those buttons
   live in #titlebar-buttonbox-container, a sibling, not inside the
   customization target — but there was no reason to touch the
   container's layout regardless, so the rule stayed removed.) */
#TabsToolbar-customization-target::before {
  content: "" !important;
  display: block !important;
  align-self: center !important;
  box-sizing: border-box !important;
  width: ${t.badgeSize}px !important;
  height: ${t.badgeSize}px !important;
  min-width: ${t.badgeSize}px !important;
  min-height: ${t.badgeSize}px !important;
  max-width: ${t.badgeSize}px !important;
  max-height: ${t.badgeSize}px !important;
  background-image: url("${iconUrl}") !important;
  background-size: contain !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-color: transparent !important;
  margin: 0 8px 0 6px !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 5px !important;
  outline: 1px solid ${outlineColor} !important;
  outline-offset: 1px !important;
  overflow: hidden !important;
  flex: 0 0 auto !important;
  flex-shrink: 0 !important;
  order: -999 !important;
  -moz-window-dragging: drag !important;
}`;
}

// The "Extension (...)" address bar label rules that used to live here
// are gone with the new-tab extension that caused them: no page in this
// profile is served by an extension anymore, so Firefox has nothing to
// mark. (search-fallback only redirects requests — it never hosts a
// page, so it never triggers that label.)

function buildUserContentCss() {
  const t = THEME;
  return `/* MultiBrowse — page-level chrome (blank pages + scrollbars). Generated. */
@-moz-document url-prefix("about:blank"), url("about:newtab"), url("about:home") {
  :root, body { background: ${t.bg} !important; }
}
@-moz-document url-prefix("about:") {
  :root { scrollbar-color: ${t.border} ${t.bg} !important; }
}
`;
}

/**
 * Writes the generated theme into a profile directory.
 * Call this right before launching the browser for that profile.
 * @param {string} profileDir
 * @param {object} config
 * @param {string|null} iconPath - absolute path to the profile's PNG
 *   icon (the same one used for the taskbar/exe icon), so the title
 *   bar badge can show it. Pass null to fall back to no badge.
 */
/** Just the title-bar profile icon, on otherwise stock Firefox chrome.
 *  Used when THEME.enabled is false but THEME.badgeWhenDisabled is on. */
function buildBadgeOnlyCss(config, iconPath) {
  const t = THEME;
  const iconUrl = toFileUrl(iconPath);
  const accent = /^#[0-9a-f]{6}$/i.test(String(config?.color || '')) ? config.color : t.accent;
  // The traffic lights and the borderless frame don't depend on having a
  // profile icon, so they're emitted either way — a profile with no icon
  // yet should still get working window buttons rather than the blank
  // boxes Firefox would otherwise draw.
  const badge = iconUrl ? buildBadgeRule(iconUrl, alpha(accent, 0.5)) : '/* No profile icon available — badge skipped. */';
  return `@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");
/* ═══════════════════════════════════════════════════════════════════
   MultiBrowse — native chrome, with three deliberate exceptions.
   The full theme is off (THEME.enabled = false), so the browser is
   otherwise stock Firefox. What's here:
     1. the profile badge at the left of the tab strip
     2. macOS-style traffic light window buttons, matching the app
     3. a borderless window frame
   ═══════════════════════════════════════════════════════════════════ */
${badge}
${t.trafficLights ? buildTrafficLightRule() : ''}
${t.borderlessWindow ? buildBorderlessRule() : ''}
`;
}

async function writeBrowserTheme(profileDir, config, iconPath) {
  const chromeDir = path.join(profileDir, 'chrome');
  const userChrome = path.join(chromeDir, 'userChrome.css');
  const userContent = path.join(chromeDir, 'userContent.css');

  // Theme off: leave the browser stock. Any stylesheet a previous launch
  // wrote has to go, otherwise the old theme keeps applying — the files
  // live in the profile, not in this build.
  if (!THEME.enabled) {
    // Any one of these needs a stylesheet. The traffic lights in
    // particular must be written even for a profile with no icon —
    // without them Firefox draws its own window buttons, which is the
    // blank-box rendering.
    const wantsOverrides = (THEME.badgeWhenDisabled && iconPath)
      || THEME.trafficLights
      || THEME.borderlessWindow;
    if (wantsOverrides) {
      await fsp.mkdir(chromeDir, { recursive: true });
      await fsp.writeFile(userChrome, buildBadgeOnlyCss(config, iconPath), 'utf8');
      console.log('[MultiBrowse] Native chrome + badge/traffic lights/borderless');
    } else {
      try { await fsp.unlink(userChrome); } catch {}
      console.log('[MultiBrowse] Theme disabled — stock browser chrome');
    }
    try { await fsp.unlink(userContent); } catch {}
    return;
  }

  await fsp.mkdir(chromeDir, { recursive: true });
  await fsp.writeFile(userChrome, buildUserChromeCss(config, iconPath), 'utf8');
  await fsp.writeFile(userContent, buildUserContentCss(), 'utf8');
}

// ═════════════════════════════════════════════════════════════════════
//  3. CLEANUP — remove the old autoconfig loader
// ═════════════════════════════════════════════════════════════════════
//  An earlier version of this file appended a block of privileged
//  JavaScript to the engine's camoufox.cfg as a "safety net" to force
//  the stylesheet to load. That was a mistake:
//
//    * camoufox.cfg is the engine's own startup config. If anything in
//      it fails to parse, the browser refuses to start or crashes.
//    * It was never needed — Camoufox already ships
//      defaultPref("toolkit.legacyUserProfileCustomizations.stylesheets",
//      true), and writeUserJs() sets it again. userChrome.css loads on
//      its own.
//
//  Profiles launched with that version still have the bad block sitting
//  in their engine copy, so this strips it out on next launch. Once all
//  your profiles have started at least once, this becomes a no-op.
// ═════════════════════════════════════════════════════════════════════

const LOADER_MARKER = '// >>> MULTIBROWSE_THEME_LOADER';
const LOADER_END = '// <<< MULTIBROWSE_THEME_LOADER';

/**
 * Strips the previously-injected loader block from the engine's config
 * files. Safe to call every launch. Returns true if it cleaned anything.
 */
async function removeThemeLoader(binPath) {
  try {
    const engineDir = resourcesDirForBinary(binPath);
    const files = (await fsp.readdir(engineDir)).filter((f) => f.endsWith('.cfg'));
    let cleaned = false;
    for (const file of files) {
      const cfgPath = path.join(engineDir, file);
      const content = await fsp.readFile(cfgPath, 'utf8');
      const start = content.indexOf(LOADER_MARKER);
      if (start === -1) continue;
      const endIdx = content.indexOf(LOADER_END, start);
      const stripped = endIdx === -1
        ? content.slice(0, start)
        : content.slice(0, start) + content.slice(endIdx + LOADER_END.length);
      await fsp.writeFile(cfgPath, stripped.trimEnd() + '\n', 'utf8');
      cleaned = true;
      console.log('[MultiBrowse] Removed stale theme loader from', file);
    }
    return cleaned;
  } catch (err) {
    console.error('[MultiBrowse] Loader cleanup failed:', err.message);
    return false;
  }
}

const LOADER_BLOCK = `
${LOADER_MARKER} (auto-generated — safe to delete this whole block)
try {
  (function () {
    var Cc = Components.classes, Ci = Components.interfaces;
    var S = (typeof Services !== "undefined")
      ? Services
      : ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
    var sss = Cc["@mozilla.org/content/style-sheet-service;1"]
                .getService(Ci.nsIStyleSheetService);
    var prof = S.dirsvc.get("ProfD", Ci.nsIFile);
    var f = prof.clone();
    f.append("chrome");
    f.append("userChrome.css");
    if (f.exists()) {
      var uri = S.io.newFileURI(f);
      if (!sss.sheetRegistered(uri, sss.USER_SHEET)) {
        sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
      }
    }
  })();
} catch (e) {}
${LOADER_END}
`;

/**
 * Installs OR removes the loader depending on THEME.forceLoadStylesheet.
 * Always leaves camoufox.cfg in exactly one known state, so flipping the
 * switch and relaunching gives a clean A/B test.
 */
async function applyThemeLoader(binPath) {
  await removeThemeLoader(binPath);
  if (!THEME.forceLoadStylesheet) return false;
  // Nothing is written to userChrome.css in this combination, so there
  // is nothing to force-load.
  if (!THEME.enabled && !THEME.badgeWhenDisabled) return false;
  try {
    const engineDir = resourcesDirForBinary(binPath);
    const files = (await fsp.readdir(engineDir)).filter((f) => f.endsWith('.cfg'));
    if (files.length === 0) {
      console.warn('[MultiBrowse] No .cfg found — cannot force-load stylesheet');
      return false;
    }
    for (const file of files) {
      const cfgPath = path.join(engineDir, file);
      const content = await fsp.readFile(cfgPath, 'utf8');
      await fsp.writeFile(cfgPath, content.trimEnd() + '\n' + LOADER_BLOCK, 'utf8');
    }
    console.log('[MultiBrowse] Stylesheet force-loader INSTALLED (diagnostic mode)');
    return true;
  } catch (err) {
    console.error('[MultiBrowse] Force-loader install failed:', err.message);
    return false;
  }
}

module.exports = {
  THEME,
  buildUserChromeCss,
  buildUserContentCss,
  writeBrowserTheme,
  removeThemeLoader,
  applyThemeLoader,
};
