// Bühne: der Code als Andruck mit Passermarken, Maßangabe und Untergrund-Test.
import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, Loader2, ScanLine, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { CheckStatus } from '@shared/analyze';
import { sensitiveKeys } from '@shared/content';
import { useEditor } from '../lib/editor-store';
import { toast } from '../lib/toast';
import { Seg, Tip } from '../components/ui';
import type { QrState } from './useQr';

type Surface = 'paper' | 'dark' | 'kraft' | 'photo' | 'checker';

function RegMark({ pos }: { pos: string }) {
  return (
    <svg className={`reg ${pos}`} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M11 0v22M0 11h22" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function Proof({ qr, printMm, surface }: { qr: QrState; printMm: number; surface: Surface }) {
  const ratio = qr.meta ? qr.meta.height / qr.meta.width : 1;
  return (
    <div className="proof" data-surface={surface === 'paper' ? undefined : surface} data-testid="proof">
      <RegMark pos="tl" /><RegMark pos="tr" /><RegMark pos="bl" /><RegMark pos="br" />
      <div className="proof-size">{printMm} × {Math.round(printMm * ratio)} mm</div>
      <div className={`proof-art ${qr.placeholder ? 'placeholder' : ''}`} data-testid="qr-preview" style={qr.svg ? undefined : { aspectRatio: '1' }}
        dangerouslySetInnerHTML={{ __html: qr.svg ?? '' }} />
      {(qr.placeholder || qr.capacityError) && (
        <div className="proof-empty"><span>{qr.capacityError ? 'Zu viele Daten für einen QR-Code' : 'Vorschau mit Beispielinhalt'}</span></div>
      )}
      <div className="colorbar" aria-hidden="true">
        <i style={{ background: '#00a0e9' }} /><i style={{ background: '#e4007f' }} /><i style={{ background: '#fff100' }} /><i style={{ background: '#111' }} />
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<CheckStatus | 'wait', { title: string; icon: typeof ShieldCheck }> = {
  ok: { title: 'Sicher scannbar', icon: ShieldCheck },
  warn: { title: 'Scannbar, mit Einschränkungen', icon: AlertTriangle },
  fail: { title: 'Wahrscheinlich nicht lesbar', icon: ShieldAlert },
  wait: { title: 'Lesbarkeit wird geprüft', icon: ScanLine },
};

export function ScanPanel({ qr, defaultOpen = false }: { qr: QrState; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const setDesign = useEditor((s) => s.setDesign);
  const st = qr.payload || qr.capacityError ? qr.status : 'wait';
  const info = STATUS_TEXT[st];
  const Icon = qr.verifying && st === 'wait' ? Loader2 : info.icon;
  const v = qr.verify;
  const passes = v ? v.scenarios.reduce((n, s) => n + (s.zxing ? 1 : 0) + (s.jsqr ? 1 : 0), 0) : 0;
  const total = v ? v.scenarios.length * 2 : 10;
  const hints = qr.checks.filter((c) => c.status !== 'ok').length;
  const sub = qr.capacityError
    ? 'Zu viele Daten für einen QR-Code.'
    : !qr.payload
    ? 'Startet, sobald der Inhalt vollständig ist.'
    : v
      ? `${passes} von ${total} Testscans erfolgreich${hints ? ` · ${hints} ${hints === 1 ? 'Hinweis' : 'Hinweise'}` : ''}${qr.verifying ? ' · prüfe erneut …' : ''}`
      : qr.verifying ? 'Testscans laufen …' : 'Testscans gerade nicht verfügbar, nur Regelprüfung';
  const fixable = qr.checks.filter((c) => c.status !== 'ok' && c.fix);
  return (
    <section className="scan" aria-label="Lesbarkeitsprüfung" data-testid="scan-panel" data-status={st}>
      <button className="scan-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`scan-signal ${st}`}><Icon size={18} className={qr.verifying && st === 'wait' ? 'spin' : undefined} /></span>
        <span className="grow">
          <span className="scan-title" data-testid="scan-title">{qr.payload || qr.capacityError ? info.title : 'Lesbarkeit'}</span>
          <span className="scan-sub" style={{ display: 'block' }}>{sub}</span>
        </span>
        <span className="scan-meter" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => {
            const sc = v?.scenarios[i];
            const on = sc ? sc.zxing && sc.jsqr : false;
            const half = sc ? sc.zxing || sc.jsqr : false;
            return <i key={i} className={on ? 'on ok' : half ? 'on warn' : sc ? 'on fail' : ''} />;
          })}
        </span>
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="scan-body">
          {qr.checks.map((c) => (
            <div className="check" key={c.id}>
              {c.status === 'ok' ? <Check size={15} className="ok" /> : c.status === 'warn' ? <AlertTriangle size={15} className="warn" /> : <X size={15} className="fail" />}
              <div><b>{c.label}</b><p>{c.detail}</p></div>
              {c.fix && c.status !== 'ok' ? <button className="btn btn-sm" onClick={() => setDesign(c.fix!.patch)}>{c.fix.label}</button> : <span />}
            </div>
          ))}
          {v && (
            <>
              <div className="scenarios" role="table" aria-label="Testscans">
                <span className="h" role="columnheader">Simulierte Situation</span>
                <span className="h" role="columnheader" title="ZXing-C++ – Decoder vieler Android-Apps">ZXing</span>
                <span className="h" role="columnheader" title="jsQR – bewusst strenger Decoder">jsQR</span>
                {v.scenarios.map((s) => (
                  <ScenarioRow key={s.id} label={s.label} a={s.zxing} b={s.jsqr} />
                ))}
              </div>
              <p className="faint small" style={{ marginTop: 10 }}>
                Tessera rendert den Code exakt wie beim Export und liest ihn mit zwei unabhängigen Decodern.
              </p>
            </>
          )}
          {fixable.length > 1 && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }}
              onClick={() => setDesign((d) => fixable.reduce((acc, c) => c.fix!.patch(acc), d))}>Alle Vorschläge übernehmen</button>
          )}
        </div>
      )}
    </section>
  );
}

