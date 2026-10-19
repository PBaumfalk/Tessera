// Sofortprüfung der Lesbarkeit anhand von Regeln (läuft bei jeder Änderung im Browser).
// Die echte Dekodierprüfung erfolgt zusätzlich auf dem Server (src/server/verify.ts).
import { effectiveEc, type Background, type Design, type EcLevel, type Paint } from './design';
import type { RenderMeta } from './render';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: { label: string; patch: (d: Design) => Design };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function paintColors(p: Paint | Background): string[] {
  if (p.type === 'transparent') return [];
  return p.type === 'solid' ? [p.color] : [...p.colors];
}

/** Ungünstigstes Kontrastpaar aus allen Vordergrund- und Hintergrundfarben. */
export function worstContrast(d: Design): { ratio: number; inverted: boolean } {
  const fg = [...paintColors(d.fg), ...(d.eyes.frameColor ? [d.eyes.frameColor] : []), ...(d.eyes.ballColor ? [d.eyes.ballColor] : [])];
  const bg = d.bg.type === 'transparent' ? ['#ffffff'] : paintColors(d.bg);
  let ratio = Infinity;
  let inverted = false;
  for (const f of fg) for (const b of bg) {
    ratio = Math.min(ratio, contrastRatio(f, b));
    if (luminance(f) > luminance(b)) inverted = true;
  }
  return { ratio, inverted };
}

const EC_CAPACITY: Record<EcLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
const EC_NEXT: Record<EcLevel, EcLevel> = { L: 'M', M: 'Q', Q: 'H', H: 'H' };

export const fmtPct = (v: number) => `${Math.round(v * 100)} %`;

