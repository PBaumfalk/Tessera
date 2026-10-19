// Inhaltstypen: Felder, Prüfung und standardkonforme Kodierung.
// Läuft identisch im Browser (Live-Vorschau) und auf dem Server (Export, Serien, Redirects).

export type FieldValue = string | boolean;
export type ContentData = Record<string, FieldValue>;

export type FieldKind =
  | 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'number' | 'select' | 'toggle'
  | 'date' | 'datetime' | 'secret' | 'iban';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  advanced?: boolean;
  /** Sensible Werte werden verschlüsselt gespeichert und nie protokolliert. */
  sensitive?: boolean;
  /** Feld nur zeigen, wenn die Bedingung erfüllt ist. */
  showIf?: (d: ContentData) => boolean;
  maxLength?: number;
  half?: boolean;
}

export interface Issue {
  field?: string;
  level: 'error' | 'warning';
  message: string;
}

export type Category = 'links' | 'contact' | 'place' | 'network' | 'payment' | 'data';

export interface ContentTypeDef {
  id: string;
  label: string;
  description: string;
  category: Category;
  icon: string;
  keywords: string[];
  fields: FieldDef[];
  defaults: ContentData;
  /** Beispielwerte für die Vorschau, solange das Formular leer ist. */
  example: ContentData;
  validate: (d: ContentData) => Issue[];
  encode: (d: ContentData) => string;
  /** Kurzbeschreibung ohne sensible Daten (Bibliothek, Suche). */
  summary: (d: ContentData) => string;
  /** Kann dieser Typ als dynamischer Code (Kurzlink) betrieben werden? */
  dynamic?: 'redirect' | 'hosted';
  /** Mindest-Fehlerkorrektur laut Standard. */
  minEc?: 'L' | 'M' | 'Q' | 'H';
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'links', label: 'Links' },
  { id: 'contact', label: 'Kontakt' },
  { id: 'place', label: 'Ort & Termin' },
  { id: 'network', label: 'Netzwerk' },
  { id: 'payment', label: 'Zahlung' },
  { id: 'data', label: 'Text & Daten' },
];

// ---------------------------------------------------------------- Hilfen

const s = (d: ContentData, k: string): string => {
  const v = d[k];
  return typeof v === 'string' ? v.trim() : '';
};
const b = (d: ContentData, k: string): boolean => d[k] === true || d[k] === 'true';

export function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return 'https://' + v.replace(/^\/+/, '');
}

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && !/\s/.test(v);
  } catch {
    return false;
  }
}

function urlIssue(field: string, value: string, required = true): Issue[] {
  if (!value) return required ? [{ field, level: 'error', message: 'Bitte gib eine Adresse ein.' }] : [];
  const url = normalizeUrl(value);
  if (!isHttpUrl(url)) return [{ field, level: 'error', message: 'Das sieht nicht wie eine Webadresse aus. Beispiel: beispiel.de/seite' }];
  const host = new URL(url).hostname;
  if (!host.includes('.') && host !== 'localhost') {
    return [{ field, level: 'warning', message: `„${host}“ hat keine Domain-Endung. Funktioniert nur, wenn das Gerät diesen Namen kennt.` }];
  }
  if (url.startsWith('http://')) {
    return [{ field, level: 'warning', message: 'Unverschlüsselte Adresse (http). Manche Smartphones warnen davor.' }];
  }
  return [];
}

