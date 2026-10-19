// Einordnung von Basisadressen für dynamische Codes: intern oder öffentlich erreichbar?

const INTERNAL_SUFFIXES = ['.local', '.lan', '.intern', '.internal', '.intranet', '.home.arpa', '.corp', '.home', '.localdomain', '.test'];

export function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (!h.includes('.') && !h.includes(':')) return true; // Einzelname wie "qrserver"
  if (INTERNAL_SUFFIXES.some((s) => h.endsWith(s))) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return false;
}

export type LinkScope = 'internal' | 'public';

export function linkScope(baseUrl: string): LinkScope {
  try {
    return isInternalHost(new URL(baseUrl).hostname) ? 'internal' : 'public';
  } catch {
    return 'internal';
  }
}

export const shortUrl = (base: string, slug: string) => `${base.replace(/\/+$/, '')}/r/${slug}`;

export const RESERVED_SLUGS = new Set(['api', 'admin', 'login', 'setup', 'assets', 'static', 'healthz', 'r', 'f']);
