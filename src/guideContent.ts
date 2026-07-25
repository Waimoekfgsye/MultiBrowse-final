/**
 * Every hover guide in the app lives here, so the wording stays
 * consistent and can be reviewed in one place instead of being scattered
 * across a dozen JSX attributes.
 *
 * Writing rules for this file:
 *   - `title` names the control the way the user thinks about it.
 *   - `body` says what happens when they use it, in one sentence.
 *   - No marketing, no "click here", no trailing "!".
 */

export interface GuideEntry {
  title: string;
  body: string;
  /** Optional keyboard shortcut, rendered as a key cap. */
  shortcut?: string;
}

export const GUIDES = {
  // ── Sidebar navigation ──────────────────────────────────────────
  'nav.profiles': {
    title: 'Profiles',
    body: 'Every browser identity you have created. Start, edit or clone them from here.',
  },
  'nav.groups': {
    title: 'Groups',
    body: 'Sort profiles into folders — one per client, marketplace or project.',
  },
  'nav.proxies': {
    title: 'Proxies',
    body: 'See which profiles route through a proxy and test whether those proxies still answer.',
  },
  'nav.settings': {
    title: 'Settings',
    body: 'Theme, accent colour and interface options.',
  },

  // ── Sidebar tools ───────────────────────────────────────────────
  'sidebar.startupUrls': {
    title: 'Startup URLs',
    body: 'Pages every profile opens on launch. Drag to reorder — the first one lands in the first tab.',
  },
  'sidebar.addUrl': {
    title: 'Add a startup URL',
    body: 'Adds one more tab to open whenever a profile starts.',
  },
  'sidebar.import': {
    title: 'Import profiles',
    body: 'Load profiles from a MultiBrowse export file. Existing profiles are kept.',
  },
  'sidebar.export': {
    title: 'Export profiles',
    body: 'Save the selected profiles to a file you can back up or move to another machine.',
  },
  'sidebar.sync': {
    title: 'Pull from cloud',
    body: 'Replaces this device\u2019s profile list with the copy stored in your account.',
  },
  'sidebar.logout': {
    title: 'Sign out',
    body: 'Ends the session on this device. Profiles stay on disk.',
  },
  'sidebar.upgrade': {
    title: 'Upgrade to Premium',
    body: 'Unlocks import, export and unlimited profiles with a one-time key.',
  },

  // ── Profile list ────────────────────────────────────────────────
  'profiles.new': {
    title: 'New profile',
    body: 'Creates a profile with a fresh fingerprint — its own canvas, fonts, WebGL and timezone.',
  },
  'profiles.selectAll': {
    title: 'Select all',
    body: 'Ticks every profile in view so you can delete or export them together.',
  },
  'profiles.bulkDelete': {
    title: 'Delete selected',
    body: 'Removes the ticked profiles and their browser data. This cannot be undone.',
  },
  'profiles.viewList': {
    title: 'List view',
    body: 'Compact rows — best when you are running many profiles at once.',
  },
  'profiles.viewCards': {
    title: 'Card view',
    body: 'Larger tiles showing each profile\u2019s icon, proxy and last run.',
  },
  'profile.start': {
    title: 'Start profile',
    body: 'Launches the browser with this profile\u2019s fingerprint, proxy and cookies. First launch copies the engine, so it takes longer.',
  },
  'profile.stop': {
    title: 'Stop profile',
    body: 'Closes the browser and everything it opened, then saves the session.',
  },
  'profile.edit': {
    title: 'Edit profile',
    body: 'Change the name, proxy, fingerprint and startup pages.',
  },
  'profile.more': {
    title: 'More actions',
    body: 'Clone, lock with a PIN, move to a group or delete.',
  },

  // ── Profile editor ──────────────────────────────────────────────
  'editor.proxy': {
    title: 'Proxy',
    body: 'All traffic from this profile goes through this address. Leave it as None to use your own connection.',
  },
  'editor.os': {
    title: 'Operating system',
    body: 'Sets the platform the profile reports. Match it to the proxy\u2019s region for a believable pair.',
  },
  'editor.webgl': {
    title: 'WebGL spoofing',
    body: 'Reports a consistent fake GPU instead of your real one. Turn it off if a site refuses to render.',
  },
  'editor.fonts': {
    title: 'Font list',
    body: 'Controls which fonts the profile admits to having. Fewer fonts is less unique but also less human.',
  },
  'editor.mediaDevices': {
    title: 'Media devices',
    body: 'How many cameras, microphones and speakers the profile reports.',
  },

  // ── Settings ────────────────────────────────────────────────────
  'settings.accent': {
    title: 'Accent colour',
    body: 'Applies to buttons, tabs, the cursor and every highlight in the app.',
  },
  'settings.guides': {
    title: 'Hover guides',
    body: 'These pop-ups. Turn them off once you know your way around.',
  },
} as const satisfies Record<string, GuideEntry>;

export type GuideId = keyof typeof GUIDES;
