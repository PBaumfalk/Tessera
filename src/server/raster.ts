// Rasterung (resvg) und Dekodierung (ZXing-C++ als WASM, jsQR) auf dem Server.
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import jsQR from 'jsqr';
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import { FONTS } from '../shared/design';
import { registerFont } from '../shared/text';

export const ASSETS_DIR = process.env.ASSETS_DIR ?? path.resolve(process.cwd(), 'assets');

let fontsLoaded = false;
export function loadServerFonts(): void {
  if (fontsLoaded) return;
  for (const f of FONTS) {
    const buf = fs.readFileSync(path.join(ASSETS_DIR, 'fonts', f.file));
    registerFont(f.id, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  fontsLoaded = true;
}

let zxingReady: Promise<unknown> | null = null;
function ensureZxing() {
  if (!zxingReady) {
    const wasmPath = process.env.ZXING_WASM ?? path.resolve(process.cwd(), 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');
    zxingReady = Promise.resolve(
      prepareZXingModule({
        overrides: {
          wasmBinary: fs.readFileSync(wasmPath).buffer as ArrayBuffer,
        },
        fireImmediately: true,
      }),
    );
  }
  return zxingReady;
}

export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function svgToPng(svg: string, width: number, opts: { background?: string; dpi?: number } = {}): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(width) },
    background: opts.background,
    font: { loadSystemFonts: false },
    imageRendering: 0,
    shapeRendering: 2,
  });
  const png = Buffer.from(r.render().asPng());
  return opts.dpi ? setPngDpi(png, opts.dpi) : png;
}

export function svgToRgba(svg: string, width: number, background = '#ffffff'): Rgba {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(width) }, background, font: { loadSystemFonts: false } });
  const img = r.render();
  return { data: new Uint8ClampedArray(img.pixels), width: img.width, height: img.height };
}

/** Setzt die Auflösung (pHYs-Chunk), damit Druckprogramme die physische Größe kennen. */
export function setPngDpi(png: Buffer, dpi: number): Buffer {
  const ppm = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data.writeUInt8(1, 8);
  const type = Buffer.from('pHYs');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(9, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 0);
  const chunk = Buffer.concat([len, type, data, crc]);
  // nach IHDR einfügen (8 Byte Signatur + 25 Byte IHDR)
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function decodeZxing(img: Rgba): Promise<string | null> {
  await ensureZxing();
  const res = await readBarcodes(
    { data: img.data, width: img.width, height: img.height, colorSpace: 'srgb' } as unknown as ImageData,
    { formats: ['QRCode'], tryHarder: true, tryInvert: true, maxNumberOfSymbols: 1 },
  );
  const hit = res.find((r) => r.isValid);
  return hit ? hit.text : null;
}

export function decodeJsqr(img: Rgba): string | null {
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  if (!res) return null;
  // jsQR liefert Bytes; als UTF-8 deuten wie Smartphones
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(res.binaryData));
  } catch {
    return res.data;
  }
}
