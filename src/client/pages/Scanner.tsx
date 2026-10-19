// Scanner: vorhandene QR-Codes lesen (Bild, Screenshot, Kamera) und im Studio neu gestalten.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ClipboardPaste, Copy, ImageUp, Pencil, ScanLine, StopCircle } from 'lucide-react';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { detectContent } from '@shared/detect';
import { getType } from '@shared/content';
import { toast, toastError } from '../lib/toast';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CodeListItem } from '../lib/types';
import { Glyph } from '../components/ui';

let prepared = false;
function ensure() {
  if (prepared) return;
  // WASM wird lokal ausgeliefert, kein Zugriff auf externe CDNs
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
  prepared = true;
}

interface Hit { text: string; format: string }

/** SVG (z. B. eigene Exporte) vor dem Lesen rastern; Decoder verstehen nur Pixelbilder. */
async function rasterize(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('svg')); i.src = url; });
    const w = 1200;
    const h = Math.round(w * ((img.naturalHeight || img.height || 1) / (img.naturalWidth || img.width || 1)));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeBlob(input: Blob): Promise<Hit[]> {
  ensure();
  const blob = input.type === 'image/svg+xml' || (input instanceof File && /\.svg$/i.test(input.name)) ? await rasterize(input) : input;
  const res = await readBarcodes(blob, { formats: ['QRCode', 'MicroQRCode', 'DataMatrix', 'Aztec', 'PDF417'], tryHarder: true, tryInvert: true, maxNumberOfSymbols: 8 });
  return res.filter((r) => r.isValid).map((r) => ({ text: r.text, format: r.format }));
}

/** Erkennt Kurzlinks dieser Tessera-Instanz und bietet an, den Code in der Bibliothek zu öffnen. */
function OwnCode({ text }: { text: string }) {
  const navigate = useNavigate();
  const slug = /\/r\/([A-Za-z0-9_-]{3,64})\/?$/.exec(text)?.[1];
  const found = useQuery({
    queryKey: ['own-code', slug], enabled: !!slug,
    queryFn: () => api.get<{ items: CodeListItem[] }>(`/api/codes?q=${encodeURIComponent(slug!)}&kind=dynamic&limit=5`),
  });
  const hit = found.data?.items.find((c) => c.slug === slug);
  if (!hit) return null;
  return <button className="btn" onClick={() => navigate(`/codes/${hit.id}`)}>Dieser Code ist „{hit.name}“ – öffnen</button>;
}

export function ScannerPage() {
  const navigate = useNavigate();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = async (blob: Blob) => {
    if (!blob.type.startsWith('image/') && !(blob instanceof File && /\.(svg|png|jpe?g|gif|webp|bmp|heic)$/i.test(blob.name))) {
      toastError(new Error('Bitte wähle ein Bild (PNG, JPG, SVG oder Screenshot). Archive und Dokumente kann der Scanner nicht lesen.'));
      return;
    }
    setBusy(true);
    setImage((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    try {
      setHits(await decodeBlob(blob));
    } catch (e) {
      console.error(e);
      toastError(new Error('Das Bild konnte nicht gelesen werden. Versuche ein anderes Format (PNG oder JPG).'));
    } finally { setBusy(false); }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); void handle(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('paste', onPaste); stopCamera(); };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera(false);
  };

  const startCamera = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toastError(new Error('Die Kamera ist nur über HTTPS oder localhost verfügbar. Lade stattdessen ein Foto hoch.'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
      streamRef.current = stream;
      setCamera(true);
      setHits(null);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
      const canvas = document.createElement('canvas');
      const tick = async () => {
        const v = videoRef.current;
        if (!streamRef.current) return;
        if (v && v.videoWidth) {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0);
          ensure();
          const res = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: ['QRCode'], maxNumberOfSymbols: 1 });
          const hit = res.find((r) => r.isValid);
          if (hit) { setHits([{ text: hit.text, format: hit.format }]); stopCamera(); return; }
        }
        setTimeout(tick, 180);
      };
      void tick();
    } catch {
      toastError(new Error('Kein Zugriff auf die Kamera. Erlaube den Zugriff im Browser oder lade ein Foto hoch.'));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>Scanner</h1>
          <p className="muted">Lies einen vorhandenen Code aus einem Bild und gestalte ihn im Studio neu. Alles bleibt auf diesem Gerät.</p>
        </div>
      </div>
      <div className="batch-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="stack">
          {camera ? (
            <div className="panel-card" style={{ overflow: 'hidden', position: 'relative' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block' }} />
              <button className="btn" style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)' }} onClick={stopCamera}><StopCircle size={15} /> Kamera beenden</button>
            </div>
          ) : (
            <div className="dropzone" style={{ padding: 36, minHeight: 260, justifyContent: 'center' }} role="button" tabIndex={0}
              onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}>
              {image ? <img src={image} alt="Hochgeladenes Bild" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 8 }} /> : <ImageUp size={28} />}
              <b>{busy ? 'Wird gelesen …' : 'Bild ablegen oder auswählen'}</b>
              <span className="small faint"><ClipboardPaste size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Screenshots kannst du auch mit ⌘V einfügen</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,.svg" hidden data-testid="scan-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handle(f); }} />
          {!camera && <button className="btn" onClick={startCamera}><Camera size={15} /> Mit der Kamera scannen</button>}
        </div>
        <div className="stack" aria-live="polite">
          {hits === null && !busy && <div className="empty" style={{ padding: 24 }}><ScanLine size={28} /><p>Das Ergebnis erscheint hier.</p></div>}
          {hits?.length === 0 && <div className="notice notice-warn"><ScanLine size={16} /><div><b>Kein Code gefunden.</b> Nimm ein schärferes Foto auf, bei dem der Code mehr Fläche einnimmt.</div></div>}
          {hits?.map((h, i) => {
            const det = detectContent(h.text);
            const t = getType(det.type);
            return (
              <div className="panel-card" style={{ padding: 16 }} key={i} data-testid="scan-hit">
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="type-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Glyph id={t.icon} /></span>
                  <div className="grow"><b>{t.label}</b><div className="faint small">{h.format} · {det.reason}</div></div>
                </div>
                <div className="code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>{h.text}</div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={() => navigate('/neu', { state: { type: det.type, content: det.content } })}><Pencil size={15} /> Im Studio gestalten</button>
                  <button className="btn" onClick={() => { void navigator.clipboard.writeText(h.text); toast('Inhalt kopiert'); }}><Copy size={15} /> Kopieren</button>
                  {/^https?:\/\//i.test(h.text) && <a className="btn btn-ghost" href={h.text} target="_blank" rel="noopener noreferrer nofollow">Link öffnen</a>}
                  <OwnCode text={h.text} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