function ScenarioRow({ label, a, b }: { label: string; a: boolean; b: boolean }) {
  return (
    <>
      <span role="cell">{label}</span>
      <span role="cell" className={`tick ${a ? 'yes' : 'no'}`} aria-label={a ? 'gelesen' : 'nicht gelesen'}>{a ? <Check size={12} /> : <X size={12} />}</span>
      <span role="cell" className={`tick ${b ? 'yes' : 'no'}`} aria-label={b ? 'gelesen' : 'nicht gelesen'}>{b ? <Check size={12} /> : <X size={12} />}</span>
    </>
  );
}

/** Verdeckt sensible Werte (z. B. WLAN-Passwort) in der Anzeige des Inhalts. */
function maskPayload(payload: string, type: string, content: Record<string, string | boolean>): string {
  let out = payload;
  for (const k of sensitiveKeys(type)) {
    const v = content[k];
    if (typeof v !== 'string' || v.length < 3 || k === 'iban') continue;
    // Wert kann im Inhalt maskiert (WIFI/MECARD) oder URL-kodiert vorkommen
    const forms = [v.replace(/([\\;,:"])/g, '\\$1'), encodeURIComponent(v), v];
    for (const f of forms) out = out.split(f).join('•'.repeat(Math.min(12, v.length)));
  }
  return out;
}

export function Stage({ qr, printMm, setPrintMm }: { qr: QrState; printMm: number; setPrintMm: (v: number) => void }) {
  const [surface, setSurface] = useState<Surface>('paper');
  const type = useEditor((s) => s.type);
  const content = useEditor((s) => s.contents[s.type] ?? {});
  const copy = async () => {
    if (!qr.payload) return;
    await navigator.clipboard.writeText(qr.payload);
    toast('Inhalt kopiert');
  };
  return (
    <div className="stage">
      <div className="stage-tools">
        <Seg label="Untergrund" value={surface} onChange={setSurface} options={[
          { value: 'paper', label: 'Papier' }, { value: 'dark', label: 'Dunkel' }, { value: 'kraft', label: 'Karton' },
          { value: 'photo', label: 'Foto', title: 'Unruhiger Untergrund' }, { value: 'checker', label: 'Transparenz' },
        ]} />
        <label className="row small muted" style={{ gap: 6 }}>
          Druckbreite
          <select className="select" style={{ height: 32, width: 104 }} value={printMm} onChange={(e) => setPrintMm(Number(e.target.value))} aria-label="Druckbreite in Millimetern">
            {[15, 20, 25, 30, 40, 50, 70, 100, 150, 200, 300].map((v) => <option key={v} value={v}>{v} mm</option>)}
          </select>
        </label>
      </div>
      <Proof qr={qr} printMm={printMm} surface={surface} />
      {qr.payload && (
        <div className="payload-line">
          <code data-testid="payload">{maskPayload(qr.payload, type, content).replace(/\r?\n/g, ' ⏎ ')}</code>
          <Tip label="Inhalt kopieren"><button className="btn btn-ghost btn-sm btn-icon" onClick={copy} aria-label="Inhalt kopieren"><Copy size={14} /></button></Tip>
        </div>
      )}
      <ScanPanel qr={qr} />
    </div>
  );
}
