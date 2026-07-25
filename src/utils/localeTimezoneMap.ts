/**
 * Locale → plausible IANA timezone mapping.
 */
export const LOCALE_TIMEZONE_MAP: Record<string, string[]> = {
  // English
  'en-US': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
  'en-GB': ['Europe/London'],
  'en-AU': ['Australia/Sydney', 'Australia/Melbourne'],
  'en-CA': ['America/Toronto', 'America/Vancouver'],
  // German
  'de-DE': ['Europe/Berlin'],
  'de-AT': ['Europe/Vienna'],
  'de-CH': ['Europe/Zurich'],
  // French
  'fr-FR': ['Europe/Paris'],
  'fr-CA': ['America/Toronto'],
  'fr-BE': ['Europe/Brussels'],
  // Spanish
  'es-ES': ['Europe/Madrid'],
  'es-MX': ['America/Mexico_City'],
  'es-AR': ['America/Argentina/Buenos_Aires'],
  // Italian
  'it-IT': ['Europe/Rome'],
  // Portuguese
  'pt-BR': ['America/Sao_Paulo'],
  'pt-PT': ['Europe/Lisbon'],
  // Dutch
  'nl-NL': ['Europe/Amsterdam'],
  'nl-BE': ['Europe/Brussels'],
  // Russian
  'ru-RU': ['Europe/Moscow'],
  // Japanese
  'ja-JP': ['Asia/Tokyo'],
  // Korean
  'ko-KR': ['Asia/Seoul'],
  // Chinese
  'zh-CN': ['Asia/Shanghai'],
  'zh-TW': ['Asia/Taipei'],
  'zh-HK': ['Asia/Hong_Kong'],
  // Arabic
  'ar-SA': ['Asia/Riyadh'],
  'ar-AE': ['Asia/Dubai'],
  // Hindi
  'hi-IN': ['Asia/Kolkata'],
  // Turkish
  'tr-TR': ['Europe/Istanbul'],
  // Polish
  'pl-PL': ['Europe/Warsaw'],
  // Swedish
  'sv-SE': ['Europe/Stockholm'],
  // Danish
  'da-DK': ['Europe/Copenhagen'],
  // Norwegian
  'nb-NO': ['Europe/Oslo'],
  // Finnish
  'fi-FI': ['Europe/Helsinki'],
  // Thai
  'th-TH': ['Asia/Bangkok'],
  // Vietnamese
  'vi-VN': ['Asia/Ho_Chi_Minh'],
  // Indonesian
  'id-ID': ['Asia/Jakarta'],
  // Malay
  'ms-MY': ['Asia/Kuala_Lumpur'],
  // Czech
  'cs-CZ': ['Europe/Prague'],
  // Ukrainian
  'uk-UA': ['Europe/Kyiv'],
  // Hungarian
  'hu-HU': ['Europe/Budapest'],
  // Romanian
  'ro-RO': ['Europe/Bucharest'],
};

export function getTimezoneForLocale(locale: string): string {
  const timezones = LOCALE_TIMEZONE_MAP[locale];
  if (timezones && timezones.length > 0) {
    return timezones[Math.floor(Math.random() * timezones.length)];
  }
  const lang = locale.split('-')[0];
  for (const [key, tzs] of Object.entries(LOCALE_TIMEZONE_MAP)) {
    if (key.startsWith(lang + '-') && tzs.length > 0) {
      return tzs[Math.floor(Math.random() * tzs.length)];
    }
  }
  return 'America/New_York';
}

export function getAllMappedTimezones(): string[] {
  const set = new Set<string>();
  for (const tzs of Object.values(LOCALE_TIMEZONE_MAP)) {
    for (const tz of tzs) set.add(tz);
  }
  return Array.from(set).sort();
}
