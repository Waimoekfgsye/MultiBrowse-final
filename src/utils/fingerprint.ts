import type { Fingerprint } from '../types';
import { getTimezoneForLocale } from './localeTimezoneMap';

const OS_OPTIONS = ['Windows', 'macOS', 'Linux'];

const OS_VERSIONS: Record<string, string[]> = {
  'Windows': ['Windows 11 24H2', 'Windows 11 23H2', 'Windows 11 22H2', 'Windows 10 22H2', 'Windows 10 21H2'],
  'macOS': ['macOS 15 Sequoia', 'macOS 14 Sonoma', 'macOS 13 Ventura', 'macOS 12 Monterey'],
  'Linux': ['Ubuntu 24.04', 'Ubuntu 22.04', 'Fedora 40', 'Fedora 39', 'Debian 12', 'Arch Linux'],
};

const BROWSER_VERSIONS: Record<string, string[]> = {
  // Camoufox engine is Firefox-based. Must match the actual Camoufox binary version.
  'macOS': ['Firefox 152'],
  'Windows': ['Firefox 152'],
  'Linux': ['Firefox 152'],
};

function getBrowserFamily(browserVersion: string): 'firefox' | 'chromium' | 'webkit' {
  const name = browserVersion.split(' ')[0];
  if (name === 'Firefox') return 'firefox';
  if (name === 'Safari') return 'webkit';
  return 'chromium';
}

function isExperimentalBrowser(browserVersion: string): boolean {
  return getBrowserFamily(browserVersion) !== 'chromium';
}

const MAC_RESOLUTIONS = ['2560x1600', '2880x1800', '3024x1964', '3456x2234', '5120x2880', '1920x1200', '2560x1440', '1440x900'];
const PC_RESOLUTIONS = ['1920x1080', '2560x1440', '3840x2160', '1366x768', '1536x864', '1680x1050', '1600x900', '3440x1440'];
const SCREEN_RESOLUTIONS = [...PC_RESOLUTIONS, ...MAC_RESOLUTIONS];

const LANGUAGES = [
  'en-US', 'en-GB', 'en-AU', 'en-CA', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'pt-PT',
  'nl-NL', 'ru-RU', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'ar-SA', 'hi-IN', 'tr-TR', 'pl-PL',
  'sv-SE', 'da-DK', 'nb-NO', 'fi-FI', 'th-TH', 'vi-VN', 'id-ID', 'ms-MY', 'cs-CZ', 'uk-UA',
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto',
  'America/Sao_Paulo', 'America/Mexico_City', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Moscow', 'Europe/Istanbul',
  'Europe/Warsaw', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Jakarta', 'Australia/Sydney', 'Australia/Melbourne',
  'Pacific/Auckland', 'Africa/Cairo', 'Africa/Johannesburg',
];

const WEBGL_MAC: { vendor: string; renderer: string }[] = [
  { vendor: 'Apple Inc.', renderer: 'Apple M1' },
  { vendor: 'Apple Inc.', renderer: 'Apple M1 Pro' },
  { vendor: 'Apple Inc.', renderer: 'Apple M1 Max' },
  { vendor: 'Apple Inc.', renderer: 'Apple M2' },
  { vendor: 'Apple Inc.', renderer: 'Apple M2 Pro' },
  { vendor: 'Apple Inc.', renderer: 'Apple M2 Max' },
  { vendor: 'Apple Inc.', renderer: 'Apple M3' },
  { vendor: 'Apple Inc.', renderer: 'Apple M3 Pro' },
  { vendor: 'Apple Inc.', renderer: 'Apple M4' },
  { vendor: 'Apple Inc.', renderer: 'Apple M4 Pro' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon Pro 5500M OpenGL Engine' },
];

const WEBGL_WINDOWS: { vendor: string; renderer: string }[] = [
  // NVIDIA RTX 40 series
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0)' },
  // NVIDIA RTX 30 series
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)' },
  // NVIDIA GTX 16 series
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)' },
  // NVIDIA GTX 10 series
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)' },
  // NVIDIA GTX 9 series
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 970 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 960 Direct3D11 vs_5_0 ps_5_0)' },
  // NVIDIA RTX 20 series
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2080 Ti Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2080 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0)' },
  // AMD Radeon RX 7000/6000/5000
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7700 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6900 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)' },
  // Intel
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel Arc A770 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel Arc A750 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel UHD Graphics 730 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel Iris Xe Graphics Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)' },
];