export function cleanPhone(v: string): string {
  // „+49 (0) 30 …“: die (0) ist nur im Inland zu wählen und entfällt mit Ländervorwahl
  const t = v.trim().replace(/^(\+\d{1,3})[\s-]*\(0\)/, '$1');
  return t.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

function phoneIssues(field: string, value: string, required = true): Issue[] {
  if (!value) return required ? [{ field, level: 'error', message: 'Bitte gib eine Telefonnummer ein.' }] : [];
  const c = cleanPhone(value);
  if (c.replace('+', '').length < 3 || !/^[\d\s+()\/.-]+$/.test(value)) {
    return [{ field, level: 'error', message: 'Eine Telefonnummer besteht aus Ziffern, optional mit + am Anfang.' }];
  }
  if (!c.startsWith('+') && !c.startsWith('00')) {
    return [{ field, level: 'warning', message: 'Tipp: Mit Ländervorwahl (z. B. +49 statt 0) funktioniert die Nummer auch im Ausland.' }];
  }
  return [];
}

function emailIssue(field: string, value: string, required = true): Issue[] {
  if (!value) return required ? [{ field, level: 'error', message: 'Bitte gib eine E-Mail-Adresse ein.' }] : [];
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(value)
    ? []
    : [{ field, level: 'error', message: 'Diese E-Mail-Adresse ist unvollständig. Beispiel: name@firma.de' }];
}

function lengthIssue(field: string, value: string, max: number, label: string): Issue[] {
  const len = [...value].length;
  return len > max ? [{ field, level: 'error', message: `${label} darf höchstens ${max} Zeichen lang sein (aktuell ${len}).` }] : [];
}

function req(field: string, value: string, message: string): Issue[] {
  return value ? [] : [{ field, level: 'error', message }];
}

// vCard / iCalendar (RFC 6350 / RFC 5545): Backslash, Komma, Semikolon, Zeilenumbruch maskieren
const escVcf = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '').replace(/,/g, '\\,').replace(/;/g, '\\;');
// MECARD und WIFI: \ ; , : " maskieren
const escMe = (v: string) => v.replace(/([\\;,:"])/g, '\\$1');

// ---------------------------------------------------------------- IBAN / RF

export function normalizeIban(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22,
  GI: 23, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

function mod97(numeric: string): number {
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem;
}
const toNumeric = (v: string) => v.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

export function ibanValid(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return false;
  const len = IBAN_LENGTHS[iban.slice(0, 2)];
  if (len && iban.length !== len) return false;
  return mod97(toNumeric(iban.slice(4) + iban.slice(0, 4))) === 1;
}

export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
}

export function rfReferenceValid(raw: string): boolean {
  const v = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(v)) return false;
  return mod97(toNumeric(v.slice(4) + v.slice(0, 4))) === 1;
}

// ---------------------------------------------------------------- Zeitzonen

/** Wandelt eine Wanduhrzeit (YYYY-MM-DDTHH:mm) in einer IANA-Zeitzone in UTC um. */
export function wallTimeToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ts: number) => {
    let dtf: Intl.DateTimeFormat;
    try {
      dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - ts;
  };
  let ts = guess - offsetAt(guess);
  ts = guess - offsetAt(ts);
  return new Date(ts);
}

const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = (v: string) => v.slice(0, 10).replace(/-/g, '');

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_TZ = 'Europe/Berlin';

// ---------------------------------------------------------------- Social

export const SOCIAL_PLATFORMS: { value: string; label: string; icon: string; build: (h: string) => string; hint: string }[] = [
  { value: 'instagram', label: 'Instagram', icon: 'instagram', hint: 'Benutzername', build: (h) => `https://instagram.com/${h}` },
  { value: 'linkedin', label: 'LinkedIn (Person)', icon: 'user', hint: 'Profilname aus der URL', build: (h) => `https://www.linkedin.com/in/${h}` },
  { value: 'linkedin-company', label: 'LinkedIn (Unternehmen)', icon: 'building', hint: 'Seitenname aus der URL', build: (h) => `https://www.linkedin.com/company/${h}` },
  { value: 'xing', label: 'XING', icon: 'xing', hint: 'Profilname, z. B. Max_Mustermann', build: (h) => `https://www.xing.com/profile/${h}` },
  { value: 'facebook', label: 'Facebook', icon: 'facebook', hint: 'Seiten- oder Profilname', build: (h) => `https://www.facebook.com/${h}` },
  { value: 'x', label: 'X (Twitter)', icon: 'x', hint: 'Benutzername', build: (h) => `https://x.com/${h}` },
  { value: 'threads', label: 'Threads', icon: 'threads', hint: 'Benutzername', build: (h) => `https://www.threads.net/@${h}` },
  { value: 'bluesky', label: 'Bluesky', icon: 'bluesky', hint: 'Handle, z. B. name.bsky.social', build: (h) => `https://bsky.app/profile/${h}` },
  { value: 'mastodon', label: 'Mastodon', icon: 'mastodon', hint: 'name@instanz.social', build: (h) => {
    const [user, inst] = h.replace(/^@/, '').split('@');
    return inst ? `https://${inst}/@${user}` : `https://mastodon.social/@${user}`;
  } },
  { value: 'tiktok', label: 'TikTok', icon: 'tiktok', hint: 'Benutzername', build: (h) => `https://www.tiktok.com/@${h}` },
  { value: 'youtube', label: 'YouTube', icon: 'youtube', hint: 'Kanal-Handle', build: (h) => `https://www.youtube.com/@${h}` },
  { value: 'github', label: 'GitHub', icon: 'github', hint: 'Benutzer oder Organisation', build: (h) => `https://github.com/${h}` },
  { value: 'pinterest', label: 'Pinterest', icon: 'pinterest', hint: 'Benutzername', build: (h) => `https://www.pinterest.com/${h}` },
  { value: 'twitch', label: 'Twitch', icon: 'twitch', hint: 'Kanalname', build: (h) => `https://www.twitch.tv/${h}` },
  { value: 'telegram', label: 'Telegram', icon: 'telegram', hint: 'Benutzername', build: (h) => `https://t.me/${h}` },
  { value: 'snapchat', label: 'Snapchat', icon: 'snapchat', hint: 'Benutzername', build: (h) => `https://www.snapchat.com/add/${h}` },
];

function socialHandle(raw: string): string {
  let h = raw.trim();
  // Komplette URL eingefügt? Dann letzten sinnvollen Pfadteil verwenden.
  if (/^https?:\/\//i.test(h)) return h;
  h = h.replace(/^@(?=[^@]+$)/, '');
  return h.replace(/\s+/g, '');
}

export function socialUrl(platform: string, handle: string): string {
  const h = socialHandle(handle);
  if (!h) return '';
  if (/^https?:\/\//i.test(h)) return h;
  const p = SOCIAL_PLATFORMS.find((x) => x.value === platform) ?? SOCIAL_PLATFORMS[0];
  return p.build(platform === 'mastodon' || platform === 'bluesky' ? h : encodeURIComponent(h).replace(/%40/g, '@'));
}

// ---------------------------------------------------------------- UTM

function withUtm(url: string, d: ContentData): string {
  const params: [string, string][] = [
    ['utm_source', s(d, 'utmSource')],
    ['utm_medium', s(d, 'utmMedium')],
    ['utm_campaign', s(d, 'utmCampaign')],
  ].filter(([, v]) => v) as [string, string][];
  if (!params.length) return url;
  try {
    const u = new URL(url);
    for (const [k, v] of params) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- Registry

export const CONTENT_TYPES: ContentTypeDef[] = [
  {
    id: 'url',
    label: 'Website',
    description: 'Öffnet eine Webseite oder einen beliebigen Link.',
    category: 'links',
    icon: 'globe',
    keywords: ['link', 'url', 'webseite', 'homepage', 'internet', 'adresse'],
    dynamic: 'redirect',
    fields: [
      { key: 'url', label: 'Webadresse', kind: 'url', placeholder: 'beispiel.de/angebot', required: true },
      { key: 'utmSource', label: 'Kampagnen-Quelle (utm_source)', kind: 'text', placeholder: 'flyer', advanced: true, half: true },
      { key: 'utmMedium', label: 'Medium (utm_medium)', kind: 'text', placeholder: 'print', advanced: true, half: true },
      { key: 'utmCampaign', label: 'Kampagne (utm_campaign)', kind: 'text', placeholder: 'herbst-2026', advanced: true },
    ],
    defaults: { url: '' },
    example: { url: 'https://tessera.example/hallo' },
    validate: (d) => urlIssue('url', s(d, 'url')),
    encode: (d) => withUtm(normalizeUrl(s(d, 'url')), d),
    summary: (d) => normalizeUrl(s(d, 'url')).replace(/^https?:\/\//, ''),
  },
  {
    id: 'vcard',
    label: 'Visitenkarte',
    description: 'Speichert einen Kontakt direkt im Adressbuch.',
    category: 'contact',
    icon: 'card',
    keywords: ['vcard', 'kontakt', 'visitenkarte', 'adressbuch', 'mecard', 'person'],
    dynamic: 'hosted',
    fields: [
      { key: 'firstName', label: 'Vorname', kind: 'text', half: true, placeholder: 'Erika' },
      { key: 'lastName', label: 'Nachname', kind: 'text', half: true, placeholder: 'Mustermann' },
      { key: 'org', label: 'Firma', kind: 'text', half: true },
      { key: 'title', label: 'Position', kind: 'text', half: true },
      { key: 'mobile', label: 'Mobil', kind: 'tel', half: true, placeholder: '+49 171 1234567' },
      { key: 'phone', label: 'Telefon geschäftlich', kind: 'tel', half: true },
      { key: 'email', label: 'E-Mail', kind: 'email' },
      { key: 'website', label: 'Website', kind: 'url' },
      { key: 'street', label: 'Straße und Hausnummer', kind: 'text', advanced: true },
      { key: 'zip', label: 'PLZ', kind: 'text', advanced: true, half: true },
      { key: 'city', label: 'Ort', kind: 'text', advanced: true, half: true },
      { key: 'country', label: 'Land', kind: 'text', advanced: true },
      { key: 'fax', label: 'Fax', kind: 'tel', advanced: true, half: true },
      { key: 'department', label: 'Abteilung', kind: 'text', advanced: true, half: true },
      { key: 'note', label: 'Notiz', kind: 'textarea', advanced: true },
      { key: 'format', label: 'Format', kind: 'select', advanced: true, options: [
        { value: 'vcard3', label: 'vCard 3.0 – beste Kompatibilität' },
        { value: 'vcard4', label: 'vCard 4.0 – aktueller Standard' },
        { value: 'mecard', label: 'MECARD – kompakt, weniger Felder' },
      ], help: 'MECARD erzeugt kleinere Codes, unterstützt aber keine Position und kein Fax.' },
    ],
    defaults: { format: 'vcard3' },
    example: { firstName: 'Erika', lastName: 'Mustermann', org: 'Tessera', mobile: '+49 171 1234567', email: 'erika@tessera.example', format: 'vcard3' },
    validate: (d) => {
      const issues: Issue[] = [];
      if (!s(d, 'firstName') && !s(d, 'lastName') && !s(d, 'org')) {
        issues.push({ field: 'lastName', level: 'error', message: 'Gib mindestens einen Namen oder eine Firma an.' });
      }
      issues.push(...phoneIssues('mobile', s(d, 'mobile'), false).filter((i) => i.level === 'error'));
      issues.push(...phoneIssues('phone', s(d, 'phone'), false).filter((i) => i.level === 'error'));
      issues.push(...emailIssue('email', s(d, 'email'), false));
      if (s(d, 'website')) issues.push(...urlIssue('website', s(d, 'website')));
      return issues;
    },
    encode: (d) => {
      const fmt = s(d, 'format') || 'vcard3';
      const fn = [s(d, 'firstName'), s(d, 'lastName')].filter(Boolean).join(' ') || s(d, 'org');
      const web = s(d, 'website') ? normalizeUrl(s(d, 'website')) : '';
      if (fmt === 'mecard') {
        const parts = [`N:${escMe(s(d, 'lastName'))}${s(d, 'firstName') ? ',' + escMe(s(d, 'firstName')) : ''}`];
        if (s(d, 'org')) parts.push(`ORG:${escMe(s(d, 'org'))}`);
        if (s(d, 'mobile')) parts.push(`TEL:${cleanPhone(s(d, 'mobile'))}`);
        if (s(d, 'phone')) parts.push(`TEL:${cleanPhone(s(d, 'phone'))}`);
        if (s(d, 'email')) parts.push(`EMAIL:${escMe(s(d, 'email'))}`);
        if (web) parts.push(`URL:${escMe(web)}`);
        const adr = [s(d, 'street'), [s(d, 'zip'), s(d, 'city')].filter(Boolean).join(' '), s(d, 'country')].filter(Boolean).join(', ');
        if (adr) parts.push(`ADR:${escMe(adr)}`);
        if (s(d, 'note')) parts.push(`NOTE:${escMe(s(d, 'note'))}`);
        return `MECARD:${parts.join(';')};;`;
      }
      const v4 = fmt === 'vcard4';
      const L: string[] = ['BEGIN:VCARD', `VERSION:${v4 ? '4.0' : '3.0'}`];
      L.push(`N:${escVcf(s(d, 'lastName'))};${escVcf(s(d, 'firstName'))};;;`);
      L.push(`FN:${escVcf(fn)}`);
      if (s(d, 'org') || s(d, 'department')) L.push(`ORG:${escVcf(s(d, 'org'))}${s(d, 'department') ? ';' + escVcf(s(d, 'department')) : ''}`);
      if (s(d, 'title')) L.push(`TITLE:${escVcf(s(d, 'title'))}`);
      if (s(d, 'mobile')) L.push(v4 ? `TEL;TYPE=cell,voice;VALUE=uri:tel:${cleanPhone(s(d, 'mobile'))}` : `TEL;TYPE=CELL:${cleanPhone(s(d, 'mobile'))}`);
      if (s(d, 'phone')) L.push(v4 ? `TEL;TYPE=work,voice;VALUE=uri:tel:${cleanPhone(s(d, 'phone'))}` : `TEL;TYPE=WORK,VOICE:${cleanPhone(s(d, 'phone'))}`);
      if (s(d, 'fax')) L.push(v4 ? `TEL;TYPE=work,fax;VALUE=uri:tel:${cleanPhone(s(d, 'fax'))}` : `TEL;TYPE=WORK,FAX:${cleanPhone(s(d, 'fax'))}`);
      if (s(d, 'email')) L.push(v4 ? `EMAIL;TYPE=work:${s(d, 'email')}` : `EMAIL;TYPE=INTERNET:${s(d, 'email')}`);
      if (web) L.push(`URL:${web}`);
      if (s(d, 'street') || s(d, 'city') || s(d, 'zip') || s(d, 'country')) {
        L.push(`ADR;TYPE=${v4 ? 'work' : 'WORK'}:;;${escVcf(s(d, 'street'))};${escVcf(s(d, 'city'))};;${escVcf(s(d, 'zip'))};${escVcf(s(d, 'country'))}`);
      }
      if (s(d, 'note')) L.push(`NOTE:${escVcf(s(d, 'note'))}`);
      L.push('END:VCARD');
      return L.join('\r\n');
    },
    summary: (d) => [[s(d, 'firstName'), s(d, 'lastName')].filter(Boolean).join(' '), s(d, 'org')].filter(Boolean).join(', '),
  },
  {
    id: 'wifi',
    label: 'WLAN',
    description: 'Verbindet Smartphones ohne Passwort-Abtippen.',
    category: 'network',
    icon: 'wifi',
    keywords: ['wlan', 'wifi', 'wi-fi', 'netzwerk', 'gast', 'passwort', 'hotspot'],
    fields: [
      { key: 'ssid', label: 'Netzwerkname (SSID)', kind: 'text', required: true, placeholder: 'Gaeste-WLAN' },
      { key: 'security', label: 'Verschlüsselung', kind: 'select', options: [
        { value: 'WPA', label: 'WPA2 / WPA3 (empfohlen)' },
        { value: 'WEP', label: 'WEP (veraltet)' },
        { value: 'nopass', label: 'Offen, ohne Passwort' },
        { value: 'WPA2-EAP', label: 'WPA2-Enterprise (802.1X)' },
      ] },
      { key: 'password', label: 'Passwort', kind: 'secret', sensitive: true, showIf: (d) => s(d, 'security') !== 'nopass',
        help: 'Wird verschlüsselt gespeichert und nie protokolliert. Du kannst das Speichern auch ganz abschalten.' },
      { key: 'eapMethod', label: 'EAP-Methode', kind: 'select', showIf: (d) => s(d, 'security') === 'WPA2-EAP', options: [
        { value: 'PEAP', label: 'PEAP' }, { value: 'TTLS', label: 'TTLS' }, { value: 'TLS', label: 'TLS' }, { value: 'PWD', label: 'PWD' },
      ], half: true },
      { key: 'identity', label: 'Benutzername', kind: 'text', showIf: (d) => s(d, 'security') === 'WPA2-EAP', half: true },
      { key: 'hidden', label: 'Verstecktes Netzwerk', kind: 'toggle', advanced: true, help: 'Nur aktivieren, wenn die SSID nicht öffentlich sichtbar ist.' },
    ],
    defaults: { security: 'WPA', hidden: false, eapMethod: 'PEAP' },
    example: { ssid: 'Gaeste-WLAN', security: 'WPA', password: 'beispielpasswort' },
    validate: (d) => {
      const issues: Issue[] = [...req('ssid', s(d, 'ssid'), 'Bitte gib den Netzwerknamen ein.')];
      issues.push(...lengthIssue('ssid', s(d, 'ssid'), 32, 'Der Netzwerkname'));
      const sec = s(d, 'security') || 'WPA';
      const pw = typeof d.password === 'string' ? d.password : '';
      if (sec === 'WPA' && pw && (pw.length < 8 || pw.length > 63)) {
        issues.push({ field: 'password', level: 'error', message: 'WPA-Passwörter haben 8 bis 63 Zeichen.' });
      }
      if ((sec === 'WPA' || sec === 'WEP') && !pw) issues.push({ field: 'password', level: 'error', message: 'Bitte gib das WLAN-Passwort ein.' });
      if (sec === 'WEP') issues.push({ field: 'security', level: 'warning', message: 'WEP gilt als unsicher. Nutze wenn möglich WPA2 oder WPA3.' });
      if (sec === 'WPA2-EAP') issues.push({ field: 'security', level: 'warning', message: 'Enterprise-WLAN wird nur von Android zuverlässig per QR-Code eingerichtet.' });
      return issues;
    },
    encode: (d) => {
      const sec = s(d, 'security') || 'WPA';
      const pw = typeof d.password === 'string' ? d.password : '';
      const parts = [`T:${sec === 'WPA2-EAP' ? 'WPA2-EAP' : sec}`, `S:${escMe(s(d, 'ssid'))}`];
      if (sec === 'WPA2-EAP') {
        parts.push(`E:${s(d, 'eapMethod') || 'PEAP'}`);
        if (s(d, 'identity')) parts.push(`I:${escMe(s(d, 'identity'))}`);
      }
      if (sec !== 'nopass' && pw) parts.push(`P:${escMe(pw)}`);
      if (b(d, 'hidden')) parts.push('H:true');
      return `WIFI:${parts.join(';')};;`;
    },
    summary: (d) => s(d, 'ssid'),
  },
  {
    id: 'text',
    label: 'Text',
    description: 'Zeigt einen beliebigen Text an.',
    category: 'data',
    icon: 'info',
    keywords: ['text', 'notiz', 'nachricht', 'freitext'],
    fields: [{ key: 'text', label: 'Text', kind: 'textarea', required: true, placeholder: 'Hallo! Schön, dass du da bist.' }],
    defaults: { text: '' },
    example: { text: 'Hallo von Tessera!' },
    validate: (d) => (typeof d.text === 'string' && d.text.length ? [] : [{ field: 'text', level: 'error', message: 'Bitte gib einen Text ein.' }]),
    encode: (d) => (typeof d.text === 'string' ? d.text : ''),
    summary: (d) => (typeof d.text === 'string' ? d.text.slice(0, 80) : ''),
  },
  {
    id: 'phone',
    label: 'Anruf',
    description: 'Wählt eine Telefonnummer.',
    category: 'contact',
    icon: 'phone',
    keywords: ['telefon', 'anruf', 'nummer', 'tel', 'hotline'],
    fields: [{ key: 'phone', label: 'Telefonnummer', kind: 'tel', required: true, placeholder: '+49 30 1234567' }],
    defaults: { phone: '' },
    example: { phone: '+49 30 1234567' },
    validate: (d) => phoneIssues('phone', s(d, 'phone')),
    encode: (d) => `tel:${cleanPhone(s(d, 'phone'))}`,
    summary: (d) => s(d, 'phone'),
  },
  {
    id: 'email',
    label: 'E-Mail',
    description: 'Öffnet eine vorbereitete E-Mail.',
    category: 'contact',
    icon: 'mail',
    keywords: ['email', 'e-mail', 'mail', 'mailto', 'nachricht'],
    fields: [
      { key: 'to', label: 'Empfänger', kind: 'email', required: true, placeholder: 'kontakt@firma.de' },
      { key: 'subject', label: 'Betreff', kind: 'text' },
      { key: 'body', label: 'Nachricht', kind: 'textarea' },
      { key: 'cc', label: 'Kopie an (CC)', kind: 'email', advanced: true },
      { key: 'format', label: 'Format', kind: 'select', advanced: true, options: [
        { value: 'mailto', label: 'mailto: – Standard (RFC 6068)' },
        { value: 'matmsg', label: 'MATMSG – für ältere Scanner' },
      ] },
    ],
    defaults: { format: 'mailto' },
    example: { to: 'hallo@tessera.example', subject: 'Anfrage' },
    validate: (d) => [...emailIssue('to', s(d, 'to')), ...emailIssue('cc', s(d, 'cc'), false)],
    encode: (d) => {
      if (s(d, 'format') === 'matmsg') {
        return `MATMSG:TO:${escMe(s(d, 'to'))};SUB:${escMe(s(d, 'subject'))};BODY:${escMe(typeof d.body === 'string' ? d.body : '')};;`;
      }
      const q: string[] = [];
      if (s(d, 'cc')) q.push('cc=' + encodeURIComponent(s(d, 'cc')));
      if (s(d, 'subject')) q.push('subject=' + encodeURIComponent(s(d, 'subject')));
      const body = typeof d.body === 'string' ? d.body.replace(/\r?\n/g, '\r\n') : '';
      if (body.trim()) q.push('body=' + encodeURIComponent(body));
      return `mailto:${s(d, 'to')}${q.length ? '?' + q.join('&') : ''}`;
    },
    summary: (d) => [s(d, 'to'), s(d, 'subject')].filter(Boolean).join(' – '),
  },
  {
    id: 'sms',
    label: 'SMS',
    description: 'Bereitet eine Kurznachricht vor.',
    category: 'contact',
    icon: 'message',
    keywords: ['sms', 'kurznachricht', 'text', 'nachricht'],
    fields: [
      { key: 'phone', label: 'Empfänger', kind: 'tel', required: true, placeholder: '+49 171 1234567' },
      { key: 'message', label: 'Nachricht', kind: 'textarea', maxLength: 160 },
      { key: 'format', label: 'Format', kind: 'select', advanced: true, options: [
        { value: 'smsto', label: 'SMSTO – breite Unterstützung' },
        { value: 'uri', label: 'sms: – URI nach RFC 5724' },
      ] },
    ],
    defaults: { format: 'smsto' },
    example: { phone: '+49 171 1234567', message: 'Hallo!' },
    validate: (d) => phoneIssues('phone', s(d, 'phone')),
    encode: (d) => {
      const msg = typeof d.message === 'string' ? d.message : '';
      return s(d, 'format') === 'uri'
        ? `sms:${cleanPhone(s(d, 'phone'))}${msg ? '?body=' + encodeURIComponent(msg) : ''}`
        : `SMSTO:${cleanPhone(s(d, 'phone'))}:${msg}`;
    },
    summary: (d) => s(d, 'phone'),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Startet einen WhatsApp-Chat mit vorbereitetem Text.',
    category: 'contact',
    icon: 'whatsapp',
    keywords: ['whatsapp', 'chat', 'messenger'],
    dynamic: 'redirect',
    fields: [
      { key: 'phone', label: 'Telefonnummer mit Ländervorwahl', kind: 'tel', required: true, placeholder: '+49 171 1234567' },
      { key: 'message', label: 'Vorbereitete Nachricht', kind: 'textarea' },
    ],
    defaults: {},
    example: { phone: '+49 171 1234567', message: 'Hallo!' },
    validate: (d) => {
      const issues = phoneIssues('phone', s(d, 'phone')).filter((i) => i.level === 'error');
      const c = cleanPhone(s(d, 'phone'));
      if (c && !c.startsWith('+') && !c.startsWith('00')) {
        issues.push({ field: 'phone', level: 'error', message: 'WhatsApp braucht die Nummer mit Ländervorwahl, z. B. +49 171 …' });
      }
      return issues;
    },
    encode: (d) => {
      const n = cleanPhone(s(d, 'phone')).replace(/^\+/, '').replace(/^00/, '');
      const msg = typeof d.message === 'string' ? d.message.trim() : '';
      return `https://wa.me/${n}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
    },
    summary: (d) => s(d, 'phone'),
  },
  {
    id: 'geo',
    label: 'Standort',
    description: 'Zeigt einen Ort auf der Karte.',
    category: 'place',
    icon: 'pin',
    keywords: ['standort', 'karte', 'ort', 'adresse', 'koordinaten', 'geo', 'maps', 'anfahrt'],
    dynamic: 'redirect',
    fields: [
      { key: 'mode', label: 'Ort angeben als', kind: 'select', options: [
        { value: 'coords', label: 'Koordinaten' },
        { value: 'address', label: 'Adresse' },
      ] },
      { key: 'lat', label: 'Breitengrad', kind: 'text', half: true, placeholder: '52.5163', showIf: (d) => s(d, 'mode') !== 'address' },
      { key: 'lon', label: 'Längengrad', kind: 'text', half: true, placeholder: '13.3777', showIf: (d) => s(d, 'mode') !== 'address',
        help: 'Tipp: Füge einen Google-Maps- oder OpenStreetMap-Link in das Breitengrad-Feld ein, die Koordinaten werden übernommen.' },
      { key: 'address', label: 'Adresse', kind: 'textarea', placeholder: 'Pariser Platz 1, 10117 Berlin', showIf: (d) => s(d, 'mode') === 'address' },
      { key: 'label', label: 'Bezeichnung', kind: 'text', placeholder: 'Haupteingang' },
      { key: 'target', label: 'Öffnen mit', kind: 'select', options: [
        { value: 'google', label: 'Google Maps (alle Geräte)' },
        { value: 'apple', label: 'Apple Karten' },
        { value: 'osm', label: 'OpenStreetMap' },
        { value: 'geo', label: 'geo:-URI (Standard-Karten-App)' },
      ] },
    ],
    defaults: { mode: 'coords', target: 'google' },
    example: { mode: 'coords', lat: '52.5163', lon: '13.3777', target: 'google' },
    validate: (d) => {
      if (s(d, 'mode') === 'address') {
        const issues = req('address', s(d, 'address'), 'Bitte gib eine Adresse ein.');
        if (s(d, 'target') === 'geo') issues.push({ field: 'target', level: 'warning', message: 'geo:-Links mit Adresse versteht nicht jede Karten-App.' });
        return issues;
      }
      const lat = Number(s(d, 'lat').replace(',', '.'));
      const lon = Number(s(d, 'lon').replace(',', '.'));
      const issues: Issue[] = [];
      if (!s(d, 'lat') || !Number.isFinite(lat) || lat < -90 || lat > 90) issues.push({ field: 'lat', level: 'error', message: 'Breitengrad zwischen -90 und 90, z. B. 52.5163' });
      if (!s(d, 'lon') || !Number.isFinite(lon) || lon < -180 || lon > 180) issues.push({ field: 'lon', level: 'error', message: 'Längengrad zwischen -180 und 180, z. B. 13.3777' });
      return issues;
    },
    encode: (d) => {
      const label = s(d, 'label');
      const target = s(d, 'target') || 'google';
      if (s(d, 'mode') === 'address') {
        const a = s(d, 'address').replace(/\s*\n\s*/g, ', ');
        const q = encodeURIComponent(a);
        if (target === 'apple') return `https://maps.apple.com/?q=${encodeURIComponent(label || a)}&address=${q}`;
        if (target === 'osm') return `https://www.openstreetmap.org/search?query=${q}`;
        if (target === 'geo') return `geo:0,0?q=${q}`;
        return `https://www.google.com/maps/search/?api=1&query=${q}`;
      }
      const lat = Number(s(d, 'lat').replace(',', '.')).toFixed(6).replace(/\.?0+$/, '');
      const lon = Number(s(d, 'lon').replace(',', '.')).toFixed(6).replace(/\.?0+$/, '');
      if (target === 'apple') return `https://maps.apple.com/?ll=${lat},${lon}${label ? '&q=' + encodeURIComponent(label) : ''}`;
      if (target === 'osm') return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
      if (target === 'geo') return `geo:${lat},${lon}${label ? `?q=${lat},${lon}(${encodeURIComponent(label)})` : ''}`;
      return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`;
    },
    summary: (d) => s(d, 'label') || (s(d, 'mode') === 'address' ? s(d, 'address') : `${s(d, 'lat')}, ${s(d, 'lon')}`),
  },
  {
    id: 'event',
    label: 'Termin',
    description: 'Trägt eine Veranstaltung in den Kalender ein.',
    category: 'place',
    icon: 'calendar',
    keywords: ['termin', 'kalender', 'veranstaltung', 'event', 'ical', 'ics', 'meeting', 'einladung'],
    dynamic: 'hosted',
    fields: [
      { key: 'title', label: 'Titel', kind: 'text', required: true, placeholder: 'Tag der offenen Tür' },
      { key: 'allDay', label: 'Ganztägig', kind: 'toggle' },
      { key: 'start', label: 'Beginn', kind: 'datetime', half: true, required: true },
      { key: 'end', label: 'Ende', kind: 'datetime', half: true },
      { key: 'location', label: 'Ort', kind: 'text' },
      { key: 'description', label: 'Beschreibung', kind: 'textarea', advanced: true },
      { key: 'url', label: 'Link zur Veranstaltung', kind: 'url', advanced: true },
      { key: 'tz', label: 'Zeitzone', kind: 'text', advanced: true, placeholder: DEFAULT_TZ, help: 'IANA-Zeitzone, z. B. Europe/Berlin. Die Uhrzeit wird als UTC kodiert und auf jedem Gerät richtig angezeigt.' },
    ],
    defaults: { allDay: false, tz: DEFAULT_TZ },
    example: { title: 'Tag der offenen Tür', start: '2026-11-14T10:00', end: '2026-11-14T16:00', location: 'Hauptgebäude', tz: DEFAULT_TZ },
    validate: (d) => {
      const issues: Issue[] = [...req('title', s(d, 'title'), 'Bitte gib einen Titel ein.')];
      const start = s(d, 'start');
      if (!start) issues.push({ field: 'start', level: 'error', message: 'Wann beginnt der Termin?' });
      const end = s(d, 'end');
      if (start && end && end.slice(0, b(d, 'allDay') ? 10 : 16) < start.slice(0, b(d, 'allDay') ? 10 : 16)) {
        issues.push({ field: 'end', level: 'error', message: 'Das Ende liegt vor dem Beginn.' });
      }
      const tz = s(d, 'tz');
      if (tz) {
        try { new Intl.DateTimeFormat('de', { timeZone: tz }); } catch { issues.push({ field: 'tz', level: 'error', message: `Die Zeitzone „${tz}“ ist unbekannt. Beispiel: Europe/Berlin` }); }
      }
      if (s(d, 'url')) issues.push(...urlIssue('url', s(d, 'url')));
      return issues;
    },
    encode: (d) => {
      const tz = s(d, 'tz') || DEFAULT_TZ;
      const L = ['BEGIN:VEVENT', `SUMMARY:${escVcf(s(d, 'title'))}`];
      const start = s(d, 'start');
      const end = s(d, 'end');
      if (b(d, 'allDay')) {
        L.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
        L.push(`DTEND;VALUE=DATE:${icsDate(addDays(end || start, 1))}`);
      } else {
        const st = wallTimeToUtc(start, tz);
        if (st) L.push(`DTSTART:${icsUtc(st)}`);
        const en = end ? wallTimeToUtc(end, tz) : st ? new Date(st.getTime() + 3600_000) : null;
        if (en) L.push(`DTEND:${icsUtc(en)}`);
      }
      if (s(d, 'location')) L.push(`LOCATION:${escVcf(s(d, 'location'))}`);
      if (typeof d.description === 'string' && d.description.trim()) L.push(`DESCRIPTION:${escVcf(d.description.trim())}`);
      if (s(d, 'url')) L.push(`URL:${normalizeUrl(s(d, 'url'))}`);
      L.push('END:VEVENT');
      return L.join('\r\n');
    },
    summary: (d) => [s(d, 'title'), s(d, 'start').replace('T', ' ')].filter(Boolean).join(' – '),
  },
  {
    id: 'booking',
    label: 'Terminbuchung',
    description: 'Führt zu einer Buchungsseite für Termine.',
    category: 'place',
    icon: 'clock',
    keywords: ['buchung', 'termin buchen', 'calendly', 'cal.com', 'bookings', 'reservierung', 'sprechstunde'],
    dynamic: 'redirect',
    fields: [
      { key: 'provider', label: 'Dienst', kind: 'select', options: [
        { value: 'any', label: 'Beliebige Buchungsseite' },
        { value: 'calendly', label: 'Calendly' },
        { value: 'calcom', label: 'Cal.com' },
        { value: 'msbookings', label: 'Microsoft Bookings' },
        { value: 'doctolib', label: 'Doctolib' },
      ] },
      { key: 'url', label: 'Link zur Buchungsseite', kind: 'url', required: true, placeholder: 'calendly.com/name/30min' },
    ],
    defaults: { provider: 'any' },
    example: { provider: 'any', url: 'https://cal.com/tessera/beratung' },
    validate: (d) => {
      const issues = urlIssue('url', s(d, 'url'));
      const p = s(d, 'provider');
      const hostHints: Record<string, string> = { calendly: 'calendly.com', calcom: 'cal.com', msbookings: 'outlook.office', doctolib: 'doctolib.' };
      if (!issues.some((i) => i.level === 'error') && hostHints[p] && !normalizeUrl(s(d, 'url')).includes(hostHints[p])) {
        issues.push({ field: 'url', level: 'warning', message: `Der Link führt nicht zu ${hostHints[p]}. Stimmt der Dienst?` });
      }
      return issues;
    },
    encode: (d) => normalizeUrl(s(d, 'url')),
    summary: (d) => normalizeUrl(s(d, 'url')).replace(/^https?:\/\//, ''),
  },
  {
    id: 'social',
    label: 'Social Media',
    description: 'Führt zu einem Profil auf Instagram, LinkedIn & Co.',
    category: 'links',
    icon: 'instagram',
    keywords: ['social', 'instagram', 'linkedin', 'facebook', 'tiktok', 'youtube', 'xing', 'mastodon', 'profil', 'folgen'],
    dynamic: 'redirect',
    fields: [
      { key: 'platform', label: 'Plattform', kind: 'select', options: SOCIAL_PLATFORMS.map((p) => ({ value: p.value, label: p.label })) },
      { key: 'handle', label: 'Profil', kind: 'text', required: true, placeholder: 'Benutzername oder Profil-Link',
        help: 'Benutzername genügt. Ein kompletter Profil-Link funktioniert auch.' },
    ],
    defaults: { platform: 'instagram' },
    example: { platform: 'instagram', handle: 'tessera' },
    validate: (d) => {
      const h = s(d, 'handle');
      if (!h) return [{ field: 'handle', level: 'error', message: 'Bitte gib den Benutzernamen ein.' }];
      if (/^https?:\/\//i.test(h)) return urlIssue('handle', h);
      if (s(d, 'platform') === 'mastodon' && !/^@?[^@\s]+@[^@\s]+\.[^@\s]+$/.test(h)) {
        return [{ field: 'handle', level: 'warning', message: 'Mastodon-Profile haben die Form name@instanz.social. Ohne Instanz wird mastodon.social angenommen.' }];
      }
      return /\s/.test(h) ? [{ field: 'handle', level: 'error', message: 'Benutzernamen enthalten keine Leerzeichen.' }] : [];
    },
    encode: (d) => socialUrl(s(d, 'platform') || 'instagram', s(d, 'handle')),
    summary: (d) => `${SOCIAL_PLATFORMS.find((p) => p.value === s(d, 'platform'))?.label ?? ''}: ${s(d, 'handle')}`,
  },
  {
    id: 'appstore',
    label: 'App',
    description: 'Führt in den App Store oder zu Google Play.',
    category: 'links',
    icon: 'apple',
    keywords: ['app', 'app store', 'google play', 'ios', 'android', 'download', 'herunterladen'],
    dynamic: 'redirect',
    fields: [
      { key: 'ios', label: 'App Store (iPhone, iPad)', kind: 'url', placeholder: 'apps.apple.com/de/app/…/id123456789' },
      { key: 'android', label: 'Google Play (Android)', kind: 'url', placeholder: 'play.google.com/store/apps/details?id=…' },
      { key: 'fallback', label: 'Für alle anderen Geräte', kind: 'url', placeholder: 'beispiel.de/app', help: 'Zum Beispiel die Website der App.' },
      { key: 'primary', label: 'Statischer Code führt zu', kind: 'select', options: [
        { value: 'ios', label: 'App Store' }, { value: 'android', label: 'Google Play' }, { value: 'fallback', label: 'Website' },
      ], help: 'Ein statischer Code kann nur ein Ziel haben. Als dynamischer Code erkennt Tessera das Gerät und öffnet den passenden Store.' },
    ],
    defaults: { primary: 'ios' },
    example: { ios: 'https://apps.apple.com/de/app/id284882215', android: 'https://play.google.com/store/apps/details?id=com.facebook.katana', primary: 'ios' },
    validate: (d) => {
      const issues: Issue[] = [];
      if (!s(d, 'ios') && !s(d, 'android') && !s(d, 'fallback')) {
        issues.push({ field: 'ios', level: 'error', message: 'Gib mindestens einen Store-Link an.' });
        return issues;
      }
      for (const k of ['ios', 'android', 'fallback']) if (s(d, k)) issues.push(...urlIssue(k, s(d, k)));
      const host = (k: string) => { try { return new URL(normalizeUrl(s(d, k))).hostname; } catch { return ''; } };
      if (s(d, 'ios') && !/(^|\.)apple\.com$/.test(host('ios'))) issues.push({ field: 'ios', level: 'warning', message: 'Das ist kein Link in den App Store (apps.apple.com).' });
      if (s(d, 'android') && host('android') !== 'play.google.com') issues.push({ field: 'android', level: 'warning', message: 'Das ist kein Link zu Google Play (play.google.com).' });
      const p = s(d, 'primary') || 'ios';
      if (!s(d, p)) issues.push({ field: 'primary', level: 'warning', message: 'Für das gewählte Ziel ist kein Link eingetragen. Es wird der erste vorhandene verwendet.' });
      return issues;
    },
    encode: (d) => {
      const p = s(d, 'primary') || 'ios';
      return normalizeUrl(s(d, p) || s(d, 'ios') || s(d, 'android') || s(d, 'fallback'));
    },
    summary: (d) => [s(d, 'ios') && 'App Store', s(d, 'android') && 'Google Play'].filter(Boolean).join(' + '),
  },
  {
    id: 'document',
    label: 'Dokument',
    description: 'Verlinkt ein PDF, eine Anleitung oder Speisekarte.',
    category: 'links',
    icon: 'file',
    keywords: ['dokument', 'pdf', 'datei', 'anleitung', 'speisekarte', 'menü', 'broschüre', 'download'],
    dynamic: 'redirect',
    fields: [
      { key: 'source', label: 'Quelle', kind: 'select', options: [
        { value: 'link', label: 'Link zu einem Dokument' },
        { value: 'upload', label: 'Datei in Tessera ablegen (dynamischer Code)' },
      ] },
      { key: 'url', label: 'Link zum Dokument', kind: 'url', placeholder: 'intranet.firma.de/handbuch.pdf', showIf: (d) => s(d, 'source') !== 'upload' },
      { key: 'fileId', label: 'Datei', kind: 'text', showIf: (d) => s(d, 'source') === 'upload' },
      { key: 'title', label: 'Titel', kind: 'text', placeholder: 'Bedienungsanleitung' },
    ],
    defaults: { source: 'link' },
    example: { source: 'link', url: 'https://tessera.example/handbuch.pdf', title: 'Handbuch' },
    validate: (d) => (s(d, 'source') === 'upload'
      ? req('fileId', s(d, 'fileId'), 'Bitte lade eine Datei hoch.')
      : urlIssue('url', s(d, 'url'))),
    encode: (d) => normalizeUrl(s(d, 'url')),
    summary: (d) => s(d, 'title') || normalizeUrl(s(d, 'url')).replace(/^https?:\/\//, ''),
  },
  {
    id: 'epc',
    label: 'GiroCode',
    description: 'SEPA-Überweisung für Banking-Apps (EPC-QR).',
    category: 'payment',
    icon: 'euro',
    keywords: ['girocode', 'sepa', 'überweisung', 'zahlung', 'rechnung', 'iban', 'epc', 'bank', 'bezahlen'],
    minEc: 'M',
    fields: [
      { key: 'name', label: 'Empfänger', kind: 'text', required: true, maxLength: 70, placeholder: 'Mustermann GmbH' },
      { key: 'iban', label: 'IBAN', kind: 'iban', required: true, sensitive: true, placeholder: 'DE89 3704 0044 0532 0130 00' },
      { key: 'bic', label: 'BIC', kind: 'text', half: true, help: 'Innerhalb des EWR nicht erforderlich.', advanced: true },
      { key: 'amount', label: 'Betrag in Euro', kind: 'number', half: true, placeholder: '49,90' },
      { key: 'remittance', label: 'Verwendungszweck', kind: 'text', maxLength: 140, placeholder: 'Rechnung 2026-0815' },
      { key: 'reference', label: 'Strukturierte Referenz (RF)', kind: 'text', advanced: true, placeholder: 'RF18 5390 0754 7034',
        help: 'Ersetzt den Verwendungszweck. Nur nutzen, wenn der Empfänger RF-Referenzen verlangt.' },
      { key: 'purpose', label: 'Zweckcode', kind: 'text', advanced: true, half: true, placeholder: 'GDDS', maxLength: 4 },
      { key: 'info', label: 'Hinweis an Zahlende', kind: 'text', advanced: true, maxLength: 70 },
    ],
    defaults: {},
    example: { name: 'Tessera Beispiel GmbH', iban: 'DE89370400440532013000', amount: '49,90', remittance: 'Rechnung 2026-0815' },
    validate: (d) => {
      const issues: Issue[] = [...req('name', s(d, 'name'), 'Bitte gib den Empfänger an.')];
      issues.push(...lengthIssue('name', s(d, 'name'), 70, 'Der Empfängername'));
      const iban = s(d, 'iban');
      if (!iban) issues.push({ field: 'iban', level: 'error', message: 'Bitte gib die IBAN ein.' });
      else if (!ibanValid(iban)) issues.push({ field: 'iban', level: 'error', message: 'Diese IBAN ist ungültig. Prüfe Länderkennung, Länge und Prüfziffer.' });
      const bic = s(d, 'bic').replace(/\s/g, '');
      if (bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(bic)) issues.push({ field: 'bic', level: 'error', message: 'Eine BIC hat 8 oder 11 Zeichen, z. B. COBADEFFXXX.' });
      const amt = s(d, 'amount');
      if (amt) {
        const n = parseAmount(amt);
        if (n === null) issues.push({ field: 'amount', level: 'error', message: 'Betrag eindeutig angeben, z. B. 49,90 oder 1.249,90 (Tausender als 1000 oder 1.000,00).' });
        else if (n < 0.01 || n > 999999999.99) issues.push({ field: 'amount', level: 'error', message: 'Der Betrag muss zwischen 0,01 und 999.999.999,99 Euro liegen.' });
      }
      issues.push(...lengthIssue('remittance', s(d, 'remittance'), 140, 'Der Verwendungszweck'));
      if (s(d, 'reference') && !rfReferenceValid(s(d, 'reference'))) issues.push({ field: 'reference', level: 'error', message: 'Die RF-Referenz ist ungültig (Prüfziffer stimmt nicht).' });
      if (s(d, 'reference') && s(d, 'remittance')) issues.push({ field: 'remittance', level: 'warning', message: 'Mit RF-Referenz wird der Verwendungszweck nicht übertragen.' });
      if (s(d, 'purpose') && !/^[A-Z]{4}$/i.test(s(d, 'purpose'))) issues.push({ field: 'purpose', level: 'error', message: 'Zweckcodes bestehen aus vier Buchstaben, z. B. GDDS.' });
      issues.push(...lengthIssue('info', s(d, 'info'), 70, 'Der Hinweis'));
      const bytes = new TextEncoder().encode(encodeEpc(d)).length;
      if (bytes > 331) issues.push({ level: 'error', message: `GiroCodes dürfen höchstens 331 Byte enthalten (aktuell ${bytes}). Kürze Verwendungszweck oder Hinweis.` });
      return issues;
    },
    encode: (d) => encodeEpc(d),
    summary: (d) => [s(d, 'name'), s(d, 'amount') && `${s(d, 'amount')} €`].filter(Boolean).join(' – '),
  },
  {
    id: 'paypal',
    label: 'PayPal',
    description: 'Öffnet PayPal.Me mit einem vorbelegten Betrag.',
    category: 'payment',
    icon: 'paypal',
    keywords: ['paypal', 'zahlung', 'spende', 'bezahlen'],
    dynamic: 'redirect',
    fields: [
      { key: 'user', label: 'PayPal.Me-Name', kind: 'text', required: true, placeholder: 'meinname' },
      { key: 'amount', label: 'Betrag', kind: 'number', half: true, placeholder: '10' },
      { key: 'currency', label: 'Währung', kind: 'select', half: true, options: [{ value: 'EUR', label: 'Euro' }, { value: 'USD', label: 'US-Dollar' }, { value: 'CHF', label: 'Franken' }, { value: 'GBP', label: 'Pfund' }] },
    ],
    defaults: { currency: 'EUR' },
    example: { user: 'tessera', amount: '10', currency: 'EUR' },
    validate: (d) => {
      const issues = req('user', s(d, 'user'), 'Bitte gib deinen PayPal.Me-Namen ein.');
      if (s(d, 'user') && !/^[A-Za-z0-9]{1,20}$/.test(s(d, 'user').replace(/^https?:\/\/(www\.)?paypal\.me\//i, ''))) {
        issues.push({ field: 'user', level: 'error', message: 'PayPal.Me-Namen bestehen aus bis zu 20 Buchstaben und Ziffern.' });
      }
      if (s(d, 'amount') && parseAmount(s(d, 'amount')) === null) issues.push({ field: 'amount', level: 'error', message: 'Betrag bitte als Zahl mit höchstens zwei Nachkommastellen, z. B. 10 oder 9,50' });
      return issues;
    },
    encode: (d) => {
      const u = s(d, 'user').replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/\/.*$/, '');
      const a = s(d, 'amount') ? parseAmount(s(d, 'amount')) : null;
      return `https://paypal.me/${u}${a ? `/${a.toFixed(2).replace(/\.00$/, '')}${s(d, 'currency') || 'EUR'}` : ''}`;
    },
    summary: (d) => `paypal.me/${s(d, 'user')}`,
  },
  {
    id: 'bitcoin',
    label: 'Bitcoin',
    description: 'Zahlungsanforderung nach BIP 21.',
    category: 'payment',
    icon: 'bitcoin',
    keywords: ['bitcoin', 'btc', 'krypto', 'crypto', 'wallet'],
    fields: [
      { key: 'address', label: 'Bitcoin-Adresse', kind: 'text', required: true, placeholder: 'bc1q…' },
      { key: 'amount', label: 'Betrag in BTC', kind: 'number', half: true, placeholder: '0.001' },
      { key: 'label', label: 'Empfänger', kind: 'text', half: true },
      { key: 'message', label: 'Nachricht', kind: 'text', advanced: true },
    ],
    defaults: {},
    example: { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' },
    validate: (d) => {
      const a = s(d, 'address');
      const issues = req('address', a, 'Bitte gib die Bitcoin-Adresse ein.');
      if (a && !/^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|tb1[ac-hj-np-z02-9]{11,71})$/i.test(a)) {
        issues.push({ field: 'address', level: 'error', message: 'Das ist keine gültige Bitcoin-Adresse.' });
      }
      if (s(d, 'amount') && !/^\d+([.,]\d{1,8})?$/.test(s(d, 'amount'))) issues.push({ field: 'amount', level: 'error', message: 'Betrag mit höchstens acht Nachkommastellen, z. B. 0.0015' });
      return issues;
    },
    encode: (d) => {
      const q: string[] = [];
      if (s(d, 'amount')) q.push('amount=' + s(d, 'amount').replace(',', '.'));
      if (s(d, 'label')) q.push('label=' + encodeURIComponent(s(d, 'label')));
      if (s(d, 'message')) q.push('message=' + encodeURIComponent(s(d, 'message')));
      return `bitcoin:${s(d, 'address')}${q.length ? '?' + q.join('&') : ''}`;
    },
    summary: (d) => s(d, 'address').slice(0, 14) + '…',
  },
  {
    id: 'raw',
    label: 'Eigene Daten',
    description: 'Beliebiger Inhalt, exakt so kodiert wie eingegeben.',
    category: 'data',
    icon: 'ticket',
    keywords: ['raw', 'roh', 'daten', 'eigene', 'custom', 'inventar', 'seriennummer', 'id', 'code'],
    fields: [
      { key: 'data', label: 'Inhalt', kind: 'textarea', required: true, placeholder: 'INV-2026-000123' },
      { key: 'escapes', label: 'Escape-Sequenzen auswerten (\\n, \\t, \\x1D)', kind: 'toggle', advanced: true,
        help: 'Für GS1-Daten, Lagerverwaltung und Maschinencodes, die Steuerzeichen erwarten.' },
    ],
    defaults: { escapes: false },
    example: { data: 'INV-2026-000123' },
    validate: (d) => (typeof d.data === 'string' && d.data.length ? [] : [{ field: 'data', level: 'error', message: 'Bitte gib den Inhalt ein.' }]),
    encode: (d) => {
      const v = typeof d.data === 'string' ? d.data : '';
      if (!b(d, 'escapes')) return v;
      return v.replace(/\\(n|r|t|\\|x([0-9a-fA-F]{2}))/g, (_m, c: string, hex?: string) =>
        hex ? String.fromCharCode(parseInt(hex, 16)) : c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : '\\');
    },
    summary: (d) => (typeof d.data === 'string' ? d.data.slice(0, 80) : ''),
  },
];

/**
 * Liest Geldbeträge eindeutig: Komma ist Dezimaltrennzeichen (1.234,50), bei Punkt und Komma
 * gilt das letzte Zeichen als Dezimaltrennzeichen (1,234.50). Mehr als zwei Nachkommastellen
 * sind ein Fehler statt einer stillen Umdeutung (12,345 wäre sonst 12.345 €).
 */
export function parseAmount(v: string): number | null {
  const t = v.trim().replace(/\s|€|EUR|USD|CHF|GBP/gi, '');
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  const decSep = lastComma > lastDot ? ',' : lastDot > lastComma && (t.match(/\./g) ?? []).length === 1 && lastComma < 0 ? '.' : lastDot > lastComma && lastComma >= 0 ? '.' : null;
  let intPart = t;
  let frac = '';
  if (decSep) {
    const i = t.lastIndexOf(decSep);
    intPart = t.slice(0, i);
    frac = t.slice(i + 1);
  }
  const thousands = decSep === ',' ? '.' : ',';
  // Tausendertrennzeichen nur in korrekten Dreiergruppen
  if (intPart.includes(thousands)) {
    if (!new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+$`).test(intPart)) return null;
    intPart = intPart.split(thousands).join('');
  }
  if (/[.,]/.test(intPart) || !/^\d+$/.test(intPart || '0')) return null;
  if (!/^\d{0,2}$/.test(frac)) return null;
  return Number(`${intPart || '0'}.${frac || '0'}`);
}

function encodeEpc(d: ContentData): string {
  const amt = s(d, 'amount') ? parseAmount(s(d, 'amount')) : null;
  const ref = s(d, 'reference').replace(/\s+/g, '').toUpperCase();
  const lines = [
    'BCD', '002', '1', 'SCT',
    s(d, 'bic').replace(/\s+/g, '').toUpperCase(),
    s(d, 'name').slice(0, 70),
    normalizeIban(s(d, 'iban')),
    amt !== null ? `EUR${amt.toFixed(2)}` : '',
    s(d, 'purpose').toUpperCase(),
    ref,
    ref ? '' : s(d, 'remittance'),
    s(d, 'info'),
  ];
  while (lines.length > 7 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export const TYPE_MAP: Record<string, ContentTypeDef> = Object.fromEntries(CONTENT_TYPES.map((t) => [t.id, t]));

export function getType(id: string): ContentTypeDef {
  return TYPE_MAP[id] ?? TYPE_MAP.url;
}

/** Felder mit sensiblen Inhalten eines Typs. */
export function sensitiveKeys(typeId: string): string[] {
  return getType(typeId).fields.filter((f) => f.sensitive).map((f) => f.key);
}

/** Entfernt Felder, die zum Typ nicht passen, und begrenzt Längen. */
export function sanitizeContent(typeId: string, d: ContentData): ContentData {
  const t = getType(typeId);
  const out: ContentData = {};
  for (const f of t.fields) {
    const v = d[f.key];
    if (v === undefined || v === null) continue;
    if (f.kind === 'toggle') out[f.key] = v === true || v === 'true';
    else out[f.key] = String(v).slice(0, 4000);
  }
  return out;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

/** Wandelt Inhalt in den QR-Text um; null, wenn der Inhalt Fehler enthält. */
export function encodeContent(typeId: string, d: ContentData): { payload: string | null; issues: Issue[] } {
  const t = getType(typeId);
  const issues = t.validate(d);
  if (hasErrors(issues)) return { payload: null, issues };
  return { payload: t.encode(d), issues };
}
