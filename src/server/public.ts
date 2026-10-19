// Öffentliche Weiterleitungen dynamischer Codes (/r/:slug) samt gehosteten Seiten.
// Datenschutz: keine IP-Adressen, keine Cookies, keine User-Agents gespeichert.
// Gezählt wird nur, wenn Statistik global erlaubt UND für den Code aktiviert ist.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db, getSetting, now, type Row } from './db';
import { config } from './config';
import { codeContent, codeDesign, publicBase } from './codes';
import { encodeContent, getType, isHttpUrl, cleanPhone, normalizeUrl, type ContentData } from '../shared/content';
import { escapeXml, renderSvg } from '../shared/render';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|slack|whatsapp|telegram|discord|skype|curl|wget|python|httpclient|go-http|java\/|headless|monitor|uptime/i;

function deviceClass(ua: string): 'mobile' | 'desktop' {
  return /iphone|ipad|ipod|android|mobile|silk|kindle|blackberry|opera mini/i.test(ua) ? 'mobile' : 'desktop';
}

function countScan(req: FastifyRequest, code: Row) {
  if (req.method !== 'GET') return;
  if (!code.tracking || !getSetting('statsAllowed', false)) return;
  if (req.headers.dnt === '1' || req.headers['sec-gpc'] === '1') return;
  const ua = String(req.headers['user-agent'] ?? '');
  if (!ua || BOT.test(ua)) return;
  const day = new Date().toISOString().slice(0, 10);
  const mobile = deviceClass(ua) === 'mobile' ? 1 : 0;
  db.prepare(`INSERT INTO scan_daily (code_id, day, total, mobile, desktop) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(code_id, day) DO UPDATE SET total = total + 1, mobile = mobile + excluded.mobile, desktop = desktop + excluded.desktop`)
    .run(code.id, day, mobile, 1 - mobile);
  db.prepare('UPDATE codes SET scan_total = scan_total + 1, last_scan_at = ? WHERE id = ?').run(now(), code.id);
}

const PAGE_CSS = `
:root{color-scheme:light dark;--bg:#f4f5f8;--card:#fff;--ink:#14151b;--muted:#5d6273;--accent:#2234d6;--line:#e3e5eb}
@media (prefers-color-scheme:dark){:root{--bg:#101116;--card:#1a1c24;--ink:#f1f2f6;--muted:#a3a8b8;--accent:#8c98ff;--line:#2a2d38}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}
h1{font-size:1.5rem;line-height:1.2;margin:0 0 4px}p{margin:0 0 16px;color:var(--muted)}
.row{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.row b{min-width:84px;color:var(--muted);font-weight:500}
.row a{color:var(--ink);word-break:break-all}
.btn{display:block;text-align:center;margin-top:20px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:14px;border-radius:12px}
@media (prefers-color-scheme:dark){.btn{color:#0d0f1a}}
.mark{width:40px;height:40px;margin-bottom:16px}`;

