// Gestaltete Codes werden gerendert wie beim Export und mit zwei Decodern gelesen.
import { describe, expect, it } from 'vitest';
import { roundtrip } from './helpers';
import { CONTENT_TYPES, encodeContent } from '../../src/shared/content';
import { applyPreset, BODY_SHAPES, DEFAULT_DESIGN, EYE_BALLS, EYE_FRAMES, FRAME_STYLES, sanitizeDesign, STYLE_PRESETS } from '../../src/shared/design';
import { analyzeDesign, overallStatus } from '../../src/shared/analyze';
import { CapacityError, renderSvg } from '../../src/shared/render';
import { verifyDesign } from '../../src/server/verify';

const URL_PAYLOAD = 'https://tessera.example/r/Ab3dEf9';

describe('Jeder Inhaltstyp ist mit beiden Decodern lesbar', () => {
  for (const t of CONTENT_TYPES) {
    it(t.id, async () => {
      const payload = encodeContent(t.id, { ...t.defaults, ...t.example }).payload!;
      const r = await roundtrip(payload, DEFAULT_DESIGN, t.minEc);
      expect(r.zxing).toBe(payload);
      expect(r.jsqr).toBe(payload);
    });
  }
});

describe('Alle Formen, Augen und Rahmen bleiben für ZXing lesbar', () => {
  const variants = [
    ...BODY_SHAPES.map((b) => ({ body: { shape: b.id, size: 1 } })),
    ...EYE_FRAMES.flatMap((f) => EYE_BALLS.map((b) => ({ eyes: { frame: f.id, ball: b.id } }))),
    ...FRAME_STYLES.map((f) => ({ frame: { style: f.id, text: 'Scan mich', color: '#2234d6', textColor: '#ffffff' } })),
    { logo: { kind: 'icon', icon: 'wifi', size: 0.3 } },
    { logo: { kind: 'icon', icon: 'instagram', size: 0.3, shape: 'circle' } },
    { fg: { type: 'radial', colors: ['#5b21b6', '#1e1b4b'] }, body: { shape: 'dots', size: 0.9 } },
  ];
  for (const v of variants) {
    it(JSON.stringify(v), async () => {
      expect((await roundtrip(URL_PAYLOAD, sanitizeDesign(v))).zxing).toBe(URL_PAYLOAD);
    });
  }
});

describe('Kuratierte Stile', () => {
  for (const p of STYLE_PRESETS) {
    it(`${p.name} besteht die Scan-Prüfung`, async () => {
      const r = await verifyDesign(URL_PAYLOAD, applyPreset(DEFAULT_DESIGN, p));
      expect(r.grade).toBe('good');
    });
  }
});

describe('Schutzmechanismen', () => {
  it('erkennt zu geringen Kontrast', () => {
    const d = sanitizeDesign({ fg: { type: 'solid', color: '#bbbbbb' } });
    const checks = analyzeDesign(d, renderSvg(URL_PAYLOAD, d).meta);
    expect(checks.find((c) => c.id === 'contrast')!.status).toBe('fail');
    expect(overallStatus(checks)).toBe('fail');
  });
  it('erkennt ein zu großes Logo bei schwacher Fehlerkorrektur und schlägt eine Lösung vor', () => {
    const d = sanitizeDesign({ ec: 'L', logo: { kind: 'icon', icon: 'wifi', size: 0.3 } });
    const checks = analyzeDesign(d, renderSvg(URL_PAYLOAD, d).meta);
    const logo = checks.find((c) => c.id === 'logo')!;
    expect(logo.status).toBe('fail');
    const fixed = logo.fix!.patch(d);
    expect(fixed.ec).toBe('M');
  });
  it('die Dekodierprüfung erkennt unlesbare Codes', async () => {
    const r = await verifyDesign(URL_PAYLOAD, sanitizeDesign({ ec: 'L', logo: { kind: 'icon', icon: 'wifi', size: 0.32, excavate: true } }));
    expect(r.grade).toBe('fail');
  });
  it('Automatik wählt Fehlerkorrektur H mit Logo und respektiert die Mindeststufe', () => {
    expect(renderSvg(URL_PAYLOAD, sanitizeDesign({ logo: { kind: 'icon', icon: 'wifi' } })).meta.ec).toBe('H');
    expect(renderSvg(URL_PAYLOAD, sanitizeDesign({ ec: 'L' }), { minEc: 'M' }).meta.ec).toBe('M');
  });
  it('meldet zu große Datenmengen verständlich', () => {
    expect(() => renderSvg('x'.repeat(3500), sanitizeDesign({ ec: 'H' }))).toThrow(CapacityError);
  });
  it('bereinigt fremde Designdaten', () => {
    const d = sanitizeDesign({ margin: 99, fg: { type: 'solid', color: 'red;}' }, logo: { kind: 'image', image: 'javascript:alert(1)' }, frame: { text: '<script>' } });
    expect(d.margin).toBe(10);
    expect(d.fg).toEqual({ type: 'solid', color: '#000000' });
    expect(d.logo.image).toBeNull();
    expect(renderSvg(URL_PAYLOAD, { ...d, frame: { ...d.frame, style: 'caption' } }).svg).not.toContain('<script>');
  });
});

describe('Beschriftung', () => {
  it('erzeugt gültige Pfade für alle Schriften und Zeichen (Regression: NaN in Pfaddaten)', async () => {
    const { textPath } = await import('../../src/shared/text');
    for (const font of ['bricolage', 'instrument', 'fraunces', 'mono'] as const) {
      for (const t of ['INV-2026-0021', 'Scan mich – Größe ÄÖÜ ß €', '0123456789 @#&?!']) {
        const d = textPath(t, font, 17.3, 123.45, 67.8).d!;
        expect(d, `${font}: ${t}`).not.toMatch(/NaN|Infinity|undefined/);
        expect(d).toMatch(/^M/);
      }
    }
  });
});