export function analyzeDesign(d: Design, meta: RenderMeta | null, opts: { minEc?: EcLevel; printMm?: number } = {}): Check[] {
  const checks: Check[] = [];
  const { ratio, inverted } = worstContrast(d);

  checks.push({
    id: 'contrast',
    label: 'Kontrast',
    status: ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'fail',
    detail: ratio >= 4.5
      ? `Deutlicher Unterschied zwischen Code und Hintergrund (${ratio.toFixed(1)} : 1).`
      : `Code und Hintergrund sind sich zu ähnlich (${ratio.toFixed(1)} : 1). Kameras brauchen mindestens 3 : 1, besser 4,5 : 1.`,
    fix: ratio < 4.5 ? {
      label: inverted ? 'Hellen Hintergrund verwenden' : 'Code dunkler färben',
      patch: (x) => (inverted
        ? { ...x, bg: { type: 'solid', color: '#ffffff' }, eyes: { ...x.eyes, frameColor: null, ballColor: null } }
        : { ...x, fg: { type: 'solid', color: '#000000' }, eyes: { ...x.eyes, frameColor: null, ballColor: null } }),
    } : undefined,
  });

  if (inverted) {
    checks.push({
      id: 'inverted',
      label: 'Helle Module',
      status: 'warn',
      detail: 'Heller Code auf dunklem Grund wird von aktuellen Smartphones gelesen, von manchen älteren Scannern aber nicht.',
      fix: { label: 'Farben tauschen', patch: (x) => ({ ...x, fg: x.bg.type === 'transparent' ? { type: 'solid', color: '#000000' } : x.bg, bg: x.fg, eyes: { ...x.eyes, frameColor: null, ballColor: null } }) },
    });
  }

  if (d.bg.type === 'transparent') {
    checks.push({
      id: 'transparent',
      label: 'Transparenter Hintergrund',
      status: 'warn',
      detail: 'Die Lesbarkeit hängt vom Untergrund ab. Drucke nur auf hellen, ruhigen Flächen.',
      fix: { label: 'Weißen Hintergrund verwenden', patch: (x) => ({ ...x, bg: { type: 'solid', color: '#ffffff' } }) },
    });
  }

  const m = d.margin;
  checks.push({
    id: 'quiet',
    label: 'Ruhezone',
    status: m >= 4 ? 'ok' : m >= 2 ? 'warn' : 'fail',
    detail: m >= 4
      ? 'Genug freier Rand um den Code.'
      : m >= 2
        ? `Der Rand ist mit ${m} Modulen knapp. Der Standard verlangt 4. Auf unruhigem Untergrund kann das Scannen scheitern.`
        : 'Ohne freien Rand finden viele Kameras den Code nicht.',
    fix: m < 4 ? { label: 'Rand auf 4 Module setzen', patch: (x) => ({ ...x, margin: 4 }) } : undefined,
  });

  if (meta && d.logo.kind !== 'none') {
    const cap = EC_CAPACITY[meta.ec];
    const load = meta.logoCoverage / cap;
    checks.push({
      id: 'logo',
      label: 'Logo',
      status: load <= 0.55 ? 'ok' : load <= 0.85 ? 'warn' : 'fail',
      detail: `Das Logo verdeckt ${fmtPct(meta.logoCoverage)} der Daten. Die Fehlerkorrektur ${meta.ec} kann bis zu ${fmtPct(cap)} ausgleichen.`,
      fix: load > 0.55
        ? meta.ec !== 'H'
          ? { label: `Fehlerkorrektur auf ${EC_NEXT[meta.ec]} erhöhen`, patch: (x) => ({ ...x, ec: EC_NEXT[meta.ec] }) }
          : { label: 'Logo verkleinern', patch: (x) => ({ ...x, logo: { ...x.logo, size: Math.max(0.12, x.logo.size - 0.05) } }) }
        : undefined,
    });
  }

  if (meta) {
    checks.push({
      id: 'density',
      label: 'Dichte',
      status: meta.version <= 10 ? 'ok' : meta.version <= 20 ? 'warn' : 'fail',
      detail: meta.version <= 10
        ? `${meta.modules} × ${meta.modules} Module, gut lesbar.`
        : `${meta.modules} × ${meta.modules} Module sind sehr fein. Drucke größer oder kürze den Inhalt, zum Beispiel mit einem dynamischen Kurzlink.`,
    });
  }

  if (d.body.size < 0.8 || d.body.shape === 'plus' || d.body.shape === 'diamond') {
    checks.push({
      id: 'shape',
      label: 'Modulform',
      status: 'warn',
      detail: 'Kleine oder schmale Module verringern die Fläche, die eine Kamera erkennt. Erhöhe bei Bedarf die Fehlerkorrektur.',
      fix: d.body.size < 0.8 ? { label: 'Module vergrößern', patch: (x) => ({ ...x, body: { ...x.body, size: 0.95 } }) } : undefined,
    });
  }

  if (meta && opts.printMm) {
    const moduleMm = opts.printMm * meta.moduleFraction;
    checks.push({
      id: 'print',
      label: 'Druckgröße',
      status: moduleMm >= 0.5 ? 'ok' : moduleMm >= 0.33 ? 'warn' : 'fail',
      detail: `Ein Modul wird ${moduleMm.toFixed(2).replace('.', ',')} mm groß. Empfohlen sind mindestens 0,5 mm.`,
    });
  }

  const ec = meta?.ec ?? effectiveEc(d, opts.minEc);
  if (ec === 'L' && (d.logo.kind !== 'none' || d.body.shape !== 'square')) {
    checks.push({
      id: 'ec',
      label: 'Fehlerkorrektur',
      status: 'warn',
      detail: 'Stufe L gleicht kaum Störungen aus. Für gestaltete Codes ist Q oder H sicherer.',
      fix: { label: 'Automatik verwenden', patch: (x) => ({ ...x, ec: 'auto' }) },
    });
  }

  return checks;
}

export function overallStatus(checks: Check[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

/** Empfohlene Mindestbreite in Millimetern für eine Scan-Entfernung (Faustregel 10 : 1, mind. 2 cm). */
export function minWidthForDistance(distanceCm: number, meta: RenderMeta): number {
  const byDistance = (distanceCm * 10) / 10;
  const byModules = 0.5 / meta.moduleFraction;
  return Math.max(20, byDistance, byModules);
}