const WEBGL_LINUX: { vendor: string; renderer: string }[] = [
  // NVIDIA
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 4090/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 4080/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 4070 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 4070/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 4060 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 4060/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3090/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3080 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3080/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3070 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3070/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3060 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 2080 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 2080/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 2070/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 2060/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1660 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1660 SUPER/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1080 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1080/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1070/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1060/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 980 Ti/PCIe/SSE2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 980/PCIe/SSE2' },
  // AMD
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 7900 XTX' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 7800 XT' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 7700 XT' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 6900 XT' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 6800 XT' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 6700 XT' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 5700 XT' },
  { vendor: 'ATI Technologies Inc.', renderer: 'AMD Radeon RX 580' },
  { vendor: 'X.Org', renderer: 'AMD Radeon RX 7900 XTX (radeonsi, navi31, LLVM 15.0.7)' },
  { vendor: 'X.Org', renderer: 'AMD Radeon RX 6800 XT (radeonsi, navi21, LLVM 15.0.7)' },
  // Intel
  { vendor: 'Intel', renderer: 'Mesa Intel(R) Arc(TM) A770 Graphics' },
  { vendor: 'Intel', renderer: 'Mesa Intel(R) UHD Graphics 770' },
  { vendor: 'Intel', renderer: 'Mesa Intel(R) UHD Graphics 730' },
  { vendor: 'Intel', renderer: 'Mesa Intel(R) Iris(R) Xe Graphics' },
  { vendor: 'Intel', renderer: 'Mesa Intel(R) UHD Graphics 630' },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getOSCategory(os: string): 'macOS' | 'Windows' | 'Linux' {
  if (os === 'macOS') return 'macOS';
  if (os === 'Windows') return 'Windows';
  return 'Linux';
}

function buildUserAgent(os: string, browser: string): string {
  const cat = getOSCategory(os);
  const bName = browser.split(' ')[0];
  const bVer = browser.replace(/^[^\d]+/, '').split(' ')[0];

  let osPart = '';
  if (cat === 'macOS') osPart = 'Macintosh; Intel Mac OS X 10_15_7';
  else if (cat === 'Windows') osPart = 'Windows NT 10.0; Win64; x64';
  else osPart = 'X11; Linux x86_64';

  if (bName === 'Chrome' || bName === 'Brave' || bName === 'Arc' || bName === 'Vivaldi' || bName === 'Opera') {
    return `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${bVer || '131'}.0.0.0 Safari/537.36`;
  } else if (bName === 'Edge') {
    return `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${bVer}.0.6478.36 Safari/537.36 Edg/${bVer}.0.0.0`;
  } else if (bName === 'Firefox') {
    return `Mozilla/5.0 (${osPart}; rv:${bVer}.0) Gecko/20100101 Firefox/${bVer}.0`;
  } else if (bName === 'Safari') {
    return `Mozilla/5.0 (${osPart}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${bVer} Safari/605.1.15`;
  }

  return `Mozilla/5.0 (${osPart}; rv:152.0) Gecko/20100101 Firefox/152.0`;
}

function generateFingerprint(os?: string): Fingerprint {
  const selectedOS = os || pick(OS_OPTIONS);
  const cat = getOSCategory(selectedOS);
  const browsers = BROWSER_VERSIONS[cat] || BROWSER_VERSIONS['Windows'];
  const browserVersion = pick(browsers);
  const resolutions = cat === 'macOS' ? MAC_RESOLUTIONS : PC_RESOLUTIONS;

  let webgl: { vendor: string; renderer: string };
  if (cat === 'macOS') webgl = pick(WEBGL_MAC);
  else if (cat === 'Windows') webgl = pick(WEBGL_WINDOWS);
  else webgl = pick(WEBGL_LINUX);

  const hwConcurrency = cat === 'macOS' ? pick([8, 10, 12, 16, 24]) : pick([4, 6, 8, 12, 16, 24, 32]);
  const devMemory = pick([4, 8, 16, 32, 64]);
  const versions = OS_VERSIONS[cat] || OS_VERSIONS['Windows'];
  const osVersion = pick(versions);

  const language = pick(LANGUAGES);
  const timezone = getTimezoneForLocale(language);

  return {
    os: selectedOS,
    osVersion,
    browserVersion,
    screenResolution: pick(resolutions),
    language,
    timezone,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    hardwareConcurrency: hwConcurrency,
    deviceMemory: devMemory,
    canvasNoise: Math.random() > 0.3,
    audioNoise: Math.random() > 0.3,
    webrtcMode: pick(['real', 'disabled', 'altered'] as const),
    userAgent: buildUserAgent(selectedOS, browserVersion),
    webglSpoof: true,
    mediaSpoof: true,
    // A machine with no microphone and no camera is itself a signal, so
    // the default is a mundane laptop: one of each, two audio outputs.
    mediaDevices: {
      micros: pick([1, 1, 1, 2]),
      webcams: pick([0, 1, 1, 1]),
      speakers: pick([1, 2, 2, 3]),
    },
    fontSpoof: true,
    // Fixed per profile so text measurements stay identical between
    // sessions — a seed that changed on every launch would itself be
    // detectable.
    fontSpacingSeed: Math.floor(Math.random() * 1_000_000),
  };
}

/** Fonts that ship with each OS. Reported instead of the real list when
 *  fontSpoof is on, so the font fingerprint matches the claimed OS
 *  rather than the machine actually running the browser. */
const FONT_SETS: Record<string, string[]> = {
  Windows: [
    'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math',
    'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
    'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi',
    'Georgia', 'Impact', 'Ink Free', 'Javanese Text', 'Leelawadee UI',
    'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic', 'Marlett',
    'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue',
    'Microsoft PhagsPa', 'Microsoft Sans Serif', 'Microsoft Tai Le',
    'Microsoft YaHei', 'Mongolian Baiti', 'MS Gothic', 'MV Boli',
    'Myanmar Text', 'Nirmala UI', 'Palatino Linotype', 'Segoe MDL2 Assets',
    'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Emoji',
    'Segoe UI Historic', 'Segoe UI Symbol', 'SimSun', 'Sitka', 'Sylfaen',
    'Symbol', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'Webdings', 'Wingdings', 'Yu Gothic',
  ],
  macOS: [
    'American Typewriter', 'Andale Mono', 'Arial', 'Arial Black',
    'Arial Narrow', 'Arial Rounded MT Bold', 'Arial Unicode MS', 'Avenir',
    'Avenir Next', 'Avenir Next Condensed', 'Baskerville', 'Big Caslon',
    'Bodoni 72', 'Bradley Hand', 'Brush Script MT', 'Chalkboard',
    'Chalkboard SE', 'Chalkduster', 'Charter', 'Cochin', 'Comic Sans MS',
    'Copperplate', 'Courier', 'Courier New', 'Didot', 'DIN Alternate',
    'DIN Condensed', 'Futura', 'Geneva', 'Georgia', 'Gill Sans', 'Helvetica',
    'Helvetica Neue', 'Herculanum', 'Hoefler Text', 'Impact', 'Lucida Grande',
    'Luminari', 'Marker Felt', 'Menlo', 'Microsoft Sans Serif', 'Monaco',
    'Noteworthy', 'Optima', 'Palatino', 'Papyrus', 'Phosphate', 'Rockwell',
    'Savoye LET', 'SignPainter', 'Skia', 'Snell Roundhand', 'Tahoma',
    'Times', 'Times New Roman', 'Trattatello', 'Trebuchet MS', 'Verdana',
    'Zapfino',
  ],
  Linux: [
    'Bitstream Charter', 'C059', 'Century Schoolbook L', 'Cantarell',
    'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'D050000L',
    'Dingbats', 'FreeMono', 'FreeSans', 'FreeSerif', 'Liberation Mono',
    'Liberation Sans', 'Liberation Sans Narrow', 'Liberation Serif',
    'Nimbus Mono PS', 'Nimbus Roman', 'Nimbus Sans', 'Nimbus Sans Narrow',
    'Noto Color Emoji', 'Noto Mono', 'Noto Sans', 'Noto Serif', 'P052',
    'Standard Symbols PS', 'Ubuntu', 'Ubuntu Condensed', 'Ubuntu Mono',
    'URW Bookman', 'URW Gothic', 'Z003',
  ],
};

/** Font list matching an OS name as shown in the profile editor. */
function getFontsForOS(os: string): string[] {
  return FONT_SETS[getOSCategory(os)] || FONT_SETS.Windows;
}

function regenerateForOS(os: string, _existing: Fingerprint): Fingerprint {
  return generateFingerprint(os);
}

export {
  generateFingerprint, regenerateForOS, getOSCategory, getBrowserFamily,
  isExperimentalBrowser, OS_OPTIONS, OS_VERSIONS, BROWSER_VERSIONS,
  SCREEN_RESOLUTIONS, MAC_RESOLUTIONS, PC_RESOLUTIONS, LANGUAGES, TIMEZONES,
  WEBGL_MAC, WEBGL_WINDOWS, WEBGL_LINUX, FONT_SETS, getFontsForOS
};
