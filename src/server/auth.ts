// Anmeldung: lokale Konten, OIDC (z. B. authentik), API-Tokens, optional ohne Anmeldung.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as oidc from 'openid-client';
import crypto from 'node:crypto';
import { config, oidcEnabled } from './config';
import { db, now, type Row } from './db';
import { decrypt, encrypt, hashPassword, passwordProblem, randomId, sha256, verifyPassword } from './security';
import { fail } from './errors';

export type Role = 'admin' | 'editor' | 'viewer';
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  via: 'session' | 'token' | 'open';
  hasPassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const SID = 'tessera_sid';
const OIDC_COOKIE = 'tessera_oidc';
let setupCode: string | null = null;

// Fehlversuche je Konto (zusätzlich zum Limit je IP), damit wechselnde IPs nicht beliebig raten können
const failures = new Map<string, { n: number; since: number }>();
const FAIL_WINDOW = 15 * 60_000;
const FAIL_MAX = 10;
function tooManyFailures(email: string): boolean {
  const f = failures.get(email);
  if (!f) return false;
  if (Date.now() - f.since > FAIL_WINDOW) { failures.delete(email); return false; }
  return f.n >= FAIL_MAX;
}
function noteFailure(email: string) {
  const f = failures.get(email);
  if (!f || Date.now() - f.since > FAIL_WINDOW) failures.set(email, { n: 1, since: Date.now() });
  else f.n++;
  if (failures.size > 10_000) failures.clear();
}

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

function toSessionUser(r: Row, via: SessionUser['via']): SessionUser {
  return { id: r.id, email: r.email, name: r.name || r.email, role: r.role, via, hasPassword: !!r.password_hash };
}

export function userCount(): number {
  return ((db.prepare('SELECT COUNT(*) n FROM users').get() as Row).n as number) ?? 0;
}

/** Legt beim ersten Start Admin-Konto bzw. Einrichtungscode an. */
export function bootstrapAuth(log: { info: (m: string) => void; warn: (m: string) => void }): void {
  if (config.authDisabled) {
    const exists = db.prepare("SELECT id FROM users WHERE id = 'open'").get();
    if (!exists) {
      db.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES ('open', 'team@tessera.local', 'Team', 'admin', ?)").run(now());
    }
    log.warn('AUTH_DISABLED=true: Tessera ist ohne Anmeldung erreichbar. Nur in vertrauenswürdigen Netzen verwenden.');
    return;
  }
  if (userCount() > 0) return;
  if (config.adminEmail && config.adminPassword) {
    const problem = passwordProblem(config.adminPassword);
    if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
    db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomId(), config.adminEmail, 'Administrator', hashPassword(config.adminPassword), 'admin', now());
    log.info(`Admin-Konto ${config.adminEmail} angelegt.`);
    return;
  }
  if (config.localLogin) {
    setupCode = Array.from({ length: 3 }, () => crypto.randomInt(1000, 10000)).join('-');
    log.warn(`Ersteinrichtung: Einrichtungscode ${setupCode} (nur gültig, bis das erste Konto angelegt ist).`);
  }
}

function createSession(req: FastifyRequest, reply: FastifyReply, userId: string): void {
  const token = randomId(32);
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, now(), expires.toISOString());
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), userId);
  // Secure auch, wenn TLS erst am Reverse Proxy endet (X-Forwarded-Proto bei TRUST_PROXY)
  reply.setCookie(SID, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure || req.protocol === 'https', expires });
}

export async function resolveUser(req: FastifyRequest): Promise<SessionUser | null> {
  if (config.authDisabled) {
    const r = db.prepare("SELECT * FROM users WHERE id = 'open'").get() as Row;
    return r ? toSessionUser(r, 'open') : null;
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    const r = db.prepare('SELECT u.*, t.id tid FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.disabled = 0').get(sha256(token)) as Row | undefined;
    if (!r) return null;
    db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(now(), r.tid);
    return toSessionUser(r, 'token');
  }
  const sid = req.cookies?.[SID];
  if (!sid) return null;
  const r = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0').get(sha256(sid), now()) as Row | undefined;
  return r ? toSessionUser(r, 'session') : null;
}

