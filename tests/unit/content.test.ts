// Standardkonforme Kodierung der Inhaltstypen.
import { describe, expect, it } from 'vitest';
import { CONTENT_TYPES, encodeContent, getType, ibanValid, parseAmount, rfReferenceValid, wallTimeToUtc } from '../../src/shared/content';

const enc = (type: string, d: Record<string, string | boolean>) => {
  const r = encodeContent(type, { ...getType(type).defaults, ...d });
  if (!r.payload) throw new Error(JSON.stringify(r.issues));
  return r.payload;
};
const BS = '\\';

describe('WLAN (ZXing-WIFI-Format)', () => {
  it('maskiert Sonderzeichen in SSID und Passwort', () => {
    expect(enc('wifi', { ssid: 'Büro;Gast', password: `a:b,c"d${BS}e;f12`, security: 'WPA' }))
      .toBe(`WIFI:T:WPA;S:Büro${BS};Gast;P:a${BS}:b${BS},c${BS}"d${BS}${BS}e${BS};f12;;`);
  });
  it('lässt das Passwort bei offenen Netzen weg und kennzeichnet versteckte Netze', () => {
    expect(enc('wifi', { ssid: 'Offen', security: 'nopass', password: 'egal', hidden: true })).toBe('WIFI:T:nopass;S:Offen;H:true;;');
  });
  it('prüft die WPA-Passwortlänge', () => {
    const r = encodeContent('wifi', { ssid: 'x', security: 'WPA', password: 'kurz' });
    expect(r.payload).toBeNull();
    expect(r.issues[0].field).toBe('password');
  });
});

describe('vCard / MECARD', () => {
  it('erzeugt vCard 3.0 mit RFC-6350-Maskierung und CRLF', () => {
    const v = enc('vcard', { firstName: 'Erika', lastName: 'Muster; Frau', org: 'A, B', mobile: '+49 171 123 45', email: 'e@x.de', note: 'Zeile1\nZeile2' });
    expect(v.split('\r\n')).toEqual([
      'BEGIN:VCARD', 'VERSION:3.0', `N:Muster${BS}; Frau;Erika;;;`, `FN:Erika Muster${BS}; Frau`, `ORG:A${BS}, B`,
      'TEL;TYPE=CELL:+4917112345', 'EMAIL;TYPE=INTERNET:e@x.de', `NOTE:Zeile1${BS}nZeile2`, 'END:VCARD',
    ]);
  });
  it('erzeugt MECARD kompakt', () => {
    expect(enc('vcard', { format: 'mecard', firstName: 'Max', lastName: 'Muster', mobile: '0171 1', email: 'm@x.de' }))
      .toBe('MECARD:N:Muster,Max;TEL:01711;EMAIL:m@x.de;;');
  });
  it('verlangt einen Namen oder eine Firma', () => {
    expect(encodeContent('vcard', { format: 'vcard3' }).payload).toBeNull();
  });
});

