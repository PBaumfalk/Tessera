// Konfiguration aus Umgebungsvariablen. Alle Werte sind dokumentiert in docs/konfiguration.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : /^(1|true|yes|ja|on)$/i.test(v));
const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const trimSlash = (v: string) => v.replace(/\/+$/, '');

export const VERSION = '1.0.0';

function loadSecret(dataDir: string): Buffer {
  if (env.SECRET_KEY) {
    if (env.SECRET_KEY.length < 32) throw new Error('SECRET_KEY muss mindestens 32 Zeichen lang sein.');
    return crypto.createHash('sha256').update(env.SECRET_KEY).digest();
  }
  const file = path.join(dataDir, 'secret.key');
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  return key;
}

const dataDir = path.resolve(env.DATA_DIR ?? './data');
fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });

const appUrl = env.APP_URL ? trimSlash(env.APP_URL) : '';

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  dataDir,
  dbFile: path.join(dataDir, 'tessera.db'),
  filesDir: path.join(dataDir, 'files'),
  backupsDir: path.join(dataDir, 'backups'),
  appUrl,
  /** Weitere Hostnamen, unter denen die Oberfläche erreichbar sein darf (z. B. IP oder Alias). */
  allowedHosts: list(env.ALLOWED_HOSTS).map((h) => h.toLowerCase()),
  /** OIDC-Anmeldungen dürfen bestehende lokale Konten nur per Opt-in über die (verifizierte) E-Mail übernehmen. */
  oidcLinkByEmail: bool(env.OIDC_LINK_BY_EMAIL, false),
  /** Basisadresse für dynamische Codes; leer = Adresse der App. Kann in den Einstellungen überschrieben werden. */
  publicBaseUrl: env.PUBLIC_BASE_URL ? trimSlash(env.PUBLIC_BASE_URL) : '',
  /** Auf dem öffentlichen Host nur Weiterleitungen ausliefern. */
  publicHostRedirectOnly: bool(env.PUBLIC_HOST_REDIRECT_ONLY, true),
  secret: loadSecret(dataDir),
  trustProxy: env.TRUST_PROXY ? (/^(true|false)$/i.test(env.TRUST_PROXY) ? bool(env.TRUST_PROXY, false) : env.TRUST_PROXY) : false,
  cookieSecure: env.COOKIE_SECURE ? bool(env.COOKIE_SECURE, false) : appUrl.startsWith('https://'),
  sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 24 * 7),
  authDisabled: bool(env.AUTH_DISABLED, false),
  localLogin: bool(env.AUTH_LOCAL, true),
  adminEmail: env.ADMIN_EMAIL ?? '',
  adminPassword: env.ADMIN_PASSWORD ?? '',
  oidc: {
    issuer: env.OIDC_ISSUER ?? '',
    clientId: env.OIDC_CLIENT_ID ?? '',
    clientSecret: env.OIDC_CLIENT_SECRET ?? '',
    scopes: env.OIDC_SCOPES ?? 'openid profile email groups',
    label: env.OIDC_BUTTON_LABEL ?? 'Mit Firmenkonto anmelden',
    adminGroups: list(env.OIDC_ADMIN_GROUPS),
    allowedGroups: list(env.OIDC_ALLOWED_GROUPS),
    defaultRole: (env.OIDC_DEFAULT_ROLE ?? 'editor') as 'admin' | 'editor' | 'viewer',
    autoRedirect: bool(env.OIDC_AUTO_REDIRECT, false),
    allowInsecure: bool(env.OIDC_ALLOW_INSECURE, false),
  },
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 25),
  logLevel: env.LOG_LEVEL ?? 'info',
  staticDir: path.resolve(env.STATIC_DIR ?? './dist/client'),
};

export const oidcEnabled = () => !!(config.oidc.issuer && config.oidc.clientId);
