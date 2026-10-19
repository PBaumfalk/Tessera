// Designmodell eines QR-Codes, Standardwerte, Stilvorlagen und Bereinigung.
import { ICONS } from './icons.generated';

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export type BodyShape = 'square' | 'rounded' | 'dots' | 'fluid' | 'classy' | 'diamond' | 'vlines' | 'hlines' | 'plus';
export type EyeFrame = 'square' | 'rounded' | 'circle' | 'leaf' | 'cut';
export type EyeBall = 'square' | 'rounded' | 'circle' | 'leaf' | 'diamond';
export type FrameStyle = 'none' | 'card' | 'banner' | 'pill' | 'bubble' | 'caption' | 'brackets';
export type FontId = 'bricolage' | 'instrument' | 'fraunces' | 'mono';

export type Paint =
  | { type: 'solid'; color: string }
  | { type: 'linear'; colors: [string, string]; angle: number }
  | { type: 'radial'; colors: [string, string] };

export type Background = Paint | { type: 'transparent' };

export interface Design {
  v: 1;
  ec: 'auto' | EcLevel;
  margin: number;
  body: { shape: BodyShape; size: number };
  eyes: { frame: EyeFrame; ball: EyeBall; frameColor: string | null; ballColor: string | null };
  fg: Paint;
  bg: Background;
  radius: number;
  logo: {
    kind: 'none' | 'icon' | 'image';
    icon: string;
    iconColor: string | null;
    image: string | null;
    size: number;
    padding: number;
    shape: 'square' | 'rounded' | 'circle';
    plate: string | null;
    excavate: boolean;
  };
  frame: { style: FrameStyle; text: string; font: FontId; color: string; textColor: string };
}

export const BODY_SHAPES: { id: BodyShape; label: string }[] = [
  { id: 'square', label: 'Quadrat' },
  { id: 'rounded', label: 'Abgerundet' },
  { id: 'dots', label: 'Punkte' },
  { id: 'fluid', label: 'Fließend' },
  { id: 'classy', label: 'Blatt' },
  { id: 'diamond', label: 'Raute' },
  { id: 'vlines', label: 'Säulen' },
  { id: 'hlines', label: 'Streifen' },
  { id: 'plus', label: 'Plus' },
];
export const EYE_FRAMES: { id: EyeFrame; label: string }[] = [
  { id: 'square', label: 'Quadrat' },
  { id: 'rounded', label: 'Abgerundet' },
  { id: 'circle', label: 'Kreis' },
  { id: 'leaf', label: 'Blatt' },
  { id: 'cut', label: 'Facette' },
];
export const EYE_BALLS: { id: EyeBall; label: string }[] = [
  { id: 'square', label: 'Quadrat' },
  { id: 'rounded', label: 'Abgerundet' },
  { id: 'circle', label: 'Kreis' },
  { id: 'leaf', label: 'Blatt' },
  { id: 'diamond', label: 'Raute' },
];
export const FRAME_STYLES: { id: FrameStyle; label: string }[] = [
  { id: 'none', label: 'Ohne' },
  { id: 'card', label: 'Karte' },
  { id: 'banner', label: 'Banner oben' },
  { id: 'pill', label: 'Etikett' },
  { id: 'bubble', label: 'Sprechblase' },
  { id: 'caption', label: 'Bildunterschrift' },
  { id: 'brackets', label: 'Sucher' },
];
export const FONTS: { id: FontId; label: string; file: string }[] = [
  { id: 'bricolage', label: 'Bricolage', file: 'bricolage-700.woff' },
  { id: 'instrument', label: 'Instrument Sans', file: 'instrument-600.woff' },
  { id: 'fraunces', label: 'Fraunces', file: 'fraunces-600.woff' },
  { id: 'mono', label: 'JetBrains Mono', file: 'jetbrains-600.woff' },
];

export const DEFAULT_DESIGN: Design = {
  v: 1,
  ec: 'auto',
  margin: 4,
  body: { shape: 'square', size: 1 },
  eyes: { frame: 'square', ball: 'square', frameColor: null, ballColor: null },
  fg: { type: 'solid', color: '#000000' },
  bg: { type: 'solid', color: '#ffffff' },
  radius: 0,
  logo: { kind: 'none', icon: 'globe', iconColor: null, image: null, size: 0.22, padding: 0.14, shape: 'rounded', plate: null, excavate: true },
  frame: { style: 'none', text: 'Scan mich', font: 'bricolage', color: '#000000', textColor: '#ffffff' },
};

