// Codes, Ordner und Designvorlagen: Speichern, Suchen, Organisieren, Exportieren.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db, getSetting, now, setSetting, tx, type Row } from './db';
import { config } from './config';
import { requireRole } from './auth';
import { fail } from './errors';
import { openContent, randomId, randomSlug, sealContent, SLUG_RE } from './security';
import { encodeContent, getType, hasErrors, sanitizeContent, sensitiveKeys, TYPE_MAP, type ContentData } from '../shared/content';
import { sanitizeDesign, type Design, type EcLevel } from '../shared/design';
import { linkScope, RESERVED_SLUGS, shortUrl } from '../shared/links';
import { renderSvg, CapacityError } from '../shared/render';
import { exportOne, labelSheet, MIME, safeFileName, zipStream, type ExportFormat, type ExportItem } from './exporter';
import { BATCH_LIMITS, heavy } from './jobs';

// ---------------------------------------------------------------- Basisadresse

export function publicBase(req?: FastifyRequest): { url: string; source: 'settings' | 'env' | 'app' | 'request' } {
  // Reihenfolge: Umgebungsvariable (Infrastruktur) vor Einstellung vor App-Adresse vor Anfrage
  if (config.publicBaseUrl) return { url: config.publicBaseUrl, source: 'env' };
  const stored = getSetting<string>('publicBaseUrl', '');
  if (stored) return { url: stored, source: 'settings' };
  if (config.appUrl) return { url: config.appUrl, source: 'app' };
  return { url: req ? `${req.protocol}://${req.host}` : 'http://localhost:3000', source: 'request' };
}

/**
 * Beim ersten dynamischen Code wird die Basisadresse festgeschrieben, damit gedruckte Codes stabil bleiben.
 * Das darf nur die Administration: Sonst könnte jemand über einen gefälschten Host-Header festlegen,
 * wohin alle künftigen Kurzlinks zeigen.
 */
function pinBaseIfNeeded(req: FastifyRequest) {
  const b = publicBase(req);
  if (b.source !== 'request') return;
  if (req.user?.role !== 'admin') {
    throw fail(409, 'Für dynamische Codes muss die Administration zuerst die Basisadresse für Kurzlinks festlegen (Einstellungen → Dynamische Codes).', 'kind');
  }
  const host = String(req.headers.host ?? '').trim().toLowerCase().replace(/\.(?=:|$)/, '');
  if (!/^([a-z0-9-]+(\.[a-z0-9-]+)*|\[[0-9a-f:]+\])(:\d{1,5})?$/.test(host)) throw fail(400, 'Ungültiger Hostname.');
  setSetting('publicBaseUrl', `${req.protocol}://${host}`);
}

// ---------------------------------------------------------------- Abbildung

export interface CodeRecord {
  id: string;
  name: string;
  type: string;
  kind: 'static' | 'dynamic';
  slug: string | null;
  enabled: boolean;
  expiresAt: string | null;
  fallbackUrl: string | null;
  tracking: boolean;
  storeSecrets: boolean;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  summary: string;
  note: string;
  scanTotal: number;
  lastScanAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function mapCode(r: Row): CodeRecord {
  return {
    id: r.id, name: r.name, type: r.type, kind: r.kind, slug: r.slug, enabled: !!r.enabled,
    expiresAt: r.expires_at, fallbackUrl: r.fallback_url, tracking: !!r.tracking, storeSecrets: !!r.store_secrets,
    folderId: r.folder_id, tags: JSON.parse(r.tags || '[]'), favorite: !!r.favorite, summary: r.summary, note: r.note,
    scanTotal: r.scan_total, lastScanAt: r.last_scan_at, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  };
}

export function codeContent(r: Row): ContentData {
  return openContent(JSON.parse(r.content || '{}'));
}

export function codeDesign(r: Row): Design {
  return sanitizeDesign(JSON.parse(r.design || '{}'));
}

/** Text, der im QR-Code steht: bei dynamischen Codes der Kurzlink. */
export function codePayload(r: Row, req?: FastifyRequest): { payload: string | null; problem?: string } {
  if (r.kind === 'dynamic' && r.slug) return { payload: shortUrl(publicBase(req).url, r.slug) };
  const { payload, issues } = encodeContent(r.type, codeContent(r));
  return payload ? { payload } : { payload: null, problem: issues.find((i) => i.level === 'error')?.message };
}

export function getCodeRow(id: string, includeDeleted = false): Row {
  const r = db.prepare(`SELECT * FROM codes WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`).get(id) as Row | undefined;
  if (!r) throw fail(404, 'Diesen Code gibt es nicht (mehr).');
  return r;
}

const minEcOf = (type: string) => TYPE_MAP[type]?.minEc as EcLevel | undefined;

/** Ziel eines dynamischen Codes (für Verlauf und Weiterleitung). */
export function dynamicTarget(type: string, content: ContentData): string {
  const t = getType(type);
  if (t.dynamic === 'hosted') return `Gehostete Seite: ${t.summary(content) || t.label}`;
  if (type === 'appstore') return ['ios', 'android', 'fallback'].map((k) => content[k]).filter(Boolean).join(' | ');
  if (type === 'document' && content.source === 'upload') return `Datei ${content.fileId ?? ''}`;
  const { payload } = encodeContent(type, content);
  return payload ?? '(unvollständig)';
}

// ---------------------------------------------------------------- Eingaben

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((t) => String(t).trim().replace(/\s+/g, ' ').slice(0, 32)).filter(Boolean))].slice(0, 20);
}

