// Exportdialog: Format, Größe, Druckmaße, Kopieren, Teilen.
import { useEffect, useState } from 'react';
import { Clipboard, Download, Ruler, Share2, ShieldAlert } from 'lucide-react';
import { minWidthForDistance } from '@shared/analyze';
import type { Design } from '@shared/design';
import type { RenderMeta } from '@shared/render';
import { api, saveBlob } from '../lib/api';
import { toast, toastError } from '../lib/toast';
import { Dialog, Field, Seg, Switch, TextInput } from '../components/ui';

type Format = 'png' | 'svg' | 'pdf';

export function ExportDialog({ open, onOpenChange, payload, design, minEc, name, meta, failing, printMm }: {
  open: boolean; onOpenChange: (v: boolean) => void; payload: string | null; design: Design; minEc?: string; name: string;
  meta: RenderMeta | null; failing: boolean; printMm: number;
}) {
  const [format, setFormat] = useState<Format>('png');
  const [size, setSize] = useState(2048);
  const [dpi, setDpi] = useState(300);
  const [mm, setMm] = useState(printMm);
  const [crop, setCrop] = useState(false);
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(false);
  const [distance, setDistance] = useState(1);
  // Druckbreite aus der Vorschau übernehmen, sobald der Dialog geöffnet wird
  useEffect(() => { if (open) { setMm(printMm); setOverride(false); } }, [open, printMm]);
  const blocked = failing && !override;
  const fileName = file || name || 'qr-code';

  const request = async (fmt: Format = format) => {
    if (!payload) throw new Error('Der Code hat noch keinen vollständigen Inhalt.');
    return api.file('/api/render', { payload, design, minEc, format: fmt, size, dpi, mm, crop, name: fileName });
  };

  const download = async () => {
    setBusy(true);
    try {
      const r = await request();
      saveBlob(r.blob, r.name);
      toast(`${format.toUpperCase()} heruntergeladen`);
      onOpenChange(false);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  const copyImage = async () => {
    setBusy(true);
    try {
      if (!('ClipboardItem' in window)) throw new Error('Dein Browser kann keine Bilder in die Zwischenablage kopieren.');
      // Safari verlangt, dass ClipboardItem synchron im Klick entsteht
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': request('png').then((r) => r.blob) })]);
      toast('Bild kopiert. In Word, Outlook oder Teams einfügen.');
    } catch (e) {
      toastError(e instanceof Error && e.name === 'NotAllowedError' ? new Error('Der Browser hat das Kopieren blockiert. Nutze den Download.') : e);
    } finally { setBusy(false); }
  };

  const share = async () => {
    setBusy(true);
    try {
      const r = await request('png');
      const f = new File([r.blob], r.name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: fileName });
      else throw new Error('Teilen wird auf diesem Gerät nicht unterstützt.');
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) toastError(e);
    } finally { setBusy(false); }
  };

  const pxMm = (size / dpi) * 25.4;
  const recommended = meta ? Math.ceil(minWidthForDistance(distance * 100, meta)) : 0;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Exportieren" wide
      footer={<>
        {canShare && <button className="btn" onClick={share} disabled={busy || blocked || !payload}><Share2 size={15} /> Teilen</button>}
        <button className="btn" onClick={copyImage} disabled={busy || blocked || !payload}><Clipboard size={15} /> Als Bild kopieren</button>
        <button className="btn btn-primary" onClick={download} disabled={busy || blocked || !payload} data-testid="export-download"><Download size={15} /> {busy ? 'Wird erstellt …' : `${format.toUpperCase()} herunterladen`}</button>
      </>}>
      <div className="stack" style={{ gap: 18 }}>
        {failing && (
          <div className="notice notice-fail">
            <ShieldAlert size={16} />
            <div className="stack" style={{ gap: 8 }}>
              <div><b>Dieser Code ist wahrscheinlich nicht lesbar.</b> Die Testscans sind fehlgeschlagen. Übernimm die Vorschläge der Lesbarkeitsprüfung, bevor du ihn verwendest.</div>
              <Switch label="Ich weiß das und möchte trotzdem exportieren" checked={override} onChange={setOverride} />
            </div>
          </div>
        )}
        <div className="format-cards" role="group" aria-label="Dateiformat">
          {([
            ['png', 'PNG', 'Für Web, Office, Messenger und Präsentationen'],
            ['svg', 'SVG', 'Vektor für Webseiten und Grafikprogramme'],
            ['pdf', 'PDF', 'Druckfertiger Vektor mit exakten Maßen'],
          ] as const).map(([id, label, text]) => (
            <button key={id} className="format-card" aria-pressed={format === id} onClick={() => setFormat(id)}><b>{label}</b><span>{text}</span></button>
          ))}
        </div>
        <div className="grid2">
          {format === 'png' ? (
            <>
              <Field label="Breite in Pixeln" htmlFor="px">
                <select id="px" className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                  {[256, 512, 1024, 2048, 4096, 8000].map((v) => <option key={v} value={v}>{v} px{v === 512 ? ' · Web' : v === 2048 ? ' · Druck' : v === 8000 ? ' · Plakat' : ''}</option>)}
                </select>
              </Field>
              <Field label="Auflösung" htmlFor="dpi" help={`Entspricht ${pxMm.toFixed(0)} mm Druckbreite bei ${dpi} dpi.`}>
                <select id="dpi" className="select" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                  {[72, 150, 300, 600, 1200].map((v) => <option key={v} value={v}>{v} dpi</option>)}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Breite in Millimetern" htmlFor="mm">
                <TextInput id="mm" type="number" min={10} max={1000} value={mm} onChange={(e) => setMm(Number(e.target.value))} />
              </Field>
              {format === 'pdf' ? (
                <div style={{ alignSelf: 'end', paddingBottom: 8 }}><Switch label="Schnittmarken und 3 mm Beschnitt" checked={crop} onChange={setCrop} /></div>
              ) : <div />}
            </>
          )}
          <Field label="Dateiname" htmlFor="fname" className="full"><TextInput id="fname" value={file} placeholder={name || 'qr-code'} onChange={(e) => setFile(e.target.value)} /></Field>
        </div>
        {meta && (
          <div className="panel-card" style={{ padding: 14, background: 'var(--surface-2)' }}>
            <div className="row" style={{ marginBottom: 8 }}><Ruler size={16} className="faint" /><b>Wie groß drucken?</b></div>
            <div className="row wrap" style={{ gap: 10 }}>
              <span className="muted">Scan-Entfernung</span>
              <Seg label="Scan-Entfernung" value={String(distance)} onChange={(v) => setDistance(Number(v))}
                options={[{ value: '0.3', label: '30 cm' }, { value: '1', label: '1 m' }, { value: '2', label: '2 m' }, { value: '5', label: '5 m' }, { value: '10', label: '10 m' }]} />
            </div>
            <p style={{ marginTop: 10 }}>Mindestens <b>{recommended >= 100 ? `${(recommended / 10).toFixed(0)} cm` : `${recommended} mm`}</b> breit drucken.
              <span className="faint"> Faustregel: Entfernung geteilt durch 10, jedes Modul mindestens 0,5 mm.</span></p>
            {format !== 'png' && mm < recommended && <p style={{ marginTop: 6, color: 'var(--warn)' }}>Die gewählte Breite von {mm} mm ist für diese Entfernung zu klein.</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