export interface StylePreset {
  id: string;
  name: string;
  design: Partial<Design> & Pick<Design, 'fg' | 'bg'>;
}

/** Kuratierte Stile. Jeder Stil ist auf Lesbarkeit geprüft (siehe tests/unit/presets.test.ts). */
export const STYLE_PRESETS: StylePreset[] = [
  { id: 'klassisch', name: 'Klassisch', design: { fg: { type: 'solid', color: '#000000' }, bg: { type: 'solid', color: '#ffffff' } } },
  { id: 'kobalt', name: 'Kobalt', design: {
    body: { shape: 'fluid', size: 1 }, eyes: { frame: 'rounded', ball: 'rounded', frameColor: null, ballColor: null },
    fg: { type: 'solid', color: '#2234D6' }, bg: { type: 'solid', color: '#ffffff' } } },
  { id: 'tinte', name: 'Tinte', design: {
    body: { shape: 'dots', size: 0.92 }, eyes: { frame: 'circle', ball: 'circle', frameColor: null, ballColor: null },
    fg: { type: 'solid', color: '#14151B' }, bg: { type: 'solid', color: '#F3F1EC' } } },
  { id: 'abendrot', name: 'Abendrot', design: {
    body: { shape: 'rounded', size: 0.94 }, eyes: { frame: 'rounded', ball: 'circle', frameColor: '#7A1F3D', ballColor: null },
    fg: { type: 'linear', colors: ['#7A1F3D', '#D9480F'], angle: 45 }, bg: { type: 'solid', color: '#FFF8F3' } } },
  { id: 'tiefsee', name: 'Tiefsee', design: {
    body: { shape: 'classy', size: 1 }, eyes: { frame: 'leaf', ball: 'leaf', frameColor: null, ballColor: '#0B7285' },
    fg: { type: 'linear', colors: ['#0B3D91', '#0B7285'], angle: 135 }, bg: { type: 'solid', color: '#ffffff' } } },
  { id: 'wald', name: 'Wald', design: {
    body: { shape: 'vlines', size: 0.86 }, eyes: { frame: 'rounded', ball: 'rounded', frameColor: null, ballColor: null },
    fg: { type: 'solid', color: '#1E4D2B' }, bg: { type: 'solid', color: '#F1F5EE' } } },
  { id: 'nacht', name: 'Nachtmodus', design: {
    body: { shape: 'fluid', size: 1 }, eyes: { frame: 'rounded', ball: 'circle', frameColor: null, ballColor: '#8FA2FF' },
    fg: { type: 'solid', color: '#F4F5FA' }, bg: { type: 'solid', color: '#151826' }, radius: 6 } },
  { id: 'facette', name: 'Facette', design: {
    body: { shape: 'diamond', size: 1 }, eyes: { frame: 'cut', ball: 'diamond', frameColor: null, ballColor: null },
    fg: { type: 'radial', colors: ['#5B21B6', '#1E1B4B'] }, bg: { type: 'solid', color: '#ffffff' } } },
  { id: 'druck', name: 'Druck s/w', design: {
    body: { shape: 'square', size: 1 }, eyes: { frame: 'square', ball: 'square', frameColor: null, ballColor: null },
    fg: { type: 'solid', color: '#000000' }, bg: { type: 'transparent' }, ec: 'Q' } },
];

// ---------------------------------------------------------------- Bereinigung

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const color = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);
const colorOrNull = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[] | readonly T[], def: T): T => {
  const ids = (list as readonly (T | { id: T })[]).map((x) => (typeof x === 'string' ? x : x.id));
  return ids.includes(v as T) ? (v as T) : def;
};

function paint(v: unknown, def: Paint): Paint {
  const p = v as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return def;
  if (p.type === 'solid') return { type: 'solid', color: color(p.color, def.type === 'solid' ? def.color : '#000000') };
  const cols = Array.isArray(p.colors) ? p.colors : [];
  const pair: [string, string] = [color(cols[0], '#000000'), color(cols[1], '#333333')];
  if (p.type === 'linear') return { type: 'linear', colors: pair, angle: clamp(p.angle, 0, 360, 45) };
  if (p.type === 'radial') return { type: 'radial', colors: pair };
  return def;
}

