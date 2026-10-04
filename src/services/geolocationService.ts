import { CountryData } from '../types/game';
import { getCountryByCode, COUNTRIES } from './countryData';

export interface DetectedLocation {
  countryCode: string;
  countryName: string;
  countryFlag: string;
  source: 'ip_api' | 'timezone' | 'cache' | 'fallback';
}

const GEO_CACHE_KEY = 'wc_detected_geo_v2';
const MANUAL_COUNTRY_LOCK_KEY = 'wc_manual_country_locked';

let cachedPromise: Promise<DetectedLocation> | null = null;
let latestDetected: DetectedLocation | null = null;

/**
 * Converts any valid 2-letter ISO-3166-1 alpha-2 country code (e.g. "CA", "FR", "DZ", "TN")
 * into its regional indicator Unicode flag emoji (e.g. "🇨🇦", "🇫🇷", "🇩🇿", "🇹🇳").
 */
export function isoCodeToFlagEmoji(code: string): string {
  const clean = (code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '🌍';
  const offset = 127397;
  return String.fromCodePoint(
    clean.charCodeAt(0) + offset,
    clean.charCodeAt(1) + offset
  );
}

/**
 * Resolves full country name from our COUNTRIES list or browser Intl.DisplayNames
 */
export function resolveCountryDetails(
  rawCode?: string,
  rawName?: string
): { countryCode: string; countryName: string; countryFlag: string } {
  const code = (rawCode || 'TN').trim().toUpperCase();
  const known = getCountryByCode(code);
  if (known) {
    return {
      countryCode: known.code,
      countryName: known.name,
      countryFlag: known.flag,
    };
  }

  let resolvedName = rawName?.trim() || '';
  if (!resolvedName && typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
      resolvedName = regionNames.of(code) || code;
    } catch {
      resolvedName = code;
    }
  }

  if (!resolvedName) {
    resolvedName = code;
  }

  return {
    countryCode: code,
    countryName: resolvedName,
    countryFlag: isoCodeToFlagEmoji(code),
  };
}

/**
 * Maps common IANA timezones to ISO country codes as an ad-blocker-resilient fallback
 */
