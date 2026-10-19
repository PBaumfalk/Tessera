// QR-Renderer: Inhalt + Design → SVG. Einzige Quelle für Vorschau, SVG-, PNG- und PDF-Export.
import * as QRCore from 'qrcode/lib/core/qrcode.js';
import { ICONS } from './icons.generated';
import { capHeight, measureText, textPath } from './text';
import { effectiveEc, firstColor, type Background, type Design, type EcLevel, type EyeBall, type EyeFrame, type Paint } from './design';

const U = 10; // Nutzereinheiten pro Modul

export class CapacityError extends Error {
  constructor(public bytes: number) {
    super('Zu viele Daten für einen QR-Code.');
  }
}

export interface QrMatrix {
  size: number;
  version: number;
  ec: EcLevel;
  mask: number;
  dark: Uint8Array;
  reserved: Uint8Array;
}

export function buildMatrix(payload: string, ec: EcLevel): QrMatrix {
  let qr: any;
  try {
    qr = (QRCore as any).create(payload, { errorCorrectionLevel: ec });
  } catch (e) {
    const bytes = new TextEncoder().encode(payload).length;
    if (/too big|amount of data/i.test(String((e as Error).message))) throw new CapacityError(bytes);
    throw e;
  }
  const m = qr.modules;
  return {
    size: m.size,
    version: qr.version,
    ec,
    mask: qr.maskPattern,
    dark: Uint8Array.from(m.data as ArrayLike<number>, (v) => (v ? 1 : 0)),
    reserved: Uint8Array.from(m.reservedBit as ArrayLike<number>, (v) => (v ? 1 : 0)),
  };
}

export interface RenderMeta {
  version: number;
  modules: number;
  ec: EcLevel;
  mask: number;
  payloadBytes: number;
  /** Anteil der Datenmodule, die vom Logo verdeckt oder ausgespart werden. */
  logoCoverage: number;
  /** Breite eines Moduls relativ zur Gesamtbreite der Grafik (für Druckgrößen). */
  moduleFraction: number;
  width: number;
  height: number;
}

