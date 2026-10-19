// Rendern, Prüfen, Serienexport, Einstellungen, Benutzer, API-Tokens, Dateien und Backup.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { ZipArchive } from 'archiver';
import { backupTo, db, getSetting, now, schemaVersion, setSetting, type Row } from './db';
import { config, oidcEnabled, VERSION } from './config';
import { requireRole } from './auth';
import { fail } from './errors';
import { hashPassword, passwordProblem, randomId, sha256 } from './security';
import { publicBase, sendBatch } from './codes';
import { serveFile } from './public';
import { exportOne, safeFileName, type ExportFormat, type ExportItem } from './exporter';
import { verifyDesign } from './verify';
import { heavy } from './jobs';
import { encodeContent, getType, sanitizeContent, sensitiveKeys, TYPE_MAP, type ContentData } from '../shared/content';
import { DEFAULT_DESIGN, sanitizeDesign, STYLE_PRESETS, applyPreset, type EcLevel } from '../shared/design';
import { linkScope } from '../shared/links';
import { CapacityError } from '../shared/render';

const MAX_PAYLOAD = 4296;

function checkPayload(v: unknown): string {
  if (typeof v !== 'string' || !v.length) throw fail(400, 'Der Code hat noch keinen Inhalt.');
  if (v.length > MAX_PAYLOAD) throw fail(400, 'Zu viele Daten für einen QR-Code.');
  return v;
}

const ecOrUndef = (v: unknown) => (['L', 'M', 'Q', 'H'].includes(String(v)) ? (v as EcLevel) : undefined);

