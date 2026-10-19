// Passwörter, Tokens und Verschlüsselung sensibler Inhalte (AES-256-GCM).
import crypto from 'node:crypto';
import { config } from './config';
import { sensitiveKeys, type ContentData } from '../shared/content';

export const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) {
    // Gleiche Laufzeit wie ein echter Vergleich, damit Konten nicht erratbar sind
    crypto.scryptSync(pw, 'tessera-dummy-salt', 32, SCRYPT);
    return false;
  }
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(expected, actual);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Das Passwort braucht mindestens 10 Zeichen.';
  if (pw.length > 200) return 'Das Passwort ist zu lang.';
  return null;
}

const KEY = crypto.createHash('sha256').update(Buffer.concat([config.secret, Buffer.from('tessera-content-v1')])).digest();

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function decrypt(token: string): string | null {
  try {
    if (!token.startsWith('v1.')) return null;
    const raw = Buffer.from(token.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Verschlüsselt sensible Felder für die Ablage. Bei storeSecrets=false werden sie verworfen. */
export function sealContent(type: string, content: ContentData, storeSecrets: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content };
  for (const k of sensitiveKeys(type)) {
    const v = content[k];
    if (typeof v !== 'string' || !v) continue;
    out[k] = storeSecrets ? { $enc: encrypt(v) } : '';
  }
  return out;
}

export function openContent(raw: Record<string, unknown>): ContentData {
  const out: ContentData = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object' && '$enc' in (v as object)) out[k] = decrypt(String((v as { $enc: string }).$enc)) ?? '';
    else if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** Kurz-IDs für dynamische Codes: ohne verwechselbare Zeichen (0/O, 1/l/I). */
const SLUG_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export function randomSlug(len = 7): string {
  let s = '';
  for (let i = 0; i < len; i++) s += SLUG_ALPHABET[crypto.randomInt(SLUG_ALPHABET.length)];
  return s;
}

export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
