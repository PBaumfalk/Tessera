// Erkennung eingefügter bzw. gescannter Inhalte und Rückweg kodieren → erkennen → kodieren.
import { describe, expect, it } from 'vitest';
import { detectContent } from '../../src/shared/detect';
import { encodeContent, getType } from '../../src/shared/content';

const cases: [string, Record<string, string | boolean>][] = [
  ['wifi', { ssid: 'Büro;Gast', password: 'p:w;\\x"12', security: 'WPA', hidden: true }],
  ['vcard', { firstName: 'Erika', lastName: 'Muster', org: 'Firma, Abteilung', mobile: '+4917112345', email: 'e@x.de', website: 'https://x.de', street: 'Weg 1', zip: '12345', city: 'Ort', country: 'DE', format: 'vcard3' }],
  ['epc', { name: 'Firma', iban: 'DE89370400440532013000', amount: '12,50', remittance: 'RE 1' }],
  ['email', { to: 'a@b.de', subject: 'Hallo Welt', body: 'Text & mehr' }],
  ['sms', { phone: '+49171', message: 'Hi: du' }],
  ['event', { title: 'Treffen', start: '2026-05-04T09:30', end: '2026-05-04T11:00', location: 'Raum 1', tz: 'UTC' }],
  ['bitcoin', { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: '0.01' }],
];

describe('Rückweg: kodieren → erkennen → kodieren ergibt denselben Inhalt', () => {
  for (const [type, data] of cases) {
    it(type, () => {
      const p1 = encodeContent(type, { ...getType(type).defaults, ...data }).payload!;
      const det = detectContent(p1);
      expect(det.type).toBe(type);
      const p2 = encodeContent(type, { ...getType(type).defaults, ...det.content }).payload;
      expect(p2).toBe(p1);
    });
  }
});

describe('Schnelleingabe', () => {
  it.each([
    ['www.beispiel.de/angebot', 'url'],
    ['https://instagram.com/tessera', 'social'],
    ['https://wa.me/49171123', 'whatsapp'],
    ['https://apps.apple.com/de/app/id123', 'appstore'],
    ['https://calendly.com/x/30min', 'booking'],
    ['https://www.google.com/maps/@52.5163,13.3777,17z', 'geo'],
    ['52.516300, 13.377700', 'geo'],
    ['DE89 3704 0044 0532 0130 00', 'epc'],
    ['kontakt@firma.de', 'email'],
    ['+49 30 1234567', 'phone'],
    ['https://firma.de/handbuch.pdf', 'document'],
    ['Einfach nur ein Satz.', 'text'],
  ])('%s → %s', (input, type) => {
    expect(detectContent(input).type).toBe(type);
  });
  it('übernimmt Koordinaten aus Kartenlinks', () => {
    expect(detectContent('https://www.openstreetmap.org/?mlat=48.1&mlon=11.5#map=17/48.1/11.5').content).toMatchObject({ lat: '48.1', lon: '11.5' });
  });
});
