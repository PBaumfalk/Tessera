// Beschriftungen als Vektorpfade. Schriften werden vom Browser bzw. Server registriert,
// damit SVG, PDF und PNG ohne installierte Schriften identisch aussehen.
import type { Font } from 'opentype.js';
import type { FontId } from './design';

const fonts = new Map<FontId, Font>();

export function registerFont(id: FontId, font: Font): void {
  fonts.set(id, font);
}

export function hasFont(id: FontId): boolean {
  return fonts.has(id);
}

export interface TextShape {
  d: string | null;
  width: number;
}

/** Misst die Textbreite bei gegebener Schriftgröße (ohne Schrift: Schätzung). */
export function measureText(text: string, fontId: FontId, size: number): number {
  const font = fonts.get(fontId);
  if (!font) return text.length * size * 0.56;
  const scale = size / font.unitsPerEm;
  let w = 0;
  let prev: ReturnType<Font['charToGlyph']> | null = null;
  for (const ch of Array.from(text)) {
    const g = font.charToGlyph(ch);
    if (prev) w += font.getKerningValue(prev, g) * scale;
    w += (g.advanceWidth ?? 0) * scale;
    prev = g;
  }
  return w;
}

/**
 * Setzt Text mittig um (cx, baseline). Liefert Pfaddaten oder null, wenn die Schrift
 * noch nicht geladen ist (dann rendert der Aufrufer ein <text>-Element).
 */
export function textPath(text: string, fontId: FontId, size: number, cx: number, baseline: number): TextShape {
  const font = fonts.get(fontId);
  const width = measureText(text, fontId, size);
  if (!font) return { d: null, width };
  const scale = size / font.unitsPerEm;
  let x = cx - width / 2;
  let prev: ReturnType<Font['charToGlyph']> | null = null;
  const parts: string[] = [];
  for (const ch of Array.from(text)) {
    const g = font.charToGlyph(ch);
    if (prev) x += font.getKerningValue(prev, g) * scale;
    const d = serialize(g.getPath(x, baseline, size).commands);
    if (d) parts.push(d);
    x += (g.advanceWidth ?? 0) * scale;
    prev = g;
  }
  return { d: parts.join(''), width };
}

const n = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0');

/** Eigene Serialisierung: toPathData von opentype.js liefert in seltenen Fällen „NaN“. */
function serialize(cmds: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): string {
  let out = '';
  for (const c of cmds) {
    if (c.type === 'Z') out += 'Z';
    else if (c.type === 'M' || c.type === 'L') out += `${c.type}${n(c.x!)} ${n(c.y!)}`;
    else if (c.type === 'Q') out += `Q${n(c.x1!)} ${n(c.y1!)} ${n(c.x!)} ${n(c.y!)}`;
    else if (c.type === 'C') out += `C${n(c.x1!)} ${n(c.y1!)} ${n(c.x2!)} ${n(c.y2!)} ${n(c.x!)} ${n(c.y!)}`;
  }
  return out;
}

/** Oberlänge der Großbuchstaben als Anteil der Schriftgröße (für vertikale Zentrierung). */
export function capHeight(fontId: FontId): number {
  const font = fonts.get(fontId);
  const os2 = font?.tables?.os2 as { sCapHeight?: number } | undefined;
  if (font && os2?.sCapHeight) return os2.sCapHeight / font.unitsPerEm;
  return 0.7;
}