export interface RenderOptions {
  minEc?: EcLevel;
  /** Breite in Pixeln für width/height-Attribute. */
  sizePx?: number;
  idPrefix?: string;
  /** Vorschau-Hinweis statt echtem Inhalt (Platzhalter grau). */
  title?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
let idCounter = 0;

// ---------------------------------------------------------------- Pfad-Hilfen

/** Rechteck mit individuellen Eckradien [oben links, oben rechts, unten rechts, unten links]. */
function rr(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: number[]): string {
  const p = [`M${r2(x + tl)} ${r2(y)}`, `H${r2(x + w - tr)}`];
  if (tr) p.push(`A${r2(tr)} ${r2(tr)} 0 0 1 ${r2(x + w)} ${r2(y + tr)}`);
  p.push(`V${r2(y + h - br)}`);
  if (br) p.push(`A${r2(br)} ${r2(br)} 0 0 1 ${r2(x + w - br)} ${r2(y + h)}`);
  p.push(`H${r2(x + bl)}`);
  if (bl) p.push(`A${r2(bl)} ${r2(bl)} 0 0 1 ${r2(x)} ${r2(y + h - bl)}`);
  p.push(`V${r2(y + tl)}`);
  if (tl) p.push(`A${r2(tl)} ${r2(tl)} 0 0 1 ${r2(x + tl)} ${r2(y)}`);
  return p.join('') + 'Z';
}

function circle(cx: number, cy: number, r: number): string {
  return `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
}

function chamfer(x: number, y: number, s: number, c: number): string {
  return `M${r2(x + c)} ${r2(y)}H${r2(x + s - c)}L${r2(x + s)} ${r2(y + c)}V${r2(y + s - c)}L${r2(x + s - c)} ${r2(y + s)}H${r2(x + c)}L${r2(x)} ${r2(y + s - c)}V${r2(y + c)}Z`;
}

function diamond(cx: number, cy: number, h: number): string {
  return `M${r2(cx)} ${r2(cy - h)}L${r2(cx + h)} ${r2(cy)}L${r2(cx)} ${r2(cy + h)}L${r2(cx - h)} ${r2(cy)}Z`;
}

function eyeFramePath(kind: EyeFrame, x: number, y: number, corner: number): string {
  const O = 7 * U;
  switch (kind) {
    case 'rounded': return rr(x, y, O, O, [22, 22, 22, 22]) + rr(x + U, y + U, 5 * U, 5 * U, [13, 13, 13, 13]);
    case 'circle': return circle(x + O / 2, y + O / 2, O / 2) + circle(x + O / 2, y + O / 2, O / 2 - U);
    case 'leaf': {
      const big = corner === 0 ? [30, 4, 30, 4] : [4, 30, 4, 30];
      const small = big.map((v) => (v > 10 ? 20 : 2));
      return rr(x, y, O, O, big) + rr(x + U, y + U, 5 * U, 5 * U, small);
    }
    case 'cut': return chamfer(x, y, O, 18) + chamfer(x + U, y + U, 5 * U, 11);
    default: return rr(x, y, O, O, [0, 0, 0, 0]) + rr(x + U, y + U, 5 * U, 5 * U, [0, 0, 0, 0]);
  }
}

function eyeBallPath(kind: EyeBall, x: number, y: number, corner: number): string {
  const B = 3 * U;
  const bx = x + 2 * U;
  const by = y + 2 * U;
  switch (kind) {
    case 'rounded': return rr(bx, by, B, B, [9, 9, 9, 9]);
    case 'circle': return circle(bx + B / 2, by + B / 2, B / 2);
    case 'leaf': return rr(bx, by, B, B, corner === 0 ? [14, 2, 14, 2] : [2, 14, 2, 14]);
    case 'diamond': return diamond(bx + B / 2, by + B / 2, B * 0.62);
    default: return rr(bx, by, B, B, [0, 0, 0, 0]);
  }
}

// ---------------------------------------------------------------- Farben

function paintDef(id: string, p: Paint | Background, x: number, y: number, size: number): { fill: string; def: string } {
  if (p.type === 'transparent') return { fill: 'none', def: '' };
  if (p.type === 'solid') return { fill: p.color, def: '' };
  const [c1, c2] = p.colors;
  if (p.type === 'radial') {
    return {
      fill: `url(#${id})`,
      def: `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r2(x + size / 2)}" cy="${r2(y + size / 2)}" r="${r2(size * 0.72)}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`,
    };
  }
  const a = (p.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const L = ((Math.abs(cos) + Math.abs(sin)) * size) / 2;
  const cx = x + size / 2;
  const cy = y + size / 2;
  return {
    fill: `url(#${id})`,
    def: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r2(cx - cos * L)}" y1="${r2(cy - sin * L)}" x2="${r2(cx + cos * L)}" y2="${r2(cy + sin * L)}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`,
  };
}

export const escapeXml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- Rahmen

interface FrameLayout {
  W: number;
  H: number;
  qx: number;
  qy: number;
  back: string;
  text: { cx: number; cy: number; maxW: number; size: number; color: string } | null;
  /** Hintergrund über die gesamte Fläche statt nur hinter dem Code. */
  fullBg: boolean;
}

function frameLayout(design: Design, S: number): FrameLayout {
  const f = design.frame;
  const hasText = f.text.trim().length > 0;
  const t = S * 0.045;
  const band = S * 0.2;
  const rad = (design.radius / 100) * S;
  switch (f.style) {
    case 'card':
    case 'banner': {
      const W = S + 2 * t;
      const H = S + t + band;
      const top = f.style === 'banner';
      return {
        W, H, qx: t, qy: top ? band : t, fullBg: false,
        back: `<path d="${rr(0, 0, W, H, Array(4).fill(Math.max(t * 2, rad + t)))}" fill="${f.color}"/>`,
        text: hasText ? { cx: W / 2, cy: top ? band / 2 + t * 0.15 : S + t + band / 2 - t * 0.15, maxW: W * 0.86, size: band * 0.46, color: f.textColor } : null,
      };
    }
    case 'pill': {
      const gap = S * 0.035;
      const ph = S * 0.17;
      const size = ph * 0.5;
      const tw = hasText ? measureText(f.text, f.font, size) : 0;
      const pw = Math.min(S * 0.92, Math.max(S * 0.42, tw + ph * 1.3));
      const H = S + gap + ph;
      return {
        W: S, H, qx: 0, qy: 0, fullBg: true,
        back: hasText ? `<path d="${rr((S - pw) / 2, S + gap, pw, ph, Array(4).fill(ph / 2))}" fill="${f.color}"/>` : '',
        text: hasText ? { cx: S / 2, cy: S + gap + ph / 2, maxW: pw - ph * 0.8, size, color: f.textColor } : null,
      };
    }
    case 'bubble': {
      const bh = S * 0.17;
      const tri = S * 0.05;
      const size = bh * 0.5;
      const tw = hasText ? measureText(f.text, f.font, size) : 0;
      const bw = Math.min(S * 0.92, Math.max(S * 0.42, tw + bh * 1.3));
      const x0 = (S - bw) / 2;
      const H = bh + tri + S * 0.01 + S;
      const triPath = `M${r2(S / 2 - tri)} ${r2(bh - 0.5)}L${r2(S / 2)} ${r2(bh + tri)}L${r2(S / 2 + tri)} ${r2(bh - 0.5)}Z`;
      return {
        W: S, H, qx: 0, qy: bh + tri + S * 0.01, fullBg: true,
        back: hasText ? `<path d="${rr(x0, 0, bw, bh, Array(4).fill(bh / 2))}${triPath}" fill="${f.color}"/>` : '',
        text: hasText ? { cx: S / 2, cy: bh / 2, maxW: bw - bh * 0.8, size, color: f.textColor } : null,
      };
    }
    case 'caption': {
      const band2 = S * 0.15;
      return {
        W: S, H: S + band2, qx: 0, qy: 0, fullBg: true, back: '',
        text: hasText ? { cx: S / 2, cy: S + band2 * 0.36, maxW: S * 0.9, size: band2 * 0.52, color: f.color } : null,
      };
    }
    case 'brackets': {
      const p = S * 0.075;
      const band2 = hasText ? S * 0.15 : 0;
      const W = S + 2 * p;
      const H = S + 2 * p + band2;
      const len = S * 0.2;
      const th = S * 0.028;
      const o = th / 2;
      const arms = [
        `M${r2(o)} ${r2(len)}V${r2(o)}H${r2(len)}`,
        `M${r2(W - len)} ${r2(o)}H${r2(W - o)}V${r2(len)}`,
        `M${r2(W - o)} ${r2(S + 2 * p - len)}V${r2(S + 2 * p - o)}H${r2(W - len)}`,
        `M${r2(len)} ${r2(S + 2 * p - o)}H${r2(o)}V${r2(S + 2 * p - len)}`,
      ].join('');
      return {
        W, H, qx: p, qy: p, fullBg: true,
        back: `<path d="${arms}" fill="none" stroke="${f.color}" stroke-width="${r2(th)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        text: hasText ? { cx: W / 2, cy: S + 2 * p + band2 * 0.4, maxW: W * 0.9, size: band2 * 0.52, color: f.color } : null,
      };
    }
    default:
      return { W: S, H: S, qx: 0, qy: 0, back: '', text: null, fullBg: false };
  }
}

