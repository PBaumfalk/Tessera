// Exporte: SVG, PNG (mit DPI), PDF (Vektor, optional mit Beschnitt und Schnittmarken),
// ZIP-Archive und Etikettenbögen.
import path from 'node:path';
import { PassThrough } from 'node:stream';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { ZipArchive } from 'archiver';
import { Resvg } from '@resvg/resvg-js';
import { renderSvg } from '../shared/render';
import type { Design, EcLevel } from '../shared/design';
import { ASSETS_DIR, svgToPng } from './raster';
import { fail } from './errors';
import { yieldToLoop } from './jobs';

export type ExportFormat = 'svg' | 'png' | 'pdf';
export const MM_TO_PT = 72 / 25.4;

export interface ExportOptions {
  format: ExportFormat;
  /** Pixelbreite für PNG */
  size?: number;
  dpi?: number;
  /** Breite in Millimetern für PDF und SVG */
  mm?: number;
  /** Schnittmarken und 3 mm Beschnitt im PDF */
  crop?: boolean;
}

export interface ExportItem {
  name: string;
  payload: string;
  design: Design;
  minEc?: EcLevel;
  /** Inhalt enthält vertrauliche Daten (z. B. WLAN-Passwort) und erscheint nicht in der Übersicht. */
  sensitive?: boolean;
}

export const MIME: Record<ExportFormat, string> = { svg: 'image/svg+xml', png: 'image/png', pdf: 'application/pdf' };

function clampOpts(o: ExportOptions): Required<ExportOptions> {
  const size = Math.round(Math.min(8000, Math.max(64, Number(o.size) || 1024)));
  const dpi = Math.round(Math.min(2400, Math.max(72, Number(o.dpi) || 300)));
  const mm = Math.min(1000, Math.max(10, Number(o.mm) || 50));
  return { format: o.format, size, dpi, mm, crop: !!o.crop };
}

/** svg-to-pdfkit kann nur PNG/JPEG einbetten. SVG-Logos werden hochauflösend gerastert. */
function pdfSafeSvg(svg: string): string {
  return svg.replace(/href="data:image\/(svg\+xml|webp);base64,([^"]+)"/g, (_m, kind: string, b64: string) => {
    if (kind === 'svg+xml') {
      try {
        const png = new Resvg(Buffer.from(b64, 'base64').toString('utf8'), { fitTo: { mode: 'width', value: 1600 } }).render().asPng();
        return `href="data:image/png;base64,${Buffer.from(png).toString('base64')}"`;
      } catch {
        return 'href=""';
      }
    }
    return 'href=""';
  });
}

