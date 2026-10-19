declare module 'svg-to-pdfkit' {
  const SVGtoPDF: (doc: PDFKit.PDFDocument, svg: string, x: number, y: number, opts?: Record<string, unknown>) => void;
  export default SVGtoPDF;
}
declare module 'qrcode/lib/core/qrcode.js';