// ---------------------------------------------------------------- Hauptfunktion

export interface RenderResult {
  svg: string;
  meta: RenderMeta;
}

export function renderSvg(payload: string, design: Design, opts: RenderOptions = {}): RenderResult {
  const ec = effectiveEc(design, opts.minEc);
  const mx = buildMatrix(payload, ec);
  const N = mx.size;
  const m = design.margin;
  const S = (N + 2 * m) * U;
  const pid = opts.idPrefix ?? `t${(++idCounter).toString(36)}`;
  const layout = frameLayout(design, S);
  const x0 = layout.qx + m * U;
  const y0 = layout.qy + m * U;

  const isDark = (r: number, c: number) => r >= 0 && c >= 0 && r < N && c < N && mx.dark[r * N + c] === 1;
  const inFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

  // Logo-Fläche in Modulkoordinaten
  const logo = design.logo;
  const hasLogo = logo.kind === 'icon' ? Object.hasOwn(ICONS, logo.icon) : logo.kind === 'image' ? !!logo.image : false;
  const P = hasLogo ? logo.size * N : 0;
  const p0 = (N - P) / 2;
  const p1 = p0 + P;
  const excavated = new Uint8Array(N * N);
  let covered = 0;
  let dataModules = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!mx.reserved[r * N + c]) dataModules++;
      if (!hasLogo) continue;
      let hit: boolean;
      if (logo.shape === 'circle') {
        hit = Math.hypot(c + 0.5 - N / 2, r + 0.5 - N / 2) < P / 2 + 0.4;
      } else {
        const ox = Math.min(c + 1, p1) - Math.max(c, p0);
        const oy = Math.min(r + 1, p1) - Math.max(r, p0);
        hit = ox > 0.15 && oy > 0.15;
      }
      if (hit && !inFinder(r, c)) {
        if (logo.excavate) excavated[r * N + c] = 1;
        if (!mx.reserved[r * N + c]) covered++;
      }
    }
  }
  const drawable = (r: number, c: number) => isDark(r, c) && !inFinder(r, c) && !excavated[r * N + c];

  // Module
  const parts: string[] = [];
  const shape = design.body.shape;
  const sz = design.body.size;
  if (shape === 'square' && sz > 0.995) {
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        if (!drawable(r, c)) { c++; continue; }
        const start = c;
        while (c < N && drawable(r, c)) c++;
        parts.push(`M${x0 + start * U} ${y0 + r * U}h${(c - start) * U}v${U}h${-(c - start) * U}Z`);
      }
    }
  } else if (shape === 'vlines' || shape === 'hlines') {
    const w = U * sz * 0.9;
    const vertical = shape === 'vlines';
    for (let a = 0; a < N; a++) {
      let b = 0;
      while (b < N) {
        const ok = (k: number) => (vertical ? drawable(k, a) : drawable(a, k));
        if (!ok(b)) { b++; continue; }
        const start = b;
        while (b < N && ok(b)) b++;
        const len = (b - start) * U - (U - w);
        const rad = w / 2;
        if (vertical) parts.push(rr(x0 + a * U + (U - w) / 2, y0 + start * U + (U - w) / 2, w, len, [rad, rad, rad, rad]));
        else parts.push(rr(x0 + start * U + (U - w) / 2, y0 + a * U + (U - w) / 2, len, w, [rad, rad, rad, rad]));
      }
    }
  } else {
    const side = U * sz;
    const inset = (U - side) / 2;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!drawable(r, c)) continue;
        const x = x0 + c * U;
        const y = y0 + r * U;
        const cx = x + U / 2;
        const cy = y + U / 2;
        switch (shape) {
          case 'dots': parts.push(circle(cx, cy, side / 2)); break;
          case 'rounded': parts.push(rr(x + inset, y + inset, side, side, Array(4).fill(side * 0.32))); break;
          case 'diamond': parts.push(diamond(cx, cy, side * 0.6)); break;
          case 'plus': {
            const arm = side * 0.46;
            parts.push(rr(x + inset, cy - arm / 2, side, arm, [arm / 4, arm / 4, arm / 4, arm / 4]));
            parts.push(rr(cx - arm / 2, y + inset, arm, side, [arm / 4, arm / 4, arm / 4, arm / 4]));
            break;
          }
          case 'fluid':
          case 'classy': {
            const t = drawable(r - 1, c), rt = drawable(r, c + 1), bt = drawable(r + 1, c), l = drawable(r, c - 1);
            const R = U / 2;
            const corners = shape === 'fluid'
              ? [!t && !l ? R : 0, !t && !rt ? R : 0, !bt && !rt ? R : 0, !bt && !l ? R : 0]
              : [!t && !l ? R : 0, 0, !bt && !rt ? R : 0, 0];
            parts.push(rr(x, y, U, U, corners));
            break;
          }
          default: parts.push(rr(x + inset, y + inset, side, side, [0, 0, 0, 0]));
        }
      }
    }
  }

  // Farben
  const defs: string[] = [];
  const modulesSize = N * U;
  const fgP = paintDef(`${pid}fg`, design.fg, x0, y0, modulesSize);
  if (fgP.def) defs.push(fgP.def);
  const bgArea = layout.fullBg ? { x: 0, y: 0, w: layout.W, h: layout.H } : { x: layout.qx, y: layout.qy, w: S, h: S };
  const bgP = paintDef(`${pid}bg`, design.bg, bgArea.x, bgArea.y, Math.max(bgArea.w, bgArea.h));
  if (bgP.def) defs.push(bgP.def);

  // Augen (Finder Patterns)
  const eyeOrigins: [number, number][] = [[0, 0], [0, N - 7], [N - 7, 0]];
  let framesD = '';
  let ballsD = '';
  eyeOrigins.forEach(([r, c], i) => {
    framesD += eyeFramePath(design.eyes.frame, x0 + c * U, y0 + r * U, i);
    ballsD += eyeBallPath(design.eyes.ball, x0 + c * U, y0 + r * U, i);
  });

  const out: string[] = [];
  const W = layout.W;
  const H = layout.H;
  const sizeAttr = opts.sizePx ? ` width="${opts.sizePx}" height="${r2((opts.sizePx * H) / W)}"` : '';
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H)}"${sizeAttr}>`);
  if (opts.title) out.push(`<title>${escapeXml(opts.title)}</title>`);
  if (logo.kind === 'image' && hasLogo && logo.shape !== 'square') {
    const lx = x0 + p0 * U;
    const ls = P * U;
    const clip = logo.shape === 'circle' ? circle(lx + ls / 2, y0 + p0 * U + ls / 2, ls / 2) : rr(lx, y0 + p0 * U, ls, ls, Array(4).fill(ls * 0.18));
    defs.push(`<clipPath id="${pid}clip"><path d="${clip}"/></clipPath>`);
  }
  if (defs.length) out.push(`<defs>${defs.join('')}</defs>`);

  // Bei Karte und Banner liegt der Code-Hintergrund auf dem Rahmen, sonst liegt das Etikett auf dem Hintergrund.
  const rad = (design.radius / 100) * S;
  const boxed = design.frame.style === 'card' || design.frame.style === 'banner';
  const bgPath = bgP.fill === 'none' ? (boxed ? `<path d="${rr(layout.qx, layout.qy, S, S, Array(4).fill(rad))}" fill="#ffffff"/>` : '')
    : layout.fullBg ? `<path d="${rr(0, 0, W, H, Array(4).fill(rad))}" fill="${bgP.fill}"/>`
    : `<path d="${rr(layout.qx, layout.qy, S, S, Array(4).fill(rad))}" fill="${bgP.fill}"/>`;
  if (layout.fullBg) out.push(bgPath, layout.back);
  else out.push(layout.back, bgPath);
  out.push(`<path d="${parts.join('')}" fill="${fgP.fill}"/>`);
  out.push(`<path d="${framesD}" fill="${design.eyes.frameColor ?? fgP.fill}" fill-rule="evenodd"/>`);
  out.push(`<path d="${ballsD}" fill="${design.eyes.ballColor ?? design.eyes.frameColor ?? fgP.fill}"/>`);

  // Logo
  if (hasLogo) {
    const lx = x0 + p0 * U;
    const ly = y0 + p0 * U;
    const ls = P * U;
    const plateColor = logo.plate ?? (design.bg.type === 'transparent' ? null : firstColor(design.bg));
    if (logo.excavate && plateColor) {
      const plate = logo.shape === 'circle' ? circle(lx + ls / 2, ly + ls / 2, ls / 2)
        : rr(lx, ly, ls, ls, Array(4).fill(logo.shape === 'rounded' ? ls * 0.18 : 0));
      out.push(`<path d="${plate}" fill="${plateColor}"/>`);
    }
    const pad = ls * logo.padding;
    const inner = ls - 2 * pad;
    if (logo.kind === 'icon') {
      const icon = ICONS[logo.icon];
      const k = inner / icon.viewBox;
      const col = logo.iconColor ?? (design.fg.type === 'solid' ? design.fg.color : design.fg.colors[0]);
      const attrs = icon.kind === 'fill'
        ? `fill="${col}"`
        : `fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
      out.push(`<path transform="translate(${r2(lx + pad)} ${r2(ly + pad)}) scale(${r2(k * 1000) / 1000})" d="${icon.d.join('')}" ${attrs}/>`);
    } else if (logo.image) {
      const clip = logo.shape !== 'square' ? ` clip-path="url(#${pid}clip)"` : '';
      out.push(`<image href="${logo.image}" x="${r2(lx + pad)}" y="${r2(ly + pad)}" width="${r2(inner)}" height="${r2(inner)}" preserveAspectRatio="xMidYMid meet"${clip}/>`);
    }
  }

  // Beschriftung
  if (layout.text) {
    const tx = layout.text;
    let size = tx.size;
    const w = measureText(design.frame.text, design.frame.font, size);
    if (w > tx.maxW) size *= tx.maxW / w;
    const baseline = tx.cy + (capHeight(design.frame.font) * size) / 2;
    const shapeT = textPath(design.frame.text, design.frame.font, size, tx.cx, baseline);
    if (shapeT.d) out.push(`<path d="${shapeT.d}" fill="${tx.color}"/>`);
    else out.push(`<text x="${r2(tx.cx)}" y="${r2(baseline)}" font-size="${r2(size)}" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="${tx.color}">${escapeXml(design.frame.text)}</text>`);
  }
  out.push('</svg>');

  return {
    svg: out.join(''),
    meta: {
      version: mx.version,
      modules: N,
      ec,
      mask: mx.mask,
      payloadBytes: new TextEncoder().encode(payload).length,
      logoCoverage: dataModules ? covered / dataModules : 0,
      moduleFraction: U / W,
      width: W,
      height: H,
    },
  };
}