export function requireRole(role: Role) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw fail(401, 'Bitte melde dich an.');
    if (ROLE_RANK[req.user.role] < ROLE_RANK[role]) {
      throw fail(403, role === 'admin' ? 'Diese Einstellung dürfen nur Administratoren ändern.' : 'Mit deiner Rolle kannst du Codes ansehen, aber nicht bearbeiten.');
    }
  };
}

// ---------------------------------------------------------------- OIDC

let oidcConfig: oidc.Configuration | null = null;
async function getOidc(): Promise<oidc.Configuration> {
  if (oidcConfig) return oidcConfig;
  oidcConfig = await oidc.discovery(
    new URL(config.oidc.issuer),
    config.oidc.clientId,
    config.oidc.clientSecret || undefined,
    undefined,
    config.oidc.allowInsecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
  return oidcConfig;
}

function baseUrl(req: FastifyRequest): string {
  return config.appUrl || `${req.protocol}://${req.host}`;
}

function roleFromGroups(groups: string[]): Role {
  if (config.oidc.adminGroups.some((g) => groups.includes(g))) return 'admin';
  return config.oidc.defaultRole;
}

// ---------------------------------------------------------------- Routen

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/state', async (req) => ({
    user: req.user,
    setupRequired: !config.authDisabled && userCount() === 0 && !!setupCode,
    localLogin: config.localLogin,
    authDisabled: config.authDisabled,
    oidc: { enabled: oidcEnabled(), label: config.oidc.label, autoRedirect: config.oidc.autoRedirect },
  }));

  app.post('/api/auth/setup', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>;
    if (!setupCode || userCount() > 0) throw fail(409, 'Tessera ist bereits eingerichtet. Melde dich an.');
    if (String(b.code ?? '').trim() !== setupCode) throw fail(400, 'Der Einrichtungscode stimmt nicht. Du findest ihn im Protokoll des Containers.', 'code');
    const email = String(b.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw fail(400, 'Bitte gib eine gültige E-Mail-Adresse ein.', 'email');
    const problem = passwordProblem(String(b.password ?? ''));
    if (problem) throw fail(400, problem, 'password');
    const id = randomId();
    db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, String(b.name ?? '').trim().slice(0, 80), hashPassword(String(b.password)), 'admin', now());
    setupCode = null;
    createSession(req, reply, id);
    return { ok: true };
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!config.localLogin) throw fail(400, 'Die Anmeldung mit Passwort ist deaktiviert.');
    const b = (req.body ?? {}) as Record<string, string>;
    const email = String(b.email ?? '').trim().toLowerCase();
    if (tooManyFailures(email)) throw fail(429, 'Zu viele Fehlversuche für dieses Konto. Bitte warte 15 Minuten.');
    const r = db.prepare('SELECT * FROM users WHERE email = ? AND disabled = 0').get(email) as Row | undefined;
    if (!verifyPassword(String(b.password ?? ''), r?.password_hash ?? null) || !r) {
      noteFailure(email);
      throw fail(401, 'E-Mail-Adresse oder Passwort stimmen nicht.');
    }
    failures.delete(email);
    createSession(req, reply, r.id);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = req.cookies?.[SID];
    if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(sid));
    reply.clearCookie(SID, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', { preHandler: requireRole('viewer'), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = (req.body ?? {}) as Record<string, string>;
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Row;
    if (r.password_hash && !verifyPassword(String(b.current ?? ''), r.password_hash)) throw fail(400, 'Das aktuelle Passwort stimmt nicht.', 'current');
    const problem = passwordProblem(String(b.next ?? ''));
    if (problem) throw fail(400, problem, 'next');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.next)), r.id);
    // Andere Sitzungen beenden
    const sid = req.cookies?.[SID];
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(r.id, sid ? sha256(sid) : '');
    return { ok: true };
  });

  app.get('/api/auth/oidc/start', async (req, reply) => {
    if (!oidcEnabled()) throw fail(404, 'OIDC ist nicht konfiguriert.');
    let cfg: oidc.Configuration;
    try {
      cfg = await getOidc();
    } catch (e) {
      req.log.error({ err: (e as Error).message }, 'OIDC-Discovery fehlgeschlagen');
      return reply.redirect('/login?fehler=oidc-nicht-erreichbar');
    }
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const redirect_uri = `${baseUrl(req)}/api/auth/oidc/callback`;
    const url = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri,
      scope: config.oidc.scopes,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    reply.setCookie(OIDC_COOKIE, encrypt(JSON.stringify({ verifier, state, nonce, redirect_uri, exp: Date.now() + 600_000 })), {
      path: '/api/auth/oidc', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 600,
    });
    return reply.redirect(url.href);
  });

  app.get('/api/auth/oidc/callback', async (req, reply) => {
    const raw = req.cookies?.[OIDC_COOKIE];
    const flow = raw ? JSON.parse(decrypt(raw) ?? 'null') : null;
    reply.clearCookie(OIDC_COOKIE, { path: '/api/auth/oidc' });
    if (!flow || flow.exp < Date.now()) return reply.redirect('/login?fehler=oidc-abgelaufen');
    try {
      const cfg = await getOidc();
      const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const tokens = await oidc.authorizationCodeGrant(cfg, new URL(flow.redirect_uri + q), {
        pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce,
      });
      let claims = tokens.claims() as Record<string, unknown> | undefined;
      if (!claims) throw new Error('Keine ID-Token-Claims');
      if (!claims.email && tokens.access_token) {
        claims = { ...claims, ...(await oidc.fetchUserInfo(cfg, tokens.access_token, String(claims.sub))) };
      }
      const sub = String(claims.sub);
      const email = String(claims.email ?? `${sub}@oidc.local`);
      const name = String(claims.name ?? claims.preferred_username ?? email);
      const groups = Array.isArray(claims.groups) ? (claims.groups as unknown[]).map(String) : [];
      if (config.oidc.allowedGroups.length && !config.oidc.allowedGroups.some((g) => groups.includes(g))) {
        return reply.redirect('/login?fehler=keine-berechtigung');
      }
      const role = roleFromGroups(groups);
      let user = db.prepare('SELECT * FROM users WHERE oidc_sub = ?').get(sub) as Row | undefined;
      if (!user) {
        const local = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Row | undefined;
        if (local) {
          // Kontoübernahme nur per Opt-in, mit bestätigter E-Mail und nie für Konten mit Passwort oder Adminrolle
          const verified = claims.email_verified === true || claims.email_verified === 'true';
          const linkable = config.oidc && config.oidcLinkByEmail && verified && !local.oidc_sub && !local.password_hash && local.role !== 'admin';
          if (!linkable) {
            req.log.warn('OIDC-Anmeldung abgelehnt: E-Mail-Adresse gehört bereits zu einem lokalen Konto');
            return reply.redirect('/login?fehler=konto-existiert');
          }
          user = local;
        }
      }
      if (user?.disabled) return reply.redirect('/login?fehler=konto-deaktiviert');
      if (!user) {
        const id = randomId();
        db.prepare('INSERT INTO users (id, email, name, role, oidc_sub, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, name, role, sub, now());
        user = { id };
      } else {
        const newRole = config.oidc.adminGroups.length ? role : user.role;
        db.prepare('UPDATE users SET oidc_sub = ?, name = ?, role = ? WHERE id = ?').run(sub, name, newRole, user.id);
      }
      createSession(req, reply, user.id as string);
      return reply.redirect('/');
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'OIDC-Anmeldung fehlgeschlagen');
      return reply.redirect('/login?fehler=oidc-fehlgeschlagen');
    }
  });
}
