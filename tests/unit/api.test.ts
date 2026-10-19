// Integrationstests gegen die echte Fastify-Anwendung mit SQLite (eigenes Datenverzeichnis je Lauf).
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

process.env.ADMIN_EMAIL = 'admin@test.de';
process.env.ADMIN_PASSWORD = 'sehr-geheim-123';
process.env.APP_URL = 'http://qr.intern.test';
process.env.PUBLIC_BASE_URL = 'https://go.example.com';

let app: FastifyInstance;
let cookie = '';
const H = () => ({ cookie, 'x-tessera': '1', 'content-type': 'application/json', host: 'qr.intern.test' });

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = H()) {
  const res = await app.inject({ method: method as 'GET', url, payload: body === undefined ? undefined : JSON.stringify(body), headers });
  return { status: res.statusCode, json: () => res.json(), res };
}

beforeAll(async () => {
  const { buildApp } = await import('../../src/server/app');
  app = await buildApp({ logger: false });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-tessera': '1', 'content-type': 'application/json', host: 'qr.intern.test' }, payload: { email: 'admin@test.de', password: 'sehr-geheim-123' } });
  expect(r.statusCode).toBe(200);
  cookie = String(r.headers['set-cookie']).split(';')[0];
});

describe('Anmeldung und Schutz', () => {
  it('lehnt falsche Passwörter mit verständlicher Meldung ab', async () => {
    const r = await call('POST', '/api/auth/login', { email: 'admin@test.de', password: 'falsch-falsch' }, { 'x-tessera': '1', 'content-type': 'application/json', host: 'qr.intern.test' });
    expect(r.status).toBe(401);
    expect(r.json().error.message).toMatch(/stimmen nicht/);
  });
  it('verlangt eine Anmeldung für die API', async () => {
    expect((await call('GET', '/api/codes', undefined, { host: 'qr.intern.test' })).status).toBe(401);
  });
  it('blockiert schreibende Anfragen ohne CSRF-Header', async () => {
    const r = await call('POST', '/api/codes', { type: 'url', content: { url: 'x.de' } }, { cookie, 'content-type': 'application/json', host: 'qr.intern.test' });
    expect(r.status).toBe(403);
  });
  it('blockiert Anfragen fremder Herkunft', async () => {
    const r = await call('POST', '/api/codes', { type: 'url', content: { url: 'x.de' } }, { ...H(), origin: 'https://boese.example' });
    expect(r.status).toBe(403);
  });
  it('setzt Sicherheitsheader', async () => {
    const r = await call('GET', '/healthz');
    expect(r.res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('Leserechte erlauben kein Bearbeiten', async () => {
    await call('POST', '/api/users', { email: 'leser@test.de', password: 'nur-lesen-123', role: 'viewer' });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-tessera': '1', 'content-type': 'application/json', host: 'qr.intern.test' }, payload: { email: 'leser@test.de', password: 'nur-lesen-123' } });
    const viewerCookie = String(login.headers['set-cookie']).split(';')[0];
    const r = await call('POST', '/api/codes', { type: 'url', content: { url: 'x.de' } }, { ...H(), cookie: viewerCookie });
    expect(r.status).toBe(403);
    expect((await call('GET', '/api/codes', undefined, { ...H(), cookie: viewerCookie })).status).toBe(200);
    expect((await call('GET', '/api/users', undefined, { ...H(), cookie: viewerCookie })).status).toBe(403);
  });
});

describe('Codes speichern, finden, organisieren', () => {
  let id = '';
  it('legt einen Code an und lädt ihn unverändert wieder', async () => {
    const design = { body: { shape: 'dots', size: 0.9 }, fg: { type: 'solid', color: '#2234d6' } };
    const r = await call('POST', '/api/codes', { name: 'Flyer', type: 'url', content: { url: 'beispiel.de/flyer' }, design, tags: ['Herbst', 'Print'] });
    expect(r.status).toBe(200);
    id = r.json().id;
    const d = (await call('GET', `/api/codes/${id}`)).json();
    expect(d.content.url).toBe('beispiel.de/flyer');
    expect(d.design.body.shape).toBe('dots');
    expect(d.design.fg.color).toBe('#2234d6');
    expect(d.tags).toEqual(['Herbst', 'Print']);
  });
  it('findet Codes über Suche und Schlagwort', async () => {
    expect((await call('GET', '/api/codes?q=flyer')).json().total).toBe(1);
    expect((await call('GET', '/api/codes?tag=Herbst')).json().total).toBe(1);
    expect((await call('GET', '/api/codes?q=gibtsnicht')).json().total).toBe(0);
  });
  it('dupliziert, verschiebt, löscht in den Papierkorb und stellt wieder her', async () => {
    const dup = (await call('POST', `/api/codes/${id}/duplicate`, {})).json();
    expect(dup.name).toBe('Flyer (Kopie)');
    const folder = (await call('POST', '/api/folders', { name: 'Marketing' })).json();
    await call('POST', '/api/codes/bulk', { action: 'move', ids: [id, dup.id], folderId: folder.id });
    expect((await call('GET', `/api/codes?folder=${folder.id}`)).json().total).toBe(2);
    await call('DELETE', `/api/codes/${dup.id}`);
    expect((await call('GET', '/api/codes?trash=1')).json().total).toBe(1);
    await call('POST', `/api/codes/${dup.id}/restore`, {});
    expect((await call('GET', '/api/codes?trash=1')).json().total).toBe(0);
  });
  it('bleibt bei mehreren Hundert Codes schnell', async () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ name: `Inventar ${i}`, type: 'raw', content: { data: `INV-${i}` }, tags: ['Inventar'] }));
    const r = await call('POST', '/api/codes/import', { items });
    expect(r.json().created).toBe(400);
    const t0 = Date.now();
    const list = (await call('GET', '/api/codes?q=Inventar&sort=name&limit=60')).json();
    expect(list.total).toBe(400);
    expect(list.items).toHaveLength(60);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('Vertrauliche Daten', () => {
  it('speichert WLAN-Passwörter verschlüsselt und nie in Übersichten oder Protokollen', async () => {
    const r = (await call('POST', '/api/codes', { type: 'wifi', content: { ssid: 'Gast', password: 'streng-geheim-42', security: 'WPA' } })).json();
    const { db } = await import('../../src/server/db');
    const row = db.prepare('SELECT content, summary FROM codes WHERE id = ?').get(r.id) as { content: string; summary: string };
    expect(row.content).not.toContain('streng-geheim-42');
    expect(row.content).toContain('$enc');
    expect(row.summary).not.toContain('streng-geheim');
    const list = await call('GET', '/api/codes?type=wifi');
    expect(list.res.body).not.toContain('streng-geheim-42');
    expect((await call('GET', `/api/codes/${r.id}`)).json().content.password).toBe('streng-geheim-42');
  });
  it('verwirft Passwörter auf Wunsch', async () => {
    const r = (await call('POST', '/api/codes', { type: 'wifi', storeSecrets: false, content: { ssid: 'Gast2', password: 'nicht-speichern-1', security: 'WPA' } })).json();
    const d = (await call('GET', `/api/codes/${r.id}`)).json();
    expect(d.content.password).toBe('');
    expect(d.missingSecrets).toEqual(['password']);
    expect((await call('GET', `/api/codes/${r.id}/export?format=png`)).status).toBe(400);
  });
});

describe('Dynamische Codes', () => {
  let id = '';
  let slug = '';
  it('verwendet die konfigurierte öffentliche Basisadresse', async () => {
    const r = (await call('POST', '/api/codes', { name: 'Aktion', type: 'url', kind: 'dynamic', content: { url: 'https://ziel-a.example' }, tracking: true })).json();
    id = r.id; slug = r.slug;
    expect(r.shortUrl).toBe(`https://go.example.com/r/${slug}`);
    expect(r.linkScope).toBe('public');
  });
  it('leitet mit 302 weiter und ändert das Ziel ohne neuen Code', async () => {
    let res = await app.inject({ method: 'GET', url: `/r/${slug}`, headers: { host: 'go.example.com' } });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://ziel-a.example');
    await call('PATCH', `/api/codes/${id}`, { content: { url: 'https://ziel-b.example/neu' } });
    res = await app.inject({ method: 'GET', url: `/r/${slug}`, headers: { host: 'go.example.com' } });
    expect(res.headers.location).toBe('https://ziel-b.example/neu');
    const d = (await call('GET', `/api/codes/${id}`)).json();
    expect(d.events.find((e: { kind: string }) => e.kind === 'target').detail).toBe('https://ziel-b.example/neu');
  });
  it('liefert auf dem öffentlichen Host nur Weiterleitungen aus', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/codes', headers: { host: 'go.example.com', cookie } });
    expect(r.statusCode).toBe(404);
  });
  it('zählt Scans nur mit Erlaubnis, anonym und ohne Bots', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148';
    await app.inject({ method: 'GET', url: `/r/${slug}`, headers: { 'user-agent': ua } });
    expect((await call('GET', `/api/codes/${id}/stats`)).json().total).toBe(0); // global noch nicht erlaubt
    await call('PATCH', '/api/settings', { statsAllowed: true });
    await app.inject({ method: 'GET', url: `/r/${slug}`, headers: { 'user-agent': ua, 'x-forwarded-for': '203.0.113.9' } });
    await app.inject({ method: 'GET', url: `/r/${slug}`, headers: { 'user-agent': 'WhatsApp/2.23 Preview' } });
    await app.inject({ method: 'GET', url: `/r/${slug}`, headers: { 'user-agent': ua, dnt: '1' } });
    const s = (await call('GET', `/api/codes/${id}/stats`)).json();
    expect(s.total).toBe(1);
    expect(s.days[0].mobile).toBe(1);
    const { db } = await import('../../src/server/db');
    const dump = JSON.stringify(db.prepare('SELECT * FROM scan_daily').all()) + JSON.stringify(db.prepare('SELECT * FROM codes WHERE id = ?').get(id));
    expect(dump).not.toContain('203.0.113.9');
    expect(dump).not.toContain('iPhone');
  });
  it('pausiert, läuft ab und nutzt das Ersatzziel', async () => {
    await call('PATCH', `/api/codes/${id}`, { enabled: false });
    let res = await app.inject({ method: 'GET', url: `/r/${slug}` });
    expect(res.statusCode).toBe(410);
    expect(res.body).toContain('pausiert');
    await call('PATCH', `/api/codes/${id}`, { enabled: true, expiresAt: '2020-01-01T00:00:00Z', fallbackUrl: 'beispiel.de/vorbei' });
    res = await app.inject({ method: 'GET', url: `/r/${slug}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://beispiel.de/vorbei');
  });
  it('schützt Kurzadressen vor Doppelvergabe und reservierten Namen', async () => {
    const a = await call('POST', '/api/codes', { type: 'url', kind: 'dynamic', slug: 'messe', content: { url: 'x.de' } });
    expect(a.status).toBe(200);
    const b = await call('POST', '/api/codes', { type: 'url', kind: 'dynamic', slug: 'Messe', content: { url: 'y.de' } });
    expect(b.status).toBe(409);
    expect((await call('POST', '/api/codes', { type: 'url', kind: 'dynamic', slug: 'api', content: { url: 'y.de' } })).status).toBe(400);
  });
  it('erlaubt keine dynamischen WLAN-Codes und keine Rückumwandlung', async () => {
    expect((await call('POST', '/api/codes', { type: 'wifi', kind: 'dynamic', content: { ssid: 'x', security: 'nopass' } })).status).toBe(400);
    expect((await call('PATCH', `/api/codes/${id}`, { kind: 'static' })).status).toBe(400);
  });
  it('liefert gehostete Visitenkarten mit vCard-Download', async () => {
    const r = (await call('POST', '/api/codes', { type: 'vcard', kind: 'dynamic', content: { firstName: 'Erika', lastName: '<Muster>', email: 'e@x.de' } })).json();
    const page = await app.inject({ method: 'GET', url: `/r/${r.slug}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('&lt;Muster&gt;');
    expect(page.body).not.toContain('<Muster>');
    const vcf = await app.inject({ method: 'GET', url: `/r/${r.slug}/kontakt.vcf` });
    expect(vcf.headers['content-type']).toContain('text/vcard');
    expect(vcf.body).toContain('FN:Erika <Muster>');
  });
  it('wählt beim App-Link den passenden Store', async () => {
    const r = (await call('POST', '/api/codes', { type: 'appstore', kind: 'dynamic', content: { ios: 'apps.apple.com/app/id1', android: 'play.google.com/store/apps/details?id=x', fallback: 'x.de' } })).json();
    const ios = await app.inject({ method: 'GET', url: `/r/${r.slug}`, headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
    const and = await app.inject({ method: 'GET', url: `/r/${r.slug}`, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14)' } });
    const pc = await app.inject({ method: 'GET', url: `/r/${r.slug}`, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' } });
    expect(ios.headers.location).toContain('apps.apple.com');
    expect(and.headers.location).toContain('play.google.com');
    expect(pc.headers.location).toBe('https://x.de');
  });
  it('zeigt eine Hinweisseite für unbekannte Codes', async () => {
    const r = await app.inject({ method: 'GET', url: '/r/gibtesnicht' });
    expect(r.statusCode).toBe(404);
    expect(r.body).toContain('Diesen Code gibt es nicht');
  });
});

describe('Export', () => {
  const design = { logo: { kind: 'icon', icon: 'wifi' }, frame: { style: 'card', text: 'Scan mich' } };
  it('PNG mit DPI-Angabe ist lesbar', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/render', headers: H(), payload: JSON.stringify({ payload: 'https://tessera.example/äöü', design, format: 'png', size: 900, dpi: 300 }) });
    expect(r.headers['content-type']).toBe('image/png');
    const png = PNG.sync.read(r.rawPayload);
    expect(png.width).toBe(900);
    expect(r.rawPayload.includes(Buffer.from('pHYs'))).toBe(true);
    const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(new TextDecoder().decode(Uint8Array.from(res!.binaryData))).toBe('https://tessera.example/äöü');
  });
  it('SVG mit Millimetermaßen und Text als Pfad', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/render', headers: H(), payload: JSON.stringify({ payload: 'x', design, format: 'svg', mm: 35 }) });
    expect(r.body).toMatch(/^<\?xml/);
    expect(r.body).toContain('width="35mm"');
    expect(r.body).not.toContain('<text');
  });
  it('PDF ist ein gültiges Vektor-PDF', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/render', headers: H(), payload: JSON.stringify({ payload: 'x', design, format: 'pdf', mm: 50, crop: true }) });
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('Serienexport meldet fehlerhafte Zeilen, statt kaputte Codes zu erzeugen', async () => {
    const r = await call('POST', '/api/batch/export', { type: 'epc', items: [{ name: 'a', content: { name: 'X', iban: 'DE89370400440532013000' } }, { name: 'b', content: { name: 'X', iban: 'DE00' } }], formats: ['png'] });
    expect(r.status).toBe(422);
    expect(r.json().error.rows[0].row).toBe(2);
  });
  it('Serienexport als ZIP und als Etikettenbogen', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ name: `Raum ${i}`, content: { data: `R-${i}` }, label: `R-${i}` }));
    const zip = await app.inject({ method: 'POST', url: '/api/batch/export', headers: H(), payload: JSON.stringify({ type: 'raw', items, formats: ['png', 'svg'], design: { frame: { style: 'caption' } } }) });
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zip.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(zip.rawPayload.includes(Buffer.from('uebersicht.csv'))).toBe(true);
    const pdf = await app.inject({ method: 'POST', url: '/api/batch/export', headers: H(), payload: JSON.stringify({ type: 'raw', items, sheet: { paper: 'A4', cols: 4, rows: 6 } }) });
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.rawPayload.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
  });
  it('Scan-Prüfung über die API', async () => {
    const good = (await call('POST', '/api/verify', { payload: 'https://tessera.example', design: {} })).json();
    expect(good.grade).toBe('good');
    const bad = (await call('POST', '/api/verify', { payload: 'https://tessera.example', design: { fg: { type: 'solid', color: '#f2f2f2' } } })).json();
    expect(bad.grade).toBe('fail');
  });
});

describe('API-Tokens und Backup', () => {
  it('erlaubt anderen Anwendungen den Zugriff per Bearer-Token', async () => {
    const t = (await call('POST', '/api/tokens', { name: 'Ticketsystem' })).json();
    const r = await app.inject({ method: 'GET', url: '/api/v1/qr?type=url&url=firma.de&format=svg&preset=kobalt', headers: { authorization: `Bearer ${t.token}`, host: 'qr.intern.test' } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('<svg');
    const bad = await app.inject({ method: 'GET', url: '/api/v1/qr?data=x', headers: { authorization: 'Bearer tsr_falsch', host: 'qr.intern.test' } });
    expect(bad.statusCode).toBe(401);
  });
  it('erstellt eine vollständige Sicherung', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/admin/backup', headers: H() });
    expect(r.statusCode).toBe(200);
    expect(r.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(r.rawPayload.includes(Buffer.from('tessera.db'))).toBe(true);
    expect(r.rawPayload.includes(Buffer.from('manifest.json'))).toBe(true);
    const { config } = await import('../../src/server/config');
    await new Promise((res) => setTimeout(res, 100));
    expect(fs.readdirSync(config.backupsDir).filter((f) => f.endsWith('.db') && !f.startsWith('vor-'))).toHaveLength(0);
    expect(path.isAbsolute(config.dbFile)).toBe(true);
  });
});

describe('Sicherheitsbefunde (Regression)', () => {
  it('öffentlicher Host: Umgehungen über Port, Punkt, X-Forwarded-Host und fremde Hosts sind gesperrt', async () => {
    for (const headers of [
      { host: 'go.example.com' }, { host: 'go.example.com:443' }, { host: 'go.example.com.' }, { host: 'GO.EXAMPLE.COM' },
      { host: 'go.example.com', 'x-forwarded-host': 'qr.intern.test' }, { host: 'evil.example' }, { host: '10.0.0.5' },
    ]) {
      const r = await app.inject({ method: 'GET', url: '/api/auth/state', headers });
      expect(r.statusCode, JSON.stringify(headers)).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/api/auth/state', headers: { host: 'qr.intern.test:443' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/healthz', headers: { host: 'evil.example' } })).statusCode).toBe(200);
  });
  it('sperrt ein Konto nach zehn Fehlversuchen, auch bei wechselnder IP', async () => {
    await call('POST', '/api/users', { email: 'ziel@test.de', password: 'richtig-richtig-1', role: 'viewer' });
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-tessera': '1', 'content-type': 'application/json', host: 'qr.intern.test', 'x-forwarded-for': `198.51.100.${i}` }, payload: { email: 'ziel@test.de', password: 'falsch-falsch' } });
      last = r.statusCode;
    }
    expect(last).toBe(429);
  });
  it('unbekannte Symbolnamen wie "constructor" führen nicht zu Serverfehlern', async () => {
    const r = await call('POST', '/api/verify', { payload: 'x', design: { logo: { kind: 'icon', icon: 'constructor' } } });
    expect(r.status).toBe(200);
  });
  it('Serienexporte haben ein Pixelbudget', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ name: `n${i}`, content: { data: `D${i}` } }));
    const r = await call('POST', '/api/batch/export', { type: 'raw', items, formats: ['png'], size: 2048 });
    expect(r.status).toBe(400);
    expect(r.json().error.message).toMatch(/kleinere PNG-Größe/);
  });
});