export async function apiRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireRole('viewer') };
  const editor = { preHandler: requireRole('editor') };
  const admin = { preHandler: requireRole('admin') };

  // ---------------------------------------------------------- Rendern & Prüfen
  app.post('/api/render', { ...viewer, bodyLimit: 3 * 1024 * 1024, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    const format = (['svg', 'png', 'pdf'].includes(b.format) ? b.format : 'png') as ExportFormat;
    const name = String(b.name ?? 'qr-code').slice(0, 120);
    try {
      const file = await heavy(req.user!.id, () => exportOne({ name, payload: checkPayload(b.payload), design: sanitizeDesign(b.design), minEc: ecOrUndef(b.minEc) }, {
        format, size: b.size, dpi: b.dpi, mm: b.mm, crop: !!b.crop,
      }));
      return reply.type(file.mime).header('Cache-Control', 'no-store')
        .header('Content-Disposition', `attachment; filename="${safeFileName(name)}.${file.ext}"`).send(file.buf);
    } catch (e) {
      if (e instanceof CapacityError) throw fail(400, 'Zu viele Daten für einen QR-Code. Kürze den Inhalt oder nutze einen dynamischen Code.');
      throw e;
    }
  });

  app.post('/api/verify', { ...viewer, bodyLimit: 3 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const b = (req.body ?? {}) as Row;
    try {
      const payload = checkPayload(b.payload);
      return await heavy(req.user!.id, () => verifyDesign(payload, sanitizeDesign(b.design), ecOrUndef(b.minEc)));
    } catch (e) {
      if (e instanceof CapacityError) throw fail(400, 'Zu viele Daten für einen QR-Code.');
      throw e;
    }
  });

  // Serienexport direkt aus Tabellendaten, ohne zu speichern
  app.post('/api/batch/export', { ...viewer, bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    const type = TYPE_MAP[b.type] ? String(b.type) : null;
    if (!type) throw fail(400, 'Unbekannter Inhaltstyp.');
    const rows = Array.isArray(b.items) ? (b.items as Row[]).slice(0, 5000) : [];
    if (!rows.length) throw fail(400, 'Die Tabelle enthält keine Zeilen.');
    const design = sanitizeDesign(b.design);
    const minEc = getType(type).minEc;
    const items: ExportItem[] = [];
    const problems: { row: number; message: string }[] = [];
    rows.forEach((r, i) => {
      const content = sanitizeContent(type, (r.content ?? {}) as ContentData);
      const { payload, issues } = encodeContent(type, content);
      if (!payload) problems.push({ row: i + 1, message: issues.find((x) => x.level === 'error')?.message ?? 'Unvollständig' });
      else {
        // Optionale Beschriftung je Zeile (z. B. Inventarnummer unter dem Code)
        const d = typeof r.label === 'string' && design.frame.style !== 'none' ? { ...design, frame: { ...design.frame, text: r.label.slice(0, 40) } } : design;
        items.push({ name: String(r.name ?? `Code ${i + 1}`).slice(0, 120), payload, design: d, minEc, sensitive: sensitiveKeys(type).length > 0 });
      }
    });
    if (problems.length) {
      return reply.code(422).send({ error: { message: `${problems.length} Zeilen enthalten Fehler.`, rows: problems.slice(0, 200) } });
    }
    return sendBatch(reply, items, b, req.user!.id);
  });

  // Einfache Schnittstelle für andere Intranet-Anwendungen (Bearer-Token)
  app.get('/api/v1/qr', viewer, async (req, reply) => {
    const q = req.query as Record<string, string>;
    let payload: string | null = q.data ?? null;
    let minEc: EcLevel | undefined;
    if (!payload && q.type) {
      if (!TYPE_MAP[q.type]) throw fail(400, `Unbekannter Typ „${q.type}“.`);
      const content = sanitizeContent(q.type, q as ContentData);
      const res = encodeContent(q.type, content);
      if (!res.payload) throw fail(400, res.issues.find((i) => i.level === 'error')?.message ?? 'Ungültiger Inhalt.');
      payload = res.payload;
      minEc = getType(q.type).minEc;
    }
    let design = DEFAULT_DESIGN;
    if (q.template) {
      const t = db.prepare('SELECT design FROM templates WHERE id = ?').get(q.template) as Row | undefined;
      if (!t) throw fail(404, 'Unbekannte Vorlage.');
      design = sanitizeDesign(JSON.parse(t.design));
    } else if (q.preset) {
      const p = STYLE_PRESETS.find((x) => x.id === q.preset);
      if (!p) throw fail(400, `Unbekannter Stil „${q.preset}“. Verfügbar: ${STYLE_PRESETS.map((x) => x.id).join(', ')}.`);
      design = applyPreset(DEFAULT_DESIGN, p);
    }
    const format = (['svg', 'png', 'pdf'].includes(q.format) ? q.format : 'svg') as ExportFormat;
    try {
      const p = checkPayload(payload);
      const file = await heavy(req.user!.id, () => exportOne({ name: 'qr', payload: p, design, minEc }, { format, size: Number(q.size), dpi: Number(q.dpi), mm: Number(q.mm) }));
      return reply.type(file.mime).header('Cache-Control', 'no-store').send(file.buf);
    } catch (e) {
      if (e instanceof CapacityError) throw fail(400, 'Zu viele Daten für einen QR-Code.');
      throw e;
    }
  });

  // ---------------------------------------------------------- Einstellungen
  const settingsView = (req: Parameters<typeof publicBase>[0]) => {
    const base = publicBase(req);
    return {
      version: VERSION,
      schema: schemaVersion(),
      publicBase: { url: base.url, source: base.source, scope: linkScope(base.url), locked: base.source === 'env' },
      statsAllowed: getSetting('statsAllowed', false),
      defaultTemplateId: getSetting('defaultTemplateId', ''),
      dynamicCount: (db.prepare("SELECT COUNT(*) n FROM codes WHERE kind = 'dynamic' AND deleted_at IS NULL").get() as Row).n,
      auth: { disabled: config.authDisabled, local: config.localLogin, oidc: oidcEnabled(), oidcIssuer: oidcEnabled() ? config.oidc.issuer : '' },
      maxUploadMb: config.maxUploadMb,
    };
  };
  app.get('/api/settings', viewer, async (req) => settingsView(req));
  app.patch('/api/settings', admin, async (req) => {
    const b = (req.body ?? {}) as Row;
    if (b.publicBaseUrl !== undefined) {
      if (config.publicBaseUrl) throw fail(400, 'Die Basisadresse ist über PUBLIC_BASE_URL fest eingestellt.', 'publicBaseUrl');
      let url = String(b.publicBaseUrl).trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (url) {
        try {
          const u = new URL(url);
          if (u.search || u.hash) throw new Error();
          url = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
        } catch {
          throw fail(400, 'Bitte gib eine Adresse wie https://qr.firma.de ein.', 'publicBaseUrl');
        }
      }
      const current = publicBase(req).url;
      const dyn = (db.prepare("SELECT COUNT(*) n FROM codes WHERE kind = 'dynamic' AND deleted_at IS NULL").get() as Row).n as number;
      if (url !== current && dyn > 0 && b.confirm !== true) {
        throw fail(409, `${dyn} dynamische Codes zeigen auf ${current}. Bereits gedruckte Exemplare funktionieren nach der Änderung nur, wenn die alte Adresse weiter auf Tessera zeigt.`, 'publicBaseUrl');
      }
      setSetting('publicBaseUrl', url);
    }
    if (b.statsAllowed !== undefined) setSetting('statsAllowed', b.statsAllowed === true);
    if (b.defaultTemplateId !== undefined) {
      const id = String(b.defaultTemplateId ?? '');
      if (id && !db.prepare('SELECT 1 FROM templates WHERE id = ?').get(id)) throw fail(400, 'Diese Vorlage gibt es nicht.', 'defaultTemplateId');
      setSetting('defaultTemplateId', id);
    }
    return settingsView(req);
  });

  // ---------------------------------------------------------- Benutzer
  const mapUser = (r: Row) => ({ id: r.id, email: r.email, name: r.name, role: r.role, disabled: !!r.disabled, sso: !!r.oidc_sub, hasPassword: !!r.password_hash, createdAt: r.created_at, lastLoginAt: r.last_login_at });
  const adminCount = () => (db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND disabled = 0").get() as Row).n as number;
  const role = (v: unknown) => (['admin', 'editor', 'viewer'].includes(String(v)) ? String(v) : null);

  app.get('/api/users', admin, async () => (db.prepare('SELECT * FROM users ORDER BY created_at').all() as Row[]).map(mapUser));
  app.post('/api/users', admin, async (req) => {
    const b = (req.body ?? {}) as Row;
    const email = String(b.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw fail(400, 'Bitte gib eine gültige E-Mail-Adresse ein.', 'email');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw fail(409, 'Mit dieser E-Mail-Adresse gibt es schon ein Konto.', 'email');
    const pw = String(b.password ?? '');
    const problem = passwordProblem(pw);
    if (problem) throw fail(400, problem, 'password');
    const id = randomId();
    db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, String(b.name ?? '').trim().slice(0, 80), hashPassword(pw), role(b.role) ?? 'editor', now());
    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row);
  });
  app.patch('/api/users/:id', admin, async (req) => {
    const id = (req.params as Row).id;
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    if (!u) throw fail(404, 'Dieses Konto gibt es nicht mehr.');
    const b = (req.body ?? {}) as Row;
    const newRole = b.role !== undefined ? role(b.role) ?? u.role : u.role;
    const disabled = b.disabled !== undefined ? (b.disabled ? 1 : 0) : u.disabled;
    if (u.role === 'admin' && !u.disabled && (newRole !== 'admin' || disabled) && adminCount() <= 1) {
      throw fail(400, 'Es muss mindestens ein aktives Administratorkonto geben.');
    }
    if (id === req.user!.id && disabled) throw fail(400, 'Du kannst dein eigenes Konto nicht deaktivieren.');
    let hash = u.password_hash;
    if (b.password) {
      const problem = passwordProblem(String(b.password));
      if (problem) throw fail(400, problem, 'password');
      hash = hashPassword(String(b.password));
    }
    db.prepare('UPDATE users SET name = ?, role = ?, disabled = ?, password_hash = ? WHERE id = ?')
      .run(b.name !== undefined ? String(b.name).trim().slice(0, 80) : u.name, newRole, disabled, hash, id);
    if (disabled || b.password) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row);
  });
  app.delete('/api/users/:id', admin, async (req) => {
    const id = (req.params as Row).id;
    if (id === req.user!.id) throw fail(400, 'Du kannst dein eigenes Konto nicht löschen.');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    if (!u) throw fail(404, 'Dieses Konto gibt es nicht mehr.');
    if (u.role === 'admin' && adminCount() <= 1) throw fail(400, 'Es muss mindestens ein aktives Administratorkonto geben.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  });

  // ---------------------------------------------------------- API-Tokens
  app.get('/api/tokens', viewer, async (req) =>
    (db.prepare('SELECT id, name, prefix, created_at createdAt, last_used_at lastUsedAt FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id) as Row[]));
  app.post('/api/tokens', viewer, async (req) => {
    if (req.user!.via === 'token') throw fail(403, 'Tokens können nur in der Oberfläche erstellt werden.');
    const name = String(((req.body ?? {}) as Row).name ?? '').trim().slice(0, 60);
    if (!name) throw fail(400, 'Bitte gib dem Token einen Namen, z. B. den der Anwendung.', 'name');
    const token = `tsr_${crypto.randomBytes(24).toString('base64url')}`;
    const id = randomId();
    db.prepare('INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.user!.id, name, sha256(token), token.slice(0, 8), now());
    return { id, name, token };
  });
  app.delete('/api/tokens/:id', viewer, async (req) => {
    db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run((req.params as Row).id, req.user!.id);
    return { ok: true };
  });

  // ---------------------------------------------------------- Dateien
  const ALLOWED = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/(plain|csv)|application\/(zip|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.oasis\.opendocument\.[a-z.]+|msword|vnd\.ms-excel|vnd\.ms-powerpoint)|audio\/mpeg|video\/mp4)$/;
  app.post('/api/files', editor, async (req) => {
    const part = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
    if (!part) throw fail(400, 'Keine Datei empfangen.');
    const mime = part.mimetype;
    if (!ALLOWED.test(mime)) {
      part.file.resume();
      throw fail(400, 'Dieser Dateityp wird nicht unterstützt. Erlaubt sind PDF, Bilder, Office-Dokumente, Text, ZIP, MP3 und MP4.');
    }
    const id = randomId();
    const target = path.join(config.filesDir, id);
    const hash = crypto.createHash('sha256');
    let size = 0;
    part.file.on('data', (c: Buffer) => { hash.update(c); size += c.length; });
    await pipeline(part.file, fs.createWriteStream(target, { mode: 0o640 }));
    if (part.file.truncated) {
      fs.rmSync(target, { force: true });
      throw fail(413, `Die Datei ist größer als ${config.maxUploadMb} MB.`);
    }
    const name = (part.filename || 'datei').replace(/[\\/\0]/g, '_').slice(0, 160);
    db.prepare('INSERT INTO files (id, name, mime, size, sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, mime, size, hash.digest('hex'), req.user!.id, now());
    return { id, name, mime, size };
  });
  app.get('/api/files/:id/meta', viewer, async (req) => {
    const f = db.prepare('SELECT id, name, mime, size, created_at createdAt FROM files WHERE id = ?').get((req.params as Row).id);
    if (!f) throw fail(404, 'Diese Datei gibt es nicht mehr.');
    return f;
  });
  app.get('/api/files/:id', viewer, async (req, reply) => {
    const sent = serveFile(reply, (req.params as Row).id, true);
    if (!sent) throw fail(404, 'Diese Datei gibt es nicht mehr.');
    return sent;
  });

  // ---------------------------------------------------------- Backup
  app.get('/api/admin/backup', admin, async (req, reply) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dbCopy = path.join(config.backupsDir, `tessera-${stamp}.db`);
    backupTo(dbCopy);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    reply.type('application/zip').header('Content-Disposition', `attachment; filename="tessera-backup-${stamp}.zip"`).header('Cache-Control', 'no-store');
    zip.file(dbCopy, { name: 'tessera.db' });
    zip.directory(config.filesDir, 'files');
    const keyFile = path.join(config.dataDir, 'secret.key');
    const withKey = (req.query as Row).key !== '0';
    if (withKey && fs.existsSync(keyFile)) zip.file(keyFile, { name: 'secret.key' });
    zip.append(JSON.stringify({ app: 'tessera', version: VERSION, schema: schemaVersion(), createdAt: now(), includesKey: withKey }, null, 2), { name: 'manifest.json' });
    // Temporäre Kopie in jedem Fall entfernen, auch bei Abbruch des Downloads
    const cleanup = () => fs.rm(dbCopy, { force: true }, () => {});
    zip.on('end', cleanup);
    zip.on('error', cleanup);
    reply.raw.on('close', cleanup);
    void zip.finalize();
    req.log.info('Backup heruntergeladen');
    return reply.send(zip);
  });
}