function cleanName(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim().slice(0, 120);
  return s || fallback;
}

function validSlug(slug: string, exceptId?: string): string {
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug.toLowerCase())) {
    throw fail(400, 'Die Kurzadresse darf 3 bis 64 Zeichen haben: Buchstaben, Ziffern, Bindestrich und Unterstrich.', 'slug');
  }
  const taken = db.prepare('SELECT id FROM codes WHERE slug = ? COLLATE NOCASE AND id != ?').get(slug, exceptId ?? '') as Row | undefined;
  if (taken) throw fail(409, 'Diese Kurzadresse ist schon vergeben.', 'slug');
  return slug;
}

function uniqueSlug(): string {
  for (let i = 0; i < 20; i++) {
    const s = randomSlug();
    if (!db.prepare('SELECT 1 FROM codes WHERE slug = ?').get(s)) return s;
  }
  return randomSlug(10);
}

function optionalUrl(v: unknown, field: string): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    return u.toString();
  } catch {
    throw fail(400, 'Bitte gib eine vollständige Webadresse ein.', field);
  }
}

function optionalDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw fail(400, 'Das Ablaufdatum ist ungültig.', 'expiresAt');
  return d.toISOString();
}

interface CodeInput {
  name?: string; type?: string; content?: ContentData; design?: unknown; kind?: 'static' | 'dynamic'; slug?: string;
  enabled?: boolean; expiresAt?: string | null; fallbackUrl?: string | null; tracking?: boolean; storeSecrets?: boolean;
  folderId?: string | null; tags?: string[]; favorite?: boolean; note?: string;
}

function folderOrNull(id: unknown): string | null {
  if (!id) return null;
  const f = db.prepare('SELECT id FROM folders WHERE id = ?').get(String(id));
  if (!f) throw fail(400, 'Diesen Ordner gibt es nicht mehr.', 'folderId');
  return String(id);
}