function drawSvg(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, w: number, h: number) {
  SVGtoPDF(doc, pdfSafeSvg(svg), x, y, { width: w, height: h, preserveAspectRatio: 'xMidYMid meet', assumePt: true });
}

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function exportOne(item: ExportItem, opts: ExportOptions): Promise<{ buf: Buffer; mime: string; ext: string }> {
  const o = clampOpts(opts);
  const { svg, meta } = renderSvg(item.payload, item.design, { minEc: item.minEc, idPrefix: 'x' });
  const ratio = meta.height / meta.width;
  if (o.format === 'svg') {
    const sized = svg.replace('<svg ', `<svg width="${o.mm}mm" height="${Math.round(o.mm * ratio * 100) / 100}mm" `);
    return { buf: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${sized}\n`, 'utf8'), mime: MIME.svg, ext: 'svg' };
  }
  if (o.format === 'png') {
    return { buf: svgToPng(svg, o.size, { dpi: o.dpi }), mime: MIME.png, ext: 'png' };
  }
  if (o.format === 'pdf') {
    const w = o.mm * MM_TO_PT;
    const h = w * ratio;
    const bleed = o.crop ? 3 * MM_TO_PT : 0;
    const marks = o.crop ? 10 * MM_TO_PT : 0;
    const doc = new PDFDocument({
      size: [w + 2 * (bleed + marks), h + 2 * (bleed + marks)],
      margin: 0,
      info: { Title: item.name, Creator: 'Tessera QR-Studio', Producer: 'Tessera' },
      autoFirstPage: true,
    });
    const ox = bleed + marks;
    const oy = bleed + marks;
    drawSvg(doc, svg, ox, oy, w, h);
    if (o.crop) {
      doc.save().lineWidth(0.25).strokeColor('#000000');
      const gap = bleed + 2 * MM_TO_PT;
      const len = marks - 2 * MM_TO_PT;
      for (const x of [ox, ox + w]) {
        doc.moveTo(x, oy - gap).lineTo(x, oy - gap - len).stroke();
        doc.moveTo(x, oy + h + gap).lineTo(x, oy + h + gap + len).stroke();
      }
      for (const y of [oy, oy + h]) {
        doc.moveTo(ox - gap, y).lineTo(ox - gap - len, y).stroke();
        doc.moveTo(ox + w + gap, y).lineTo(ox + w + gap + len, y).stroke();
      }
      doc.restore();
    }
    return { buf: await pdfToBuffer(doc), mime: MIME.pdf, ext: 'pdf' };
  }
  throw fail(400, 'Dieses Dateiformat wird nicht unterstützt.');
}

export function safeFileName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'qr-code';
}

export interface SheetOptions {
  paper: 'A4' | 'A3' | 'LETTER';
  cols: number;
  rows: number;
  /** Beschriftung unter jedem Code */
  labels: boolean;
  marginMm: number;
}

/** Etikettenbogen: mehrere Codes pro Seite im Raster, mit optionaler Beschriftung. */
export async function labelSheet(items: ExportItem[], s: SheetOptions): Promise<Buffer> {
  const papers = { A4: [210, 297], A3: [297, 420], LETTER: [215.9, 279.4] } as const;
  const [pw, ph] = papers[s.paper] ?? papers.A4;
  const cols = Math.min(10, Math.max(1, Math.round(s.cols)));
  const rows = Math.min(14, Math.max(1, Math.round(s.rows)));
  const margin = Math.min(30, Math.max(0, s.marginMm)) * MM_TO_PT;
  const doc = new PDFDocument({ size: [pw * MM_TO_PT, ph * MM_TO_PT], margin: 0, autoFirstPage: false, info: { Title: 'Etikettenbogen', Creator: 'Tessera QR-Studio' } });
  doc.registerFont('label', path.join(ASSETS_DIR, 'fonts', 'instrument-600.woff'));
  const cellW = (pw * MM_TO_PT - 2 * margin) / cols;
  const cellH = (ph * MM_TO_PT - 2 * margin) / rows;
  const labelH = s.labels ? Math.min(14, cellH * 0.14) : 0;
  const perPage = cols * rows;
  items.forEach((it, i) => {
    if (i % perPage === 0) doc.addPage();
    const k = i % perPage;
    const cx = margin + (k % cols) * cellW;
    const cy = margin + Math.floor(k / cols) * cellH;
    const { svg, meta } = renderSvg(it.payload, it.design, { minEc: it.minEc, idPrefix: `s${i}` });
    const pad = Math.min(cellW, cellH) * 0.08;
    const availW = cellW - 2 * pad;
    const availH = cellH - 2 * pad - labelH;
    const ratio = meta.height / meta.width;
    const w = Math.min(availW, availH / ratio);
    const h = w * ratio;
    drawSvg(doc, svg, cx + (cellW - w) / 2, cy + pad + (availH - h) / 2, w, h);
    if (s.labels) {
      doc.font('label').fontSize(Math.max(5, labelH * 0.62)).fillColor('#111111');
      doc.text(it.name, cx + pad, cy + cellH - pad - labelH + 1, { width: availW, align: 'center', lineBreak: false, ellipsis: true, height: labelH });
    }
    // feine Schneidelinien
    doc.save().lineWidth(0.2).strokeColor('#cccccc').dash(2, { space: 2 }).rect(cx, cy, cellW, cellH).stroke().undash().restore();
  });
  if (!items.length) doc.addPage();
  return pdfToBuffer(doc);
}

/** Streamt ein ZIP mit allen Codes in den gewünschten Formaten und einer Übersicht als CSV. */
export function zipStream(items: ExportItem[], formats: ExportFormat[], opts: Omit<ExportOptions, 'format'>, manifestRows?: string[][]): PassThrough {
  const out = new PassThrough();
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on('error', (e: Error) => out.destroy(e));
  zip.pipe(out);
  (async () => {
    const used = new Set<string>();
    const csv: string[][] = [['Name', 'Datei', 'Inhalt']];
    for (const it of items) {
      if (out.destroyed) return; // Browser hat abgebrochen
      await yieldToLoop();
      let base = safeFileName(it.name);
      let n = 2;
      while (used.has(base.toLowerCase())) base = `${safeFileName(it.name)}-${n++}`;
      used.add(base.toLowerCase());
      for (const f of formats) {
        const file = await exportOne(it, { ...opts, format: f });
        zip.append(file.buf, { name: formats.length > 1 ? `${f}/${base}.${file.ext}` : `${base}.${file.ext}` });
      }
      csv.push([it.name, base, it.sensitive ? '(vertraulich, nicht aufgeführt)' : it.payload]);
    }
    const rows = manifestRows ?? csv;
    const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    zip.append('﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n'), { name: 'uebersicht.csv' });
    await zip.finalize();
  })().catch((e) => out.destroy(e));
  return out;
}