function detectFromTimezone(): { code: string; name?: string } | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;

    const tzMap: Record<string, string> = {
      'Africa/Tunis': 'TN',
      'Africa/Algiers': 'DZ',
      'Africa/Casablanca': 'MA',
      'Africa/Cairo': 'EG',
      'Africa/Lagos': 'NG',
      'Africa/Nairobi': 'KE',
      'Africa/Johannesburg': 'ZA',
      'Europe/Paris': 'FR',
      'Europe/London': 'GB',
      'Europe/Berlin': 'DE',
      'Europe/Madrid': 'ES',
      'Europe/Rome': 'IT',
      'Europe/Athens': 'GR',
      'Europe/Oslo': 'NO',
      'Europe/Brussels': 'BE',
      'Europe/Amsterdam': 'NL',
      'Europe/Zurich': 'CH',
      'Europe/Istanbul': 'TR',
      'America/Toronto': 'CA',
      'America/Montreal': 'CA',
      'America/Vancouver': 'CA',
      'America/Halifax': 'CA',
      'America/Winnipeg': 'CA',
      'America/Edmonton': 'CA',
      'America/St_Johns': 'CA',
      'America/New_York': 'US',
      'America/Chicago': 'US',
      'America/Denver': 'US',
      'America/Los_Angeles': 'US',
      'America/Phoenix': 'US',
      'America/Mexico_City': 'MX',
      'America/Sao_Paulo': 'BR',
      'America/Argentina/Buenos_Aires': 'AR',
      'America/Bogota': 'CO',
      'America/Lima': 'PE',
      'Asia/Tokyo': 'JP',
      'Asia/Seoul': 'KR',
      'Asia/Kolkata': 'IN',
      'Asia/Calcutta': 'IN',
      'Asia/Bangkok': 'TH',
      'Asia/Dubai': 'AE',
      'Asia/Riyadh': 'SA',
      'Australia/Sydney': 'AU',
      'Australia/Melbourne': 'AU',
    };

    if (tzMap[tz]) {
      return { code: tzMap[tz] };
    }

    if (tz.includes('Canada') || tz.startsWith('America/Toronto') || tz.startsWith('America/Montreal')) {
      return { code: 'CA' };
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchWithTimeout(url: string, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches the user's real country via multi-provider IP Geolocation:
 * 1. https://ipwho.is/
 * 2. https://ipapi.co/json/
 * 3. https://api.country.is/
 * 4. https://get.geojs.io/v1/ip/country.json
 * 5. Timezone heuristic fallback
 * 6. Final safety fallback: Tunisia ('TN')
 */
export async function detectUserCountry(forceRefresh = false): Promise<DetectedLocation> {
  if (!forceRefresh && latestDetected) {
    return latestDetected;
  }

  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cachedRaw = sessionStorage.getItem(GEO_CACHE_KEY) || localStorage.getItem(GEO_CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as DetectedLocation;
        if (parsed?.countryCode && /^[A-Z]{2}$/.test(parsed.countryCode)) {
          latestDetected = parsed;
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!forceRefresh && cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = (async (): Promise<DetectedLocation> => {
    // Provider 1: ipwho.is (Fast, free HTTPS JSON, CORS enabled, no API key required)
    try {
      const res = await fetchWithTimeout('https://ipwho.is/', 3200);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false && typeof data.country_code === 'string' && data.country_code.length === 2) {
          const details = resolveCountryDetails(data.country_code, data.country);
          const result: DetectedLocation = { ...details, source: 'ip_api' };
          saveDetectedLocation(result);
          return result;
        }
      }
    } catch {
      // Try next provider
    }

    // Provider 2: ipapi.co/json/
    try {
      const res = await fetchWithTimeout('https://ipapi.co/json/', 3200);
      if (res.ok) {
        const data = await res.json();
        const code = data?.country_code || data?.country;
        if (typeof code === 'string' && code.length === 2) {
          const details = resolveCountryDetails(code, data?.country_name);
          const result: DetectedLocation = { ...details, source: 'ip_api' };
          saveDetectedLocation(result);
          return result;
        }
      }
    } catch {
      // Try next provider
    }

    // Provider 3: api.country.is
    try {
      const res = await fetchWithTimeout('https://api.country.is/', 3000);
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.country === 'string' && data.country.length === 2) {
          const details = resolveCountryDetails(data.country);
          const result: DetectedLocation = { ...details, source: 'ip_api' };
          saveDetectedLocation(result);
          return result;
        }
      }
    } catch {
      // Try next provider
    }

    // Provider 4: geojs.io
    try {
      const res = await fetchWithTimeout('https://get.geojs.io/v1/ip/country.json', 3000);
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.country === 'string' && data.country.length === 2) {
          const details = resolveCountryDetails(data.country, data?.name);
          const result: DetectedLocation = { ...details, source: 'ip_api' };
          saveDetectedLocation(result);
          return result;
        }
      }
    } catch {
      // Fall through to timezone check
    }

    // Fallback A: Browser IANA Timezone (works even when ad-blockers block all IP APIs)
    const tzDetected = detectFromTimezone();
    if (tzDetected) {
      const details = resolveCountryDetails(tzDetected.code, tzDetected.name);
      const result: DetectedLocation = { ...details, source: 'timezone' };
      saveDetectedLocation(result);
      return result;
    }

    // Final Fallback Safety: Default to Tunisia ('TN') only if all lookups fail
    const tn = getCountryByCode('TN') || COUNTRIES[0];
    const fallbackResult: DetectedLocation = {
      countryCode: tn.code,
      countryName: tn.name,
      countryFlag: tn.flag,
      source: 'fallback',
    };
    latestDetected = fallbackResult;
    return fallbackResult;
  })();

  return cachedPromise;
}

function saveDetectedLocation(loc: DetectedLocation) {
  latestDetected = loc;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(loc));
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(loc));
    } catch {
      // ignore
    }
  }
}

export function getSyncDetectedCountry(): {
  countryCode: string;
  countryName: string;
  countryFlag: string;
} {
  if (latestDetected) {
    return {
      countryCode: latestDetected.countryCode,
      countryName: latestDetected.countryName,
      countryFlag: latestDetected.countryFlag,
    };
  }

  if (typeof window !== 'undefined') {
    try {
      const cachedRaw = sessionStorage.getItem(GEO_CACHE_KEY) || localStorage.getItem(GEO_CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as DetectedLocation;
        if (parsed?.countryCode) {
          return resolveCountryDetails(parsed.countryCode, parsed.countryName);
        }
      }
    } catch {
      // ignore
    }
  }

  const tz = detectFromTimezone();
  if (tz) {
    return resolveCountryDetails(tz.code, tz.name);
  }

  return resolveCountryDetails('TN', 'Tunisia');
}

export function markManualCountrySelection(code: string) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MANUAL_COUNTRY_LOCK_KEY, code.toUpperCase());
    } catch {
      // ignore
    }
  }
}

export function hasManualCountrySelection(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(MANUAL_COUNTRY_LOCK_KEY));
  } catch {
    return false;
  }
}