export function createCode(input: CodeInput, userId: string, req: FastifyRequest): Row {
  const type = input.type && TYPE_MAP[input.type] ? input.type : null;
  if (!type) throw fail(400, 'Unbekannter Inhaltstyp.', 'type');
  const t = getType(type);
  const content = sanitizeContent(type, input.content ?? {});
  const kind = input.kind === 'dynamic' ? 'dynamic' : 'static';
  if (kind === 'dynamic' && !t.dynamic) throw fail(400, `${t.label}-Codes können nicht dynamisch sein, weil ihr Inhalt direkt im Code stehen muss.`, 'kind');
  if (kind === 'dynamic') pinBaseIfNeeded(req);
  const storeSecrets = input.storeSecrets !== false;
  const id = randomId();
  const ts = now();
  const slug = kind === 'dynamic' ? (input.slug ? validSlug(input.slug.trim()) : uniqueSlug()) : null;
  db.prepare(`INSERT INTO codes (id, name, type, content, design, kind, slug, enabled, expires_at, fallback_url, tracking, store_secrets,
      folder_id, tags, favorite, summary, note, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, cleanName(input.name, t.summary(content) || t.label), type, JSON.stringify(sealContent(type, content, storeSecrets)),
    JSON.stringify(sanitizeDesign(input.design)), kind, slug, input.enabled === false ? 0 : 1, optionalDate(input.expiresAt),
    optionalUrl(input.fallbackUrl, 'fallbackUrl'), input.tracking ? 1 : 0, storeSecrets ? 1 : 0, folderOrNull(input.folderId),
    JSON.stringify(cleanTags(input.tags)), input.favorite ? 1 : 0, t.summary(content).slice(0, 200), String(input.note ?? '').slice(0, 2000),
    userId, userId, ts, ts,
  );
  db.prepare('INSERT INTO code_events (code_id, kind, detail, user_id, at) VALUES (?, ?, ?, ?, ?)').run(
    id, 'created', kind === 'dynamic' ? dynamicTarget(type, content) : '', userId, ts);
  return getCodeRow(id);
}

export function updateCode(id: string, input: CodeInput, userId: string, req: FastifyRequest): Row {
  const r = getCodeRow(id);
  const type = input.type && TYPE_MAP[input.type] ? input.type : r.type;
  const t = getType(type);
  const old = codeContent(r);
  const storeSecrets = input.storeSecrets === undefined ? !!r.store_secrets : input.storeSecrets;
  let content = input.content ? sanitizeContent(type, input.content) : old;
  // Leere sensible Felder bedeuten "unverändert", solange der Typ gleich bleibt
  if (input.content && type === r.type && storeSecrets) {
    for (const k of sensitiveKeys(type)) if (!content[k] && old[k]) content = { ...content, [k]: old[k] };
  }
  const kind = input.kind ?? r.kind;
  if (kind === 'dynamic' && !t.dynamic) throw fail(400, `${t.label}-Codes können nicht dynamisch sein.`, 'kind');
  if (r.kind === 'dynamic' && kind === 'static') {
    throw fail(400, 'Ein dynamischer Code bleibt dynamisch, damit bereits gedruckte Exemplare weiter funktionieren. Dupliziere ihn als statischen Code.', 'kind');
  }
  let slug: string | null = r.slug;
  if (kind === 'dynamic' && !slug) { pinBaseIfNeeded(req); slug = uniqueSlug(); }
  if (input.slug !== undefined && input.slug !== r.slug && kind === 'dynamic') slug = validSlug(String(input.slug).trim(), id);
  const ts = now();
  tx(() => {
    db.prepare(`UPDATE codes SET name = ?, type = ?, content = ?, design = ?, kind = ?, slug = ?, enabled = ?, expires_at = ?, fallback_url = ?,
        tracking = ?, store_secrets = ?, folder_id = ?, tags = ?, favorite = ?, summary = ?, note = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      input.name !== undefined ? cleanName(input.name, r.name) : r.name, type,
      JSON.stringify(sealContent(type, content, storeSecrets)),
      input.design !== undefined ? JSON.stringify(sanitizeDesign(input.design)) : r.design,
      kind, slug,
      input.enabled === undefined ? r.enabled : input.enabled ? 1 : 0,
      input.expiresAt === undefined ? r.expires_at : optionalDate(input.expiresAt),
      input.fallbackUrl === undefined ? r.fallback_url : optionalUrl(input.fallbackUrl, 'fallbackUrl'),
      input.tracking === undefined ? r.tracking : input.tracking ? 1 : 0,
      storeSecrets ? 1 : 0,
      input.folderId === undefined ? r.folder_id : folderOrNull(input.folderId),
      input.tags === undefined ? r.tags : JSON.stringify(cleanTags(input.tags)),
      input.favorite === undefined ? r.favorite : input.favorite ? 1 : 0,
      t.summary(content).slice(0, 200),
      input.note === undefined ? r.note : String(input.note).slice(0, 2000),
      userId, ts, id,
    );
    if (kind === 'dynamic') {
      const before = r.kind === 'dynamic' ? dynamicTarget(r.type, old) : '';
      const after = dynamicTarget(type, content);
      if (before !== after) db.prepare('INSERT INTO code_events (code_id, kind, detail, user_id, at) VALUES (?, ?, ?, ?, ?)').run(id, 'target', after, userId, ts);
      if (input.enabled !== undefined && !!input.enabled !== !!r.enabled) {
        db.prepare('INSERT INTO code_events (code_id, kind, detail, user_id, at) VALUES (?, ?, ?, ?, ?)').run(id, input.enabled ? 'enabled' : 'disabled', '', userId, ts);
      }
      if (slug !== r.slug && r.slug) db.prepare('INSERT INTO code_events (code_id, kind, detail, user_id, at) VALUES (?, ?, ?, ?, ?)').run(id, 'slug', `${r.slug} → ${slug}`, userId, ts);
    }
  });
  return getCodeRow(id);
}

