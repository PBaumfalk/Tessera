// Host-Prüfungen: interne Oberfläche, öffentlicher Kurzlink-Host, Schutz vor DNS-Rebinding.
import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { config } from './config';
import { getSetting } from './db';

/** Kleinschreibung, ohne Port und ohne abschließenden Punkt. */
export function normHost(raw: string | undefined): string {
  let h = String(raw ?? '').trim().toLowerCase();
  if (h.startsWith('[')) h = h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined);
  else h = h.replace(/:\d+$/, '');
  return h.replace(/\.+$/, '');
}

export function hostOfUrl(url: string): string {
  try {
    return normHost(new URL(url).host);
  } catch {
    return '';
  }
}

/** Hosts, unter denen die Oberfläche bedient wird (APP_URL und ALLOWED_HOSTS). */
export function internalHosts(): Set<string> {
  const s = new Set(config.allowedHosts.map(normHost));
  const app = hostOfUrl(config.appUrl);
  if (app) s.add(app);
  return s;
}

export function publicHost(): string {
  return hostOfUrl(config.publicBaseUrl || getSetting<string>('publicBaseUrl', ''));
}

/** Host der Anfrage, wie ihn der Client gesendet hat (kein X-Forwarded-Host). */
export const requestHost = (req: FastifyRequest) => normHost(req.headers.host);

/**
 * Darf auf diesem Host nur weitergeleitet werden?
 * Nur mit bekannten internen Hosts (APP_URL/ALLOWED_HOSTS): Dann bekommt jeder andere Host nur /r/ und
 * /healthz (Allowlist). Ohne sie lässt sich öffentlich und intern nicht unterscheiden; die Basisadresse
 * kann dann sogar der Host der Oberfläche selbst sein.
 */
export function redirectOnly(req: FastifyRequest): boolean {
  if (!config.publicHostRedirectOnly) return false;
  const pub = publicHost();
  if (!pub) return false;
  const internal = internalHosts();
  if (!internal.size || internal.has(pub)) return false;
  return !internal.has(requestHost(req));
}

/** Ohne Anmeldung nur bekannte Hosts zulassen, damit fremde Seiten per DNS-Rebinding nichts erreichen. */
export function hostAllowedForOpenMode(req: FastifyRequest): boolean {
  const h = requestHost(req);
  const internal = internalHosts();
  if (internal.size) return internal.has(h);
  return h === 'localhost' || isIP(h) !== 0 || !h.includes('.');
}
