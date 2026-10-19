import { renderSvg } from '../../src/shared/render';
import type { Design } from '../../src/shared/design';
import { decodeJsqr, decodeZxing, loadServerFonts, svgToRgba } from '../../src/server/raster';

loadServerFonts();

/** Rendert wie der Export und liest mit beiden Decodern. */
export async function roundtrip(payload: string, design: Design, minEc?: 'L' | 'M' | 'Q' | 'H') {
  const { svg, meta } = renderSvg(payload, design, { minEc });
  const img = svgToRgba(svg, Math.round(6 / meta.moduleFraction));
  return { zxing: await decodeZxing(img), jsqr: decodeJsqr(img), meta };
}