export function codeDetail(r: Row, req: FastifyRequest) {
  const base = publicBase(req);
  const content = codeContent(r);
  const missingSecrets = sensitiveKeys(r.type).filter((k) => !content[k]);
  const events = db.prepare(`SELECT e.kind, e.detail, e.at, u.name user FROM code_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.code_id = ? ORDER BY e.id DESC LIMIT 30`).all(r.id) as Row[];
  return {
    ...mapCode(r),
    content,
    design: codeDesign(r),
    shortUrl: r.slug ? shortUrl(base.url, r.slug) : null,
    linkScope: r.slug ? linkScope(base.url) : null,
    missingSecrets,
    events,
  };
}

function listItem(r: Row, base: string) {
  return { ...mapCode(r), shortUrl: r.slug ? shortUrl(base, r.slug) : null };
}

/** Entfernt hochgeladene Dateien, auf die kein Code (auch nicht im Papierkorb) mehr verweist. */
export function cleanupOrphanFiles(): number {
  const used = new Set<string>();
  for (const r of db.prepare("SELECT content FROM codes WHERE type = 'document'").all() as Row[]) {
    const id = JSON.parse(r.content || '{}').fileId;
    if (typeof id === 'string') used.add(id);
  }
  let removed = 0;
  for (const f of db.prepare("SELECT id FROM files WHERE created_at < ?").all(new Date(Date.now() - 24 * 3600_000).toISOString()) as Row[]) {
    if (used.has(f.id)) continue;
    db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
    fs.rmSync(path.join(config.filesDir, f.id), { force: true });
    removed++;
  }
  return removed;
}

// ---------------------------------------------------------------- Routen