/** Erlaubt nur eingebettete Rastergrafiken bzw. SVG als Data-URL und begrenzt die Größe. */
export function safeImageDataUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length > 1_400_000) return null;
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
}

export function sanitizeDesign(input: unknown): Design {
  const d = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const D = DEFAULT_DESIGN;
  const bgIn = d.bg as Record<string, unknown> | undefined;
  return {
    v: 1,
    ec: oneOf(d.ec, ['auto', 'L', 'M', 'Q', 'H'] as const, 'auto'),
    margin: Math.round(clamp(d.margin, 0, 10, D.margin)),
    body: {
      shape: oneOf<BodyShape>(d.body?.shape, BODY_SHAPES, D.body.shape),
      size: clamp(d.body?.size, 0.6, 1, 1),
    },
    eyes: {
      frame: oneOf<EyeFrame>(d.eyes?.frame, EYE_FRAMES, D.eyes.frame),
      ball: oneOf<EyeBall>(d.eyes?.ball, EYE_BALLS, D.eyes.ball),
      frameColor: colorOrNull(d.eyes?.frameColor),
      ballColor: colorOrNull(d.eyes?.ballColor),
    },
    fg: paint(d.fg, D.fg),
    bg: bgIn?.type === 'transparent' ? { type: 'transparent' } : paint(bgIn, D.bg as Paint),
    radius: clamp(d.radius, 0, 20, 0),
    logo: {
      kind: oneOf(d.logo?.kind, ['none', 'icon', 'image'] as const, 'none'),
      icon: typeof d.logo?.icon === 'string' && Object.hasOwn(ICONS, d.logo.icon) ? d.logo.icon : D.logo.icon,
      iconColor: colorOrNull(d.logo?.iconColor),
      image: safeImageDataUrl(d.logo?.image),
      size: clamp(d.logo?.size, 0.1, 0.32, D.logo.size),
      padding: clamp(d.logo?.padding, 0, 0.35, D.logo.padding),
      shape: oneOf(d.logo?.shape, ['square', 'rounded', 'circle'] as const, 'rounded'),
      plate: colorOrNull(d.logo?.plate),
      excavate: d.logo?.excavate !== false,
    },
    frame: {
      style: oneOf<FrameStyle>(d.frame?.style, FRAME_STYLES, 'none'),
      text: typeof d.frame?.text === 'string' ? d.frame.text.slice(0, 40) : D.frame.text,
      font: oneOf<FontId>(d.frame?.font, FONTS, 'bricolage'),
      color: color(d.frame?.color, D.frame.color),
      textColor: color(d.frame?.textColor, D.frame.textColor),
    },
  };
}

export function applyPreset(base: Design, preset: StylePreset): Design {
  return sanitizeDesign({
    ...base,
    ec: preset.design.ec ?? base.ec,
    body: preset.design.body ?? DEFAULT_DESIGN.body,
    eyes: preset.design.eyes ?? DEFAULT_DESIGN.eyes,
    fg: preset.design.fg,
    bg: preset.design.bg,
    radius: preset.design.radius ?? 0,
    frame: { ...base.frame, color: firstColor(preset.design.fg) },
  });
}

export function firstColor(p: Background): string {
  if (p.type === 'transparent') return '#ffffff';
  return p.type === 'solid' ? p.color : p.colors[0];
}

/** Effektive Fehlerkorrektur: Automatik wählt nach Logo, Form und Standard. */
export function effectiveEc(design: Design, minEc?: EcLevel): EcLevel {
  const order: EcLevel[] = ['L', 'M', 'Q', 'H'];
  let ec: EcLevel;
  if (design.ec !== 'auto') ec = design.ec;
  else if (design.logo.kind !== 'none') ec = 'H';
  else if (design.body.shape === 'square' && design.body.size >= 0.95) ec = 'M';
  else ec = 'Q';
  if (minEc && order.indexOf(ec) < order.indexOf(minEc)) ec = minEc;
  return ec;
}
