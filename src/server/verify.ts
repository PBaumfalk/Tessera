// Scan-Prüfung: Rendert den Code wie beim Export und dekodiert ihn unter erschwerten
// Bedingungen mit zwei unabhängigen Decodern (ZXing-C++ und jsQR).
import { renderSvg } from '../shared/render';
import type { Design, EcLevel } from '../shared/design';
import { decodeJsqr, decodeZxing, svgToRgba, type Rgba } from './raster';

export interface ScenarioResult {
  id: string;
  label: string;
  zxing: boolean;
  jsqr: boolean;
}

export interface VerifyResult {
  grade: 'good' | 'fair' | 'fail';
  score: number;
  scenarios: ScenarioResult[];
  decodedMatches: boolean;
  ms: number;
}

function boxBlur(img: Rgba, radius: number): Rgba {
  const { width: w, height: h } = img;
  const src = img.data;
  const tmp = new Float32Array(w * h * 3);
  const out = new Uint8ClampedArray(src.length);
  const k = 2 * radius + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -radius; i <= radius; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        const o = (y * w + xx) * 4;
        r += src[o]; g += src[o + 1]; b += src[o + 2];
      }
      const t = (y * w + x) * 3;
      tmp[t] = r / k; tmp[t + 1] = g / k; tmp[t + 2] = b / k;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -radius; i <= radius; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        const t = (yy * w + x) * 3;
        r += tmp[t]; g += tmp[t + 1]; b += tmp[t + 2];
      }
      const o = (y * w + x) * 4;
      out[o] = r / k; out[o + 1] = g / k; out[o + 2] = b / k; out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Schwaches, ungleichmäßiges Licht: Kontrast stauchen, Verlauf und Rauschen. */
function dim(img: Rgba, seed = 7): Rgba {
  const out = new Uint8ClampedArray(img.data.length);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  for (let y = 0; y < img.height; y++) {
    const shade = 0.75 + 0.25 * (y / img.height);
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = 110 + (img.data[o + c] - 128) * 0.5;
        out[o + c] = v * shade + rnd() * 26;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: img.width, height: img.height };
}

/** Drehung und leichte Scherung mit bilinearer Abtastung (schräg gehaltene Kamera). */
export function tilt(input: Rgba, deg: number, shear: number): Rgba {
  // Weißen Rand ergänzen, damit die Ecken beim Drehen nicht abgeschnitten werden
  const pad = Math.round(input.width * 0.3);
  const w = input.width + 2 * pad, h = input.height + 2 * pad;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < input.height; y++) {
    data.set(input.data.subarray(y * input.width * 4, (y + 1) * input.width * 4), ((y + pad) * w + pad) * 4);
  }
  const out = new Uint8ClampedArray(data.length).fill(255);
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = cos * dx + sin * dy + shear * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const o = (y * w + x) * 4;
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = data[(y0 * w + x0) * 4 + c], p10 = data[(y0 * w + x0 + 1) * 4 + c];
        const p01 = data[((y0 + 1) * w + x0) * 4 + c], p11 = data[((y0 + 1) * w + x0 + 1) * 4 + c];
        out[o + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
    }
  }
  return { data: out, width: w, height: h };
}

/** Prüft, ob ein Bild auf der vorgesehenen Fläche liegt (Transparenz wird auf Weiß gelegt). */
export async function verifyDesign(payload: string, design: Design, minEc?: EcLevel): Promise<VerifyResult> {
  const t0 = Date.now();
  const { svg, meta } = renderSvg(payload, design, { minEc, idPrefix: 'v' });
  const totalModules = 1 / meta.moduleFraction;
  // Bildgröße begrenzen, damit auch sehr dichte Codes die Prüfung nicht ausbremsen
  const px = (perModule: number) => Math.min(1100, Math.max(64, Math.round(totalModules * perModule)));

  // Jede Situation wird in mehreren Maßstäben geprüft (wie eine Kamera aus wechselnder Entfernung).
  // Ein Decoder gilt als erfolgreich, wenn er die Mehrheit der Maßstäbe liest.
  const scenarios: { id: string; label: string; weight: number; images: () => Rgba[] }[] = [
    { id: 'clean', label: 'Ideale Bedingungen', weight: 3, images: () => [4, 5.5, 8].map((k) => svgToRgba(svg, px(k))) },
    { id: 'small', label: 'Kleine Darstellung', weight: 2, images: () => [2.2, 2.7, 3.2].map((k) => svgToRgba(svg, px(k))) },
    { id: 'blur', label: 'Unscharfe Kamera', weight: 2, images: () => [5, 7, 9].map((k) => boxBlur(svgToRgba(svg, px(k)), Math.max(1, Math.round(k * 0.34)))) },
    { id: 'dim', label: 'Schwaches Licht', weight: 2, images: () => [4, 5.5, 8].map((k, i) => dim(svgToRgba(svg, px(k)), 7 + i)) },
    { id: 'tilt', label: 'Schräg gehalten', weight: 1, images: () => [[5, 14, 0.12], [7, -9, 0.08], [6, 22, 0]].map(([k, deg, sh]) => tilt(svgToRgba(svg, px(k)), deg, sh)) },
  ];

  const results: ScenarioResult[] = [];
  let score = 0;
  let max = 0;
  let decodedMatches = true;
  for (const sc of scenarios) {
    await new Promise<void>((r) => setImmediate(r));
    const imgs = sc.images();
    let z = 0;
    let j = 0;
    for (const img of imgs) {
      const zr = await decodeZxing(img);
      if (sc.id === 'clean' && zr !== null && zr !== payload) decodedMatches = false;
      if (zr === payload) z++;
      if (decodeJsqr(img) === payload) j++;
    }
    const need = Math.ceil(imgs.length / 2);
    const zx = z >= need;
    const jq = j >= need;
    results.push({ id: sc.id, label: sc.label, zxing: zx, jsqr: jq });
    score += sc.weight * (0.6 * (z / imgs.length) + 0.4 * (j / imgs.length));
    max += sc.weight;
  }
  const pct = Math.round((score / max) * 100);
  const cleanRes = results[0];
  const grade: VerifyResult['grade'] = !cleanRes.zxing || !decodedMatches ? 'fail' : pct >= 85 ? 'good' : pct >= 55 ? 'fair' : 'fail';
  return { grade, score: pct, scenarios: results, decodedMatches, ms: Date.now() - t0 };
}