export async function codeRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireRole('viewer') };
  const editor = { preHandler: requireRole('editor') };

  app.get('/api/codes', viewer, async (req) => {
    const q = req.query as Record<string, string>;
    const where: string[] = [q.trash === '1' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (q.q) {
      const like = `%${q.q.trim().replace(/[%_]/g, (m) => '\\' + m)}%`;
      where.push("(name LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like, like);
    }
    if (q.type) { where.push('type = ?'); params.push(q.type); }
    if (q.kind === 'static' || q.kind === 'dynamic') { where.push('kind = ?'); params.push(q.kind); }
    if (q.folder === 'none') where.push('folder_id IS NULL');
    else if (q.folder) { where.push('folder_id = ?'); params.push(q.folder); }
    if (q.tag) { where.push("EXISTS (SELECT 1 FROM json_each(codes.tags) WHERE value = ?)"); params.push(q.tag); }
    if (q.fav === '1') where.push('favorite = 1');
    const sorts: Record<string, string> = {
      updated: 'updated_at', created: 'created_at', name: 'name COLLATE NOCASE', scans: 'scan_total', type: 'type',
    };
    const sort = sorts[q.sort] ?? 'updated_at';
    const dir = q.dir === 'asc' ? 'ASC' : q.dir === 'desc' ? 'DESC' : q.sort === 'name' || q.sort === 'type' ? 'ASC' : 'DESC';
    const limit = Math.min(500, Math.max(1, Number(q.limit) || 60));
    const offset = Math.max(0, Number(q.offset) || 0);
    const w = where.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) n FROM codes WHERE ${w}`).get(...params) as Row).n;
    const rows = db.prepare(`SELECT * FROM codes WHERE ${w} ORDER BY ${sort} ${dir}, id LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[];
    const base = publicBase(req).url;
    return { items: rows.map((r) => listItem(r, base)), total };
  });

  app.get('/api/codes/facets', viewer, async () => {
    const types = db.prepare('SELECT type, COUNT(*) n FROM codes WHERE deleted_at IS NULL GROUP BY type').all() as Row[];
    const tags = db.prepare('SELECT value tag, COUNT(*) n FROM codes, json_each(codes.tags) WHERE deleted_at IS NULL GROUP BY value ORDER BY n DESC, value LIMIT 100').all() as Row[];
    const counts = db.prepare(`SELECT
        SUM(deleted_at IS NULL) total, SUM(deleted_at IS NULL AND kind = 'dynamic') dynamic,
        SUM(deleted_at IS NULL AND favorite = 1) favorites, SUM(deleted_at IS NOT NULL) trash,
        SUM(deleted_at IS NULL AND folder_id IS NULL) unfiled FROM codes`).get() as Row;
    const folders = db.prepare('SELECT folder_id id, COUNT(*) n FROM codes WHERE deleted_at IS NULL AND folder_id IS NOT NULL GROUP BY folder_id').all() as Row[];
    return {
      types: Object.fromEntries(types.map((t) => [t.type, t.n])),
      tags: tags.map((t) => ({ tag: t.tag, count: t.n })),
      folders: Object.fromEntries(folders.map((f) => [f.id, f.n])),
      counts: { total: counts.total ?? 0, dynamic: counts.dynamic ?? 0, favorites: counts.favorites ?? 0, trash: counts.trash ?? 0, unfiled: counts.unfiled ?? 0 },
    };
  });

  app.get('/api/codes/:id', viewer, async (req) => codeDetail(getCodeRow((req.params as Row).id), req));

  app.post('/api/codes', editor, async (req) => codeDetail(createCode((req.body ?? {}) as CodeInput, req.user!.id, req), req));

  app.patch('/api/codes/:id', editor, async (req) => codeDetail(updateCode((req.params as Row).id, (req.body ?? {}) as CodeInput, req.user!.id, req), req));

  app.post('/api/codes/:id/duplicate', editor, async (req) => {
    const r = getCodeRow((req.params as Row).id);
    const b = (req.body ?? {}) as { kind?: 'static' | 'dynamic' };
    const created = createCode({
      ...mapCode(r), name: `${r.name} (Kopie)`, content: codeContent(r), design: codeDesign(r), kind: b.kind ?? r.kind,
      slug: undefined, tags: JSON.parse(r.tags), storeSecrets: !!r.store_secrets,
    }, req.user!.id, req);
    return codeDetail(created, req);
  });

  app.delete('/api/codes/:id', editor, async (req) => {
    const id = (req.params as Row).id;
    const q = req.query as Record<string, string>;
    const r = getCodeRow(id, true);
    if (q.permanent === '1') {
      if (!r.deleted_at) throw fail(400, 'Lege den Code zuerst in den Papierkorb.');
      db.prepare('DELETE FROM codes WHERE id = ?').run(id);
      cleanupOrphanFiles();
      return { ok: true, permanent: true };
    }
    db.prepare('UPDATE codes SET deleted_at = ? WHERE id = ?').run(now(), id);
    return { ok: true };
  });

  app.post('/api/codes/:id/restore', editor, async (req) => {
    const id = (req.params as Row).id;
    getCodeRow(id, true);
    db.prepare('UPDATE codes SET deleted_at = NULL WHERE id = ?').run(id);
    return codeDetail(getCodeRow(id), req);
  });

  app.post('/api/codes/bulk', editor, async (req) => {
    const b = (req.body ?? {}) as { action?: string; ids?: string[]; folderId?: string | null; tag?: string; value?: boolean };
    const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 2000) : [];
    if (!ids.length) throw fail(400, 'Keine Codes ausgewählt.');
    const ph = ids.map(() => '?').join(',');
    const ts = now();
    let changed = 0;
    tx(() => {
      switch (b.action) {
        case 'delete': changed = Number(db.prepare(`UPDATE codes SET deleted_at = ? WHERE deleted_at IS NULL AND id IN (${ph})`).run(ts, ...ids).changes); break;
        case 'restore': changed = Number(db.prepare(`UPDATE codes SET deleted_at = NULL WHERE id IN (${ph})`).run(...ids).changes); break;
        case 'purge': changed = Number(db.prepare(`DELETE FROM codes WHERE deleted_at IS NOT NULL AND id IN (${ph})`).run(...ids).changes); break;
        case 'move': changed = Number(db.prepare(`UPDATE codes SET folder_id = ?, updated_at = ? WHERE id IN (${ph})`).run(folderOrNull(b.folderId), ts, ...ids).changes); break;
        case 'favorite': changed = Number(db.prepare(`UPDATE codes SET favorite = ? WHERE id IN (${ph})`).run(b.value === false ? 0 : 1, ...ids).changes); break;
        case 'tag':
        case 'untag': {
          const tag = cleanTags([b.tag])[0];
          if (!tag) throw fail(400, 'Bitte gib ein Schlagwort ein.', 'tag');
          for (const r of db.prepare(`SELECT id, tags FROM codes WHERE id IN (${ph})`).all(...ids) as Row[]) {
            const tags = new Set<string>(JSON.parse(r.tags));
            if (b.action === 'tag') tags.add(tag); else tags.delete(tag);
            db.prepare('UPDATE codes SET tags = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(cleanTags([...tags])), ts, r.id);
            changed++;
          }
          break;
        }
        default: throw fail(400, 'Unbekannte Aktion.');
      }
    });
    if (b.action === 'purge') cleanupOrphanFiles();
    return { ok: true, changed };
  });

  app.post('/api/codes/import', { ...editor, bodyLimit: 30 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { items?: CodeInput[] };
    const items = Array.isArray(b.items) ? b.items.slice(0, 5000) : [];
    if (!items.length) throw fail(400, 'Keine Einträge zum Speichern.');
    const created: string[] = [];
    tx(() => {
      for (const it of items) created.push(createCode(it, req.user!.id, req).id as string);
    });
    return { ok: true, created: created.length, ids: created };
  });

  // Vorschau als SVG, z. B. für die Bibliothek. Wird über <img> eingebunden (keine Skriptausführung).
  app.get('/api/codes/:id/preview.svg', viewer, async (req, reply) => {
    const r = getCodeRow((req.params as Row).id, true);
    const etag = `"${r.updated_at}-${publicBase(req).url.length}"`;
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate').header('ETag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const { payload } = codePayload(r, req);
    reply.type('image/svg+xml');
    if (!payload) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#eef0f4"/><path d="M38 38h24v24H38z" fill="none" stroke="#9aa0ad" stroke-width="3" stroke-dasharray="4 4"/></svg>';
    }
    try {
      return renderSvg(payload, codeDesign(r), { minEc: minEcOf(r.type), idPrefix: `p${r.id.slice(0, 5)}` }).svg;
    } catch (e) {
      if (e instanceof CapacityError) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#fde8e8"/></svg>';
      throw e;
    }
  });

  app.get('/api/codes/:id/export', viewer, async (req, reply) => {
    const r = getCodeRow((req.params as Row).id);
    const q = req.query as Record<string, string>;
    const { payload, problem } = codePayload(r, req);
    if (!payload) throw fail(400, problem ?? 'Der Inhalt ist unvollständig.');
    const format = (['svg', 'png', 'pdf'].includes(q.format) ? q.format : 'png') as ExportFormat;
    const file = await heavy(req.user!.id, () => exportOne({ name: r.name, payload, design: codeDesign(r), minEc: minEcOf(r.type) }, {
      format, size: Number(q.size), dpi: Number(q.dpi), mm: Number(q.mm), crop: q.crop === '1',
    }));
    return reply
      .type(file.mime)
      .header('Content-Disposition', `${q.inline === '1' ? 'inline' : 'attachment'}; filename="${safeFileName(r.name)}.${file.ext}"`)
      .header('Cache-Control', 'no-store')
      .send(file.buf);
  });

  // Mehrere gespeicherte Codes als ZIP oder Etikettenbogen
  app.post('/api/codes/export', viewer, async (req, reply) => {
    const b = (req.body ?? {}) as { ids?: string[]; formats?: string[]; size?: number; dpi?: number; mm?: number; sheet?: Record<string, unknown> };
    const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 2000) : [];
    if (!ids.length) throw fail(400, 'Keine Codes ausgewählt.');
    const rows = db.prepare(`SELECT * FROM codes WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Row[];
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, c) => (order.get(a.id) ?? 0) - (order.get(c.id) ?? 0));
    const items: ExportItem[] = [];
    const skipped: string[] = [];
    for (const r of rows) {
      const { payload } = codePayload(r, req);
      if (payload) items.push({ name: r.name, payload, design: codeDesign(r), minEc: minEcOf(r.type), sensitive: sensitiveKeys(r.type).length > 0 });
      else skipped.push(r.name);
    }
    if (!items.length) throw fail(400, 'Keiner der ausgewählten Codes hat einen vollständigen Inhalt.');
    if (skipped.length) reply.header('X-Tessera-Skipped', encodeURIComponent(skipped.join(', ')));
    return sendBatch(reply, items, b, req.user!.id);
  });
}

export async function sendBatch(reply: any, items: ExportItem[], b: { formats?: string[]; size?: number; dpi?: number; mm?: number; sheet?: Record<string, unknown> }, userId = 'anon') {
  const stamp = new Date().toISOString().slice(0, 10);
  if (b.sheet) {
    if (items.length > BATCH_LIMITS.maxSheetItems) throw fail(400, `Ein Etikettenbogen kann höchstens ${BATCH_LIMITS.maxSheetItems} Codes enthalten. Teile die Serie auf.`);
    const pdf = await heavy(userId, () => labelSheet(items, {
      paper: (['A4', 'A3', 'LETTER'].includes(String(b.sheet!.paper)) ? b.sheet!.paper : 'A4') as 'A4',
      cols: Number(b.sheet!.cols) || 4, rows: Number(b.sheet!.rows) || 6, labels: b.sheet!.labels !== false, marginMm: Number(b.sheet!.marginMm ?? 10),
    }), true);
    return reply.type(MIME.pdf).header('Content-Disposition', `attachment; filename="tessera-etiketten-${stamp}.pdf"`).send(pdf);
  }
  const formats = (Array.isArray(b.formats) ? b.formats : ['png']).filter((f): f is ExportFormat => ['svg', 'png', 'pdf'].includes(f));
  if (!formats.length) throw fail(400, 'Bitte wähle mindestens ein Dateiformat.');
  const size = Math.min(BATCH_LIMITS.maxPngSize, Math.max(64, Number(b.size) || 1024));
  const pixels = items.length * (formats.includes('png') ? size * size : 0) + items.length * (formats.length - (formats.includes('png') ? 1 : 0)) * 512 * 512;
  if (pixels > BATCH_LIMITS.pixelBudget) {
    throw fail(400, 'Zu viele oder zu große Dateien auf einmal. Wähle eine kleinere PNG-Größe oder teile die Serie auf.');
  }
  reply.type('application/zip').header('Content-Disposition', `attachment; filename="tessera-export-${stamp}.zip"`);
  // Die ZIP-Erzeugung belegt einen Platz in der Warteschlange, bis sie fertig oder abgebrochen ist
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  await new Promise<void>((started, rejected) => {
    heavy(userId, () => { started(); return done; }, true).catch(rejected);
  });
  const stream = zipStream(items, formats, { size, dpi: b.dpi, mm: b.mm });
  stream.on('close', release);
  stream.on('error', release);
  reply.raw.on('close', () => { if (!stream.readableEnded) stream.destroy(); });
  return reply.send(stream);
}

// ---------------------------------------------------------------- Ordner und Vorlagen

export async function libraryRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireRole('viewer') };
  const editor = { preHandler: requireRole('editor') };
  const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#2234d6');

  app.get('/api/folders', viewer, async () => (db.prepare('SELECT id, name, color, sort FROM folders ORDER BY sort, name COLLATE NOCASE').all() as Row[]));
  app.post('/api/folders', editor, async (req) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim().slice(0, 60);
    if (!name) throw fail(400, 'Bitte gib dem Ordner einen Namen.', 'name');
    if (db.prepare('SELECT 1 FROM folders WHERE name = ? COLLATE NOCASE').get(name)) throw fail(409, `Einen Ordner „${name}“ gibt es schon.`, 'name');
    const id = randomId();
    db.prepare('INSERT INTO folders (id, name, color, sort, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, color(b.color), Number(b.sort) || 0, now());
    return db.prepare('SELECT id, name, color, sort FROM folders WHERE id = ?').get(id);
  });
  app.patch('/api/folders/:id', editor, async (req) => {
    const id = (req.params as Row).id;
    const f = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Row | undefined;
    if (!f) throw fail(404, 'Diesen Ordner gibt es nicht mehr.');
    const b = (req.body ?? {}) as Row;
    const name = b.name !== undefined ? String(b.name).trim().slice(0, 60) : f.name;
    if (!name) throw fail(400, 'Bitte gib dem Ordner einen Namen.', 'name');
    if (db.prepare('SELECT 1 FROM folders WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id)) throw fail(409, `Einen Ordner „${name}“ gibt es schon.`, 'name');
    db.prepare('UPDATE folders SET name = ?, color = ?, sort = ? WHERE id = ?').run(name, b.color !== undefined ? color(b.color) : f.color, b.sort !== undefined ? Number(b.sort) || 0 : f.sort, id);
    return db.prepare('SELECT id, name, color, sort FROM folders WHERE id = ?').get(id);
  });
  app.delete('/api/folders/:id', editor, async (req) => {
    db.prepare('DELETE FROM folders WHERE id = ?').run((req.params as Row).id);
    return { ok: true };
  });

  const mapTpl = (r: Row) => ({ id: r.id, name: r.name, design: sanitizeDesign(JSON.parse(r.design)), createdAt: r.created_at, updatedAt: r.updated_at });
  app.get('/api/templates', viewer, async () => (db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all() as Row[]).map(mapTpl));
  app.post('/api/templates', { ...editor, bodyLimit: 3 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim().slice(0, 60);
    if (!name) throw fail(400, 'Bitte gib der Vorlage einen Namen.', 'name');
    const id = randomId();
    const ts = now();
    db.prepare('INSERT INTO templates (id, name, design, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, JSON.stringify(sanitizeDesign(b.design)), req.user!.id, ts, ts);
    return mapTpl(db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Row);
  });
  app.patch('/api/templates/:id', { ...editor, bodyLimit: 3 * 1024 * 1024 }, async (req) => {
    const id = (req.params as Row).id;
    const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Row | undefined;
    if (!t) throw fail(404, 'Diese Vorlage gibt es nicht mehr.');
    const b = (req.body ?? {}) as Row;
    const name = b.name !== undefined ? String(b.name).trim().slice(0, 60) : t.name;
    if (!name) throw fail(400, 'Bitte gib der Vorlage einen Namen.', 'name');
    db.prepare('UPDATE templates SET name = ?, design = ?, updated_at = ? WHERE id = ?')
      .run(name, b.design !== undefined ? JSON.stringify(sanitizeDesign(b.design)) : t.design, now(), id);
    return mapTpl(db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Row);
  });
  app.delete('/api/templates/:id', editor, async (req) => {
    const id = (req.params as Row).id;
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    if (getSetting('defaultTemplateId', '') === id) setSetting('defaultTemplateId', '');
    return { ok: true };
  });

  app.get('/api/codes/:id/stats', viewer, async (req) => {
    const r = getCodeRow((req.params as Row).id);
    const days = db.prepare('SELECT day, total, mobile, desktop FROM scan_daily WHERE code_id = ? ORDER BY day DESC LIMIT 400').all(r.id) as Row[];
    return {
      trackingAllowed: getSetting('statsAllowed', false),
      tracking: !!r.tracking,
      total: r.scan_total,
      lastScanAt: r.last_scan_at,
      days: days.reverse(),
    };
  });
  app.delete('/api/codes/:id/stats', editor, async (req) => {
    const r = getCodeRow((req.params as Row).id);
    tx(() => {
      db.prepare('DELETE FROM scan_daily WHERE code_id = ?').run(r.id);
      db.prepare('UPDATE codes SET scan_total = 0, last_scan_at = NULL WHERE id = ?').run(r.id);
    });
    return { ok: true };
  });

  // Prüft ein Design gegen den gespeicherten Inhalt, ohne zu speichern
  app.get('/api/codes/:id/payload', viewer, async (req) => {
    const r = getCodeRow((req.params as Row).id);
    const { payload, problem } = codePayload(r, req);
    return { payload, problem: problem ?? null, hasErrors: payload ? hasErrors(getType(r.type).validate(codeContent(r))) : true };
  });
}
