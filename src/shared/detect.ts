// Erkennt aus eingefügtem Text oder einem gescannten Code den passenden Inhaltstyp
// und füllt die Felder vor. Wird von der Schnelleingabe und vom Scanner verwendet.
import { ibanValid, normalizeIban, SOCIAL_PLATFORMS, type ContentData } from './content';

export interface Detection {
  type: string;
  content: ContentData;
  /** Kurze Begründung für die Oberfläche */
  reason: string;
}

function unescapeMe(v: string): string {
  return v.replace(/\\([\\;,:"])/g, '$1');
}

/** Zerlegt WIFI:/MECARD:-Strukturen in Schlüssel/Wert-Paare (mit Maskierung). */
function parseMeLike(body: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let key = '';
  let val = '';
  let inKey = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      (inKey ? (key += body[++i]) : (val += ch + body[++i]));
      continue;
    }
    if (inKey && ch === ':') { inKey = false; continue; }
    if (!inKey && ch === ';') {
      if (key) (out[key.toUpperCase()] ??= []).push(unescapeMe(val));
      key = ''; val = ''; inKey = true;
      continue;
    }
    if (inKey) key += ch; else val += ch;
  }
  if (key && !inKey) (out[key.toUpperCase()] ??= []).push(unescapeMe(val));
  return out;
}

const unescapeVcf = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseVcard(text: string): ContentData {
  const lines = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  const d: ContentData = { format: /VERSION:4/i.test(text) ? 'vcard4' : 'vcard3' };
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx).toUpperCase();
    const value = line.slice(idx + 1);
    const name = head.split(';')[0];
    if (name === 'N') {
      const [last, first] = value.split(/(?<!\\);/).map(unescapeVcf);
      d.lastName = last ?? ''; d.firstName = first ?? '';
    } else if (name === 'FN' && !d.lastName && !d.firstName) {
      const parts = unescapeVcf(value).split(' ');
      d.lastName = parts.pop() ?? ''; d.firstName = parts.join(' ');
    } else if (name === 'ORG') {
      const [org, dep] = value.split(/(?<!\\);/).map(unescapeVcf);
      d.org = org ?? ''; if (dep) d.department = dep;
    } else if (name === 'TITLE') d.title = unescapeVcf(value);
    else if (name === 'TEL') {
      const num = value.replace(/^tel:/i, '');
      if (/FAX/.test(head)) d.fax = num;
      else if (/CELL/.test(head) && !d.mobile) d.mobile = num;
      else if (!d.phone) d.phone = num;
      else if (!d.mobile) d.mobile = num;
    } else if (name === 'EMAIL' && !d.email) d.email = value;
    else if (name === 'URL' && !d.website) d.website = value;
    else if (name === 'ADR') {
      const p = value.split(/(?<!\\);/).map(unescapeVcf);
      d.street = p[2] ?? ''; d.city = p[3] ?? ''; d.zip = p[5] ?? ''; d.country = p[6] ?? '';
    } else if (name === 'NOTE') d.note = unescapeVcf(value);
  }
  return d;
}

function icsToLocal(v: string, allDay: boolean): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v);
  if (!m) return '';
  if (allDay || !m[4]) return `${m[1]}-${m[2]}-${m[3]}T00:00`;
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

function parseEvent(text: string): ContentData {
  const d: ContentData = {};
  const lines = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx).toUpperCase();
    const value = line.slice(idx + 1);
    const name = head.split(';')[0];
    const allDay = /VALUE=DATE(?!-)/.test(head);
    if (name === 'SUMMARY') d.title = unescapeVcf(value);
    else if (name === 'LOCATION') d.location = unescapeVcf(value);
    else if (name === 'DESCRIPTION') d.description = unescapeVcf(value);
    else if (name === 'URL') d.url = value;
    else if (name === 'DTSTART') { d.start = icsToLocal(value, allDay); if (allDay) d.allDay = true; }
    else if (name === 'DTEND') {
      d.end = icsToLocal(value, allDay);
      if (allDay && typeof d.end === 'string') {
        const e = new Date(d.end.slice(0, 10) + 'T00:00:00Z');
        e.setUTCDate(e.getUTCDate() - 1);
        d.end = e.toISOString().slice(0, 10) + 'T00:00';
      }
    }
  }
  if (typeof Intl !== 'undefined') d.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  return d;
}