function page(title: string, body: string, status = 200, reply?: FastifyReply) {
  reply?.code(status).type('text/html; charset=utf-8')
    .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    .header('Cache-Control', 'no-store')
    .header('Referrer-Policy', 'no-referrer');
  const mark = '<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="3" fill="currentColor"/><rect x="22" y="2" width="16" height="16" rx="8" fill="currentColor" opacity=".55"/><rect x="2" y="22" width="16" height="16" rx="3" fill="currentColor" opacity=".55"/><rect x="24" y="24" width="12" height="12" rx="2" fill="currentColor"/></svg>';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeXml(title)}</title><style>${PAGE_CSS}</style></head><body><main>${mark}${body}</main></body></html>`;
}

function inactive(reply: FastifyReply, code: Row | null, reason: 'missing' | 'disabled' | 'expired' | 'incomplete') {
  if (code?.fallback_url && reason !== 'missing') return reply.redirect(code.fallback_url, 302);
  const msg = {
    missing: ['Diesen Code gibt es nicht', 'Der gescannte Link ist unbekannt. Vielleicht wurde der Code gelöscht oder falsch abgetippt.'],
    disabled: ['Dieser Code ist pausiert', 'Der Inhalt hinter diesem QR-Code ist vorübergehend nicht verfügbar.'],
    expired: ['Dieser Code ist abgelaufen', 'Der Inhalt hinter diesem QR-Code ist nicht mehr verfügbar.'],
    incomplete: ['Dieser Code ist noch nicht fertig', 'Für diesen QR-Code wurde noch kein vollständiges Ziel hinterlegt.'],
  }[reason];
  return reply.send(page(msg[0], `<h1>${msg[0]}</h1><p>${msg[1]}</p>`, reason === 'missing' ? 404 : 410, reply));
}

function row(label: string, value: string, href?: string) {
  if (!value) return '';
  const v = escapeXml(value);
  return `<div class="row"><b>${label}</b>${href ? `<a href="${escapeXml(href)}">${v}</a>` : `<span>${v}</span>`}</div>`;
}

const s = (d: ContentData, k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '');

function vcardPage(code: Row, d: ContentData) {
  const name = [s(d, 'firstName'), s(d, 'lastName')].filter(Boolean).join(' ') || s(d, 'org');
  const sub = [s(d, 'title'), s(d, 'org')].filter(Boolean).join(', ');
  const adr = [s(d, 'street'), [s(d, 'zip'), s(d, 'city')].filter(Boolean).join(' '), s(d, 'country')].filter(Boolean).join(', ');
  return page(name, `<h1>${escapeXml(name)}</h1><p>${escapeXml(sub)}</p>
    ${row('Mobil', s(d, 'mobile'), s(d, 'mobile') ? `tel:${cleanPhone(s(d, 'mobile'))}` : '')}
    ${row('Telefon', s(d, 'phone'), s(d, 'phone') ? `tel:${cleanPhone(s(d, 'phone'))}` : '')}
    ${row('E-Mail', s(d, 'email'), s(d, 'email') ? `mailto:${s(d, 'email')}` : '')}
    ${row('Web', s(d, 'website').replace(/^https?:\/\//, ''), s(d, 'website') ? normalizeUrl(s(d, 'website')) : '')}
    ${row('Adresse', adr)}
    <a class="btn" href="/r/${encodeURIComponent(code.slug)}/kontakt.vcf">Kontakt speichern</a>`);
}

function eventPage(code: Row, d: ContentData) {
  const fmt = (v: string) => {
    if (!v) return '';
    const [date, time] = v.split('T');
    const [y, m, dd] = date.split('-');
    return `${dd}.${m}.${y}${time && d.allDay !== true ? `, ${time.slice(0, 5)} Uhr` : ''}`;
  };
  return page(s(d, 'title'), `<h1>${escapeXml(s(d, 'title'))}</h1><p>${escapeXml(s(d, 'location'))}</p>
    ${row('Beginn', fmt(s(d, 'start')))}${row('Ende', fmt(s(d, 'end')))}
    ${typeof d.description === 'string' && d.description.trim() ? `<p style="margin-top:12px">${escapeXml(d.description.trim()).replace(/\n/g, '<br>')}</p>` : ''}
    <a class="btn" href="/r/${encodeURIComponent(code.slug)}/termin.ics">In den Kalender eintragen</a>`);
}

function pickStore(ua: string, d: ContentData): string {
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && /mobile/i.test(ua));
  const android = /android/i.test(ua);
  const pick = (ios && s(d, 'ios')) || (android && s(d, 'android')) || s(d, 'fallback') || s(d, 'ios') || s(d, 'android');
  return pick ? normalizeUrl(pick) : '';
}

function lookup(slug: string): Row | null {
  return (db.prepare('SELECT * FROM codes WHERE slug = ? AND kind = \'dynamic\' AND deleted_at IS NULL').get(slug) as Row | undefined) ?? null;
}

function checkActive(code: Row | null): 'missing' | 'disabled' | 'expired' | null {
  if (!code) return 'missing';
  if (!code.enabled) return 'disabled';
  if (code.expires_at && code.expires_at < now()) return 'expired';
  return null;
}

export function serveFile(reply: FastifyReply, fileId: string, download = false) {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as Row | undefined;
  const p = f ? path.join(config.filesDir, f.id) : '';
  if (!f || !fs.existsSync(p)) return null;
  const inlineOk = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/.test(f.mime) && !download;
  return reply
    .type(f.mime)
    .header('Content-Disposition', `${inlineOk ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
    .header('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'")
    .header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'no-store')
    .send(fs.createReadStream(p));
}

export async function publicRoutes(app: FastifyInstance) {
  app.get('/r/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const code = lookup(slug);
    const state = checkActive(code);
    if (state) return inactive(reply, code, state);
    const c = code!;
    const content = codeContent(c);
    const type = getType(c.type);
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').header('X-Robots-Tag', 'noindex');

    if (type.dynamic === 'hosted') {
      if (type.validate(content).some((i) => i.level === 'error')) return inactive(reply, c, 'incomplete');
      countScan(req, c);
      return reply.send(c.type === 'event' ? eventPage(c, content) : vcardPage(c, content));
    }
    if (c.type === 'document' && content.source === 'upload') {
      countScan(req, c);
      const sent = serveFile(reply, String(content.fileId ?? ''));
      return sent ?? inactive(reply, c, 'incomplete');
    }
    let target = '';
    if (c.type === 'appstore') target = pickStore(String(req.headers['user-agent'] ?? ''), content);
    else target = encodeContent(c.type, content).payload ?? '';
    if (!target || !isHttpUrl(target)) return inactive(reply, c, 'incomplete');
    countScan(req, c);
    return reply.redirect(target, 302);
  });

  app.get('/r/:slug/kontakt.vcf', async (req, reply) => {
    const code = lookup((req.params as { slug: string }).slug);
    const state = checkActive(code);
    if (state || code!.type !== 'vcard') return inactive(reply, code, state ?? 'missing');
    const content = codeContent(code!);
    const vcf = getType('vcard').encode({ ...content, format: content.format === 'vcard4' ? 'vcard4' : 'vcard3' });
    return reply.type('text/vcard; charset=utf-8').header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="kontakt.vcf"`).send(vcf + '\r\n');
  });

  app.get('/r/:slug/termin.ics', async (req, reply) => {
    const code = lookup((req.params as { slug: string }).slug);
    const state = checkActive(code);
    if (state || code!.type !== 'event') return inactive(reply, code, state ?? 'missing');
    const vevent = getType('event').encode(codeContent(code!)).split('\r\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    vevent.splice(1, 0, `UID:${code!.id}@tessera`, `DTSTAMP:${stamp}`);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tessera//QR-Studio//DE', 'CALSCALE:GREGORIAN', ...vevent, 'END:VCALENDAR', ''].join('\r\n');
    return reply.type('text/calendar; charset=utf-8').header('Cache-Control', 'no-store')
      .header('Content-Disposition', 'attachment; filename="termin.ics"').send(ics);
  });

  // Öffentliches Vorschaubild eines aktiven dynamischen Codes, z. B. für Aushänge im Intranet
  app.get('/r/:slug/qr.svg', async (req, reply) => {
    const code = lookup((req.params as { slug: string }).slug);
    if (checkActive(code)) return reply.code(404).send();
    const base = publicBase(req).url;
    return reply.type('image/svg+xml').header('Cache-Control', 'no-store')
      .send(renderSvg(`${base}/r/${code!.slug}`, codeDesign(code!), { idPrefix: 'q' }).svg);
  });
}
