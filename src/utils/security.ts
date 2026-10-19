/**
 * Security utilities for input sanitization, XSS mitigation, and safe URL validation.
 */

// Basic HTML entity encoding to prevent XSS in text renderings
export function escapeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Strips HTML tags and dangerous characters
export function stripHtml(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Validates and sanitizes a username:
 * - Strips HTML tags
 * - Allows alphanumeric characters, spaces, hyphens, underscores, and international letters/emojis
 * - Enforces length between 2 and 30 characters
 */
export function sanitizeUsername(rawName: string, fallback: string = 'Explorer'): string {
  if (!rawName) return fallback;
  const stripped = stripHtml(rawName)
    // Remove null bytes and control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Collapse consecutive whitespaces
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length < 2) return fallback;
  return stripped.slice(0, 30);
}

/**
 * Validates and sanitizes user bio text:
 * - Strips HTML tags
 * - Removes control characters
 * - Limits length to max 160 characters
 */
export function sanitizeBio(rawBio: string): string {
  if (!rawBio) return '';
  return stripHtml(rawBio)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 160);
}

/**
 * Validates that an avatar URL uses a safe protocol (HTTPS or authorized image data URI).
 * Strictly forbids javascript:, vbscript:, data:text/html, file:, and other unsafe protocols.
 */
export function isValidAvatarUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  // Guard against massive payload denial of service
  if (trimmed.length > 200000) return false;

  // Strict check against pseudo-protocols
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('javascript:') ||
    lower.includes('vbscript:') ||
    lower.includes('data:text/html') ||
    lower.includes('data:application') ||
    lower.includes('file:')
  ) {
    return false;
  }

  // Safe data URI for images
  if (lower.startsWith('data:image/')) {
    const isSafeImageMime =
      lower.startsWith('data:image/png;base64,') ||
      lower.startsWith('data:image/jpeg;base64,') ||
      lower.startsWith('data:image/jpg;base64,') ||
      lower.startsWith('data:image/webp;base64,') ||
      lower.startsWith('data:image/gif;base64,');
    return isSafeImageMime;
  }

  // Safe web URLs must use HTTPS
  if (lower.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  // Allow relative URLs starting with / (e.g. static assets)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  return false;
}

/**
 * Sanitizes an avatar URL, returning a guaranteed safe avatar if invalid.
 */
export const DEFAULT_SAFE_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

export function sanitizeAvatarUrl(url: string | undefined | null): string {
  if (!url || !isValidAvatarUrl(url)) {
    return DEFAULT_SAFE_AVATAR;
  }
  return url.trim();
}

/**
 * Sanitizes in-game chat messages:
 * - Strips script tags and HTML entities
 * - Masks profanity
 * - Enforces max length of 300 characters
 */
export function sanitizeChatMessage(raw: string): string {
  if (!raw) return '';
  let clean = stripHtml(raw)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 300);

  const blocklist = ['badword', 'swear', 'spam', 'hate'];
  blocklist.forEach((word) => {
    const reg = new RegExp(word, 'gi');
    clean = clean.replace(reg, '***');
  });

  return clean;
}