/** Koordinaten aus Karten-Links (Google, Apple, OSM) und geo:-URIs. */
export function coordsFromText(t: string): { lat: string; lon: string } | null {
  const pats = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|sll)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
    /mlat=(-?\d{1,2}\.\d+)&mlon=(-?\d{1,3}\.\d+)/,
    /#map=\d+\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/,
    /^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i,
    /^\s*(-?\d{1,2}\.\d{3,})\s*[,; ]\s*(-?\d{1,3}\.\d{3,})\s*$/,
  ];
  for (const p of pats) {
    const m = p.exec(t);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: m[1], lon: m[2] };
  }
  return null;
}

export function detectContent(input: string): Detection {
  const raw = input.replace(/^﻿/, '');
  const t = raw.trim();
  if (!t) return { type: 'url', content: {}, reason: '' };
  const upper = t.toUpperCase();

  if (upper.startsWith('WIFI:')) {
    const p = parseMeLike(t.slice(5));
    const sec = (p.T?.[0] ?? 'WPA').toUpperCase();
    return {
      type: 'wifi',
      reason: 'WLAN-Zugangsdaten erkannt',
      content: {
        ssid: p.S?.[0] ?? '', password: p.P?.[0] ?? '',
        security: sec === 'NOPASS' || sec === '' ? 'nopass' : sec === 'WEP' ? 'WEP' : sec.includes('EAP') ? 'WPA2-EAP' : 'WPA',
        hidden: (p.H?.[0] ?? '').toLowerCase() === 'true', eapMethod: p.E?.[0] ?? 'PEAP', identity: p.I?.[0] ?? '',
      },
    };
  }
  if (upper.startsWith('BEGIN:VCARD')) return { type: 'vcard', content: parseVcard(t), reason: 'Visitenkarte (vCard) erkannt' };
  if (upper.startsWith('MECARD:')) {
    const p = parseMeLike(t.slice(7));
    const [last, first] = (p.N?.[0] ?? '').split(',');
    return {
      type: 'vcard', reason: 'Visitenkarte (MECARD) erkannt',
      content: { format: 'mecard', lastName: last ?? '', firstName: first ?? '', org: p.ORG?.[0] ?? '', mobile: p.TEL?.[0] ?? '', phone: p.TEL?.[1] ?? '', email: p.EMAIL?.[0] ?? '', website: p.URL?.[0] ?? '', note: p.NOTE?.[0] ?? '' },
    };
  }
  if (upper.startsWith('BEGIN:VEVENT') || upper.startsWith('BEGIN:VCALENDAR')) return { type: 'event', content: parseEvent(t), reason: 'Termin erkannt' };
  if (/^BCD\r?\n/.test(t)) {
    const l = t.split(/\r?\n/);
    const amount = (l[7] ?? '').replace(/^EUR/, '');
    return {
      type: 'epc', reason: 'GiroCode erkannt',
      content: { bic: l[4] ?? '', name: l[5] ?? '', iban: l[6] ?? '', amount: amount ? amount.replace('.', ',') : '', purpose: l[8] ?? '', reference: l[9] ?? '', remittance: l[10] ?? '', info: l[11] ?? '' },
    };
  }
  if (/^mailto:/i.test(t)) {
    const [addr, query = ''] = t.slice(7).split('?');
    const q = new URLSearchParams(query);
    return { type: 'email', reason: 'E-Mail-Link erkannt', content: { to: decodeURIComponent(addr), subject: q.get('subject') ?? '', body: q.get('body') ?? '', cc: q.get('cc') ?? '', format: 'mailto' } };
  }
  if (/^MATMSG:/i.test(t)) {
    const p = parseMeLike(t.slice(7));
    return { type: 'email', reason: 'E-Mail erkannt', content: { to: p.TO?.[0] ?? '', subject: p.SUB?.[0] ?? '', body: p.BODY?.[0] ?? '', format: 'matmsg' } };
  }
  if (/^SMSTO:/i.test(t)) {
    const [, num, ...msg] = t.split(':');
    return { type: 'sms', reason: 'SMS erkannt', content: { phone: num ?? '', message: msg.join(':'), format: 'smsto' } };
  }
  if (/^sms:/i.test(t)) {
    const [num, query = ''] = t.slice(4).split('?');
    return { type: 'sms', reason: 'SMS erkannt', content: { phone: num, message: new URLSearchParams(query).get('body') ?? '', format: 'uri' } };
  }
  if (/^tel:/i.test(t)) return { type: 'phone', reason: 'Telefonnummer erkannt', content: { phone: t.slice(4) } };
  if (/^bitcoin:/i.test(t)) {
    const [addr, query = ''] = t.slice(8).split('?');
    const q = new URLSearchParams(query);
    return { type: 'bitcoin', reason: 'Bitcoin-Zahlung erkannt', content: { address: addr, amount: q.get('amount') ?? '', label: q.get('label') ?? '', message: q.get('message') ?? '' } };
  }
  if (/^geo:/i.test(t)) {
    const c = coordsFromText(t);
    if (c) return { type: 'geo', reason: 'Standort erkannt', content: { mode: 'coords', ...c, target: 'geo' } };
  }

  // Einzeilige Eingaben
  if (!/\n/.test(t)) {
    if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]{2,}$/.test(t)) return { type: 'email', reason: 'E-Mail-Adresse erkannt', content: { to: t, format: 'mailto' } };
    if (/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/i.test(t) && ibanValid(t)) return { type: 'epc', reason: 'IBAN erkannt', content: { iban: normalizeIban(t) } };
    if (/^\+?[\d\s()\/.-]{6,20}$/.test(t) && t.replace(/\D/g, '').length >= 6) return { type: 'phone', reason: 'Telefonnummer erkannt', content: { phone: t } };
    const coords = coordsFromText(t);
    const looksUrl = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t) || /^https?:\/\/\S+$/i.test(t);
    if (looksUrl) {
      const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      let u: URL | null = null;
      try { u = new URL(url); } catch { /* keine URL */ }
      if (u) {
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (coords && /google\.|maps\.apple|openstreetmap/.test(host)) return { type: 'geo', reason: 'Kartenlink erkannt', content: { mode: 'coords', ...coords, target: host.includes('apple') ? 'apple' : host.includes('openstreetmap') ? 'osm' : 'google' } };
        if (host === 'wa.me' || host === 'api.whatsapp.com') {
          const phone = u.pathname.replace(/\D/g, '') || u.searchParams.get('phone') || '';
          return { type: 'whatsapp', reason: 'WhatsApp-Link erkannt', content: { phone: phone ? `+${phone}` : '', message: u.searchParams.get('text') ?? '' } };
        }
        if (host === 'apps.apple.com' || host === 'itunes.apple.com') return { type: 'appstore', reason: 'App-Store-Link erkannt', content: { ios: url, primary: 'ios' } };
        if (host === 'play.google.com') return { type: 'appstore', reason: 'Google-Play-Link erkannt', content: { android: url, primary: 'android' } };
        if (host === 'paypal.me') return { type: 'paypal', reason: 'PayPal.Me-Link erkannt', content: { user: u.pathname.split('/')[1] ?? '', amount: (u.pathname.split('/')[2] ?? '').replace(/[A-Z]{3}$/, ''), currency: 'EUR' } };
        if (/(^|\.)calendly\.com$|(^|\.)cal\.com$|outlook\.office(365)?\.com$|doctolib\./.test(host) && (!host.includes('outlook') || u.pathname.toLowerCase().includes('bookings'))) {
          const provider = host.includes('calendly') ? 'calendly' : host.includes('cal.com') ? 'calcom' : host.includes('doctolib') ? 'doctolib' : 'msbookings';
          return { type: 'booking', reason: 'Buchungslink erkannt', content: { provider, url } };
        }
        const socialHosts: Record<string, string> = {
          'instagram.com': 'instagram', 'facebook.com': 'facebook', 'x.com': 'x', 'twitter.com': 'x', 'tiktok.com': 'tiktok',
          'youtube.com': 'youtube', 'github.com': 'github', 'xing.com': 'xing', 'threads.net': 'threads', 'bsky.app': 'bluesky',
          'pinterest.com': 'pinterest', 'twitch.tv': 'twitch', 't.me': 'telegram',
        };
        if (host === 'linkedin.com') return { type: 'social', reason: 'LinkedIn-Profil erkannt', content: { platform: u.pathname.startsWith('/company') ? 'linkedin-company' : 'linkedin', handle: url } };
        if (socialHosts[host] && u.pathname.length > 1) {
          const p = SOCIAL_PLATFORMS.find((x) => x.value === socialHosts[host]);
          return { type: 'social', reason: `${p?.label ?? 'Social-Media'}-Profil erkannt`, content: { platform: socialHosts[host], handle: url } };
        }
        if (/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(u.pathname)) return { type: 'document', reason: 'Dokumentlink erkannt', content: { source: 'link', url, title: decodeURIComponent(u.pathname.split('/').pop() ?? '') } };
        return { type: 'url', reason: 'Webadresse erkannt', content: { url } };
      }
    }
    if (coords) return { type: 'geo', reason: 'Koordinaten erkannt', content: { mode: 'coords', ...coords, target: 'google' } };
  }
  return { type: 'text', reason: 'Als Text übernommen', content: { text: raw } };
}