describe('GiroCode (EPC069-12, Version 002)', () => {
  it('erzeugt die vorgeschriebene Zeilenstruktur', () => {
    expect(enc('epc', { name: 'Musterfirma GmbH', iban: 'de89 3704 0044 0532 0130 00', amount: '1.234,50', remittance: 'Rechnung 42' }))
      .toBe('BCD\n002\n1\nSCT\n\nMusterfirma GmbH\nDE89370400440532013000\nEUR1234.50\n\n\nRechnung 42');
  });
  it('lehnt ungültige IBANs ab', () => {
    expect(ibanValid('DE89370400440532013001')).toBe(false);
    expect(ibanValid('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(encodeContent('epc', { name: 'X', iban: 'DE00123' }).payload).toBeNull();
  });
  it('prüft RF-Referenzen nach ISO 11649', () => {
    expect(rfReferenceValid('RF18 5390 0754 7034')).toBe(true);
    expect(rfReferenceValid('RF19 5390 0754 7034')).toBe(false);
  });
  it('begrenzt Betrag und Länge', () => {
    expect(parseAmount('49,9')).toBe(49.9);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('12,345')).toBeNull(); // mehrdeutig: nicht still als 12.345 € deuten
    expect(parseAmount('0,001')).toBeNull();
    expect(parseAmount('1.234.567,89')).toBe(1234567.89);
    expect(encodeContent('epc', { name: 'X', iban: 'DE89370400440532013000', amount: '0' }).payload).toBeNull();
    expect(encodeContent('epc', { name: 'X', iban: 'DE89370400440532013000', remittance: 'x'.repeat(141) }).payload).toBeNull();
  });
});

describe('E-Mail, SMS, Telefon, WhatsApp', () => {
  it('kodiert mailto nach RFC 6068', () => {
    expect(enc('email', { to: 'a@b.de', subject: 'Grüße & mehr', body: 'Hallo\nWelt' }))
      .toBe('mailto:a@b.de?subject=Gr%C3%BC%C3%9Fe%20%26%20mehr&body=Hallo%0D%0AWelt');
  });
  it('kodiert SMS in beiden Formaten', () => {
    expect(enc('sms', { phone: '+49 171 / 123', message: 'Hi' })).toBe('SMSTO:+49171123:Hi');
    expect(enc('sms', { phone: '+49171123', message: 'Hi du', format: 'uri' })).toBe('sms:+49171123?body=Hi%20du');
  });
  it('kodiert Telefonnummern ohne Formatierung', () => {
    expect(enc('phone', { phone: '+49 (30) 123-456' })).toBe('tel:+4930123456');
    expect(enc('phone', { phone: '+49 (0) 30 123-456' })).toBe('tel:+4930123456');
  });
  it('verlangt bei WhatsApp die Ländervorwahl', () => {
    expect(encodeContent('whatsapp', { phone: '0171 123456' }).payload).toBeNull();
    expect(enc('whatsapp', { phone: '+49 171 123456', message: 'Hallo!' })).toBe('https://wa.me/49171123456?text=Hallo!');
  });
});

describe('Termin (iCalendar VEVENT)', () => {
  it('rechnet Ortszeit korrekt in UTC um, auch bei Sommerzeit', () => {
    expect(wallTimeToUtc('2026-07-01T10:00', 'Europe/Berlin')!.toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(wallTimeToUtc('2026-12-01T10:00', 'Europe/Berlin')!.toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
  it('erzeugt VEVENT mit UTC-Zeiten', () => {
    const v = enc('event', { title: 'Sommerfest; Team', start: '2026-07-01T18:00', end: '2026-07-01T23:00', location: 'Hof', tz: 'Europe/Berlin' });
    expect(v).toBe(`BEGIN:VEVENT\r\nSUMMARY:Sommerfest${BS}; Team\r\nDTSTART:20260701T160000Z\r\nDTEND:20260701T210000Z\r\nLOCATION:Hof\r\nEND:VEVENT`);
  });
  it('erzeugt ganztägige Termine mit exklusivem Enddatum', () => {
    expect(enc('event', { title: 'Messe', allDay: true, start: '2026-03-10T00:00', end: '2026-03-12T00:00' }))
      .toContain('DTSTART;VALUE=DATE:20260310\r\nDTEND;VALUE=DATE:20260313');
  });
  it('erkennt ein Ende vor dem Beginn', () => {
    expect(encodeContent('event', { title: 'x', start: '2026-01-02T10:00', end: '2026-01-01T10:00' }).payload).toBeNull();
  });
});

describe('Links', () => {
  it('ergänzt https und hängt UTM-Parameter an', () => {
    expect(enc('url', { url: 'beispiel.de/a?x=1', utmSource: 'flyer', utmCampaign: 'herbst' }))
      .toBe('https://beispiel.de/a?x=1&utm_source=flyer&utm_campaign=herbst');
  });
  it('baut Social-Media-Profile', () => {
    expect(enc('social', { platform: 'instagram', handle: '@tessera' })).toBe('https://instagram.com/tessera');
    expect(enc('social', { platform: 'mastodon', handle: '@max@chaos.social' })).toBe('https://chaos.social/@max');
    expect(enc('social', { platform: 'linkedin', handle: 'https://www.linkedin.com/in/erika' })).toBe('https://www.linkedin.com/in/erika');
  });
  it('baut Karten-Links', () => {
    expect(enc('geo', { mode: 'coords', lat: '52,5163', lon: '13.3777', target: 'geo', label: 'Tor' })).toBe('geo:52.5163,13.3777?q=52.5163,13.3777(Tor)');
    expect(enc('geo', { mode: 'address', address: 'Pariser Platz 1\n10117 Berlin', target: 'google' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Pariser%20Platz%201%2C%2010117%20Berlin');
  });
  it('lehnt Nicht-Webadressen ab', () => {
    expect(encodeContent('url', { url: 'javascript:alert(1)' }).payload).toBeNull();
  });
});

describe('Alle Typen', () => {
  it('kodieren ihre Beispielwerte fehlerfrei', () => {
    for (const t of CONTENT_TYPES) {
      const r = encodeContent(t.id, { ...t.defaults, ...t.example });
      expect(r.payload, t.id).toBeTruthy();
    }
  });
  it('werten Escape-Sequenzen in eigenen Daten aus', () => {
    expect(enc('raw', { data: `01${BS}x1D10ABC${BS}n`, escapes: true })).toBe('01\x1D10ABC\n');
  });
});
