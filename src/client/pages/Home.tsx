// Start: Schnelleingabe mit Live-Vorschau, alle Inhaltstypen, zuletzt bearbeitete Codes.
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { detectContent } from '@shared/detect';
import { encodeContent, getType } from '@shared/content';
import { DEFAULT_DESIGN } from '@shared/design';
import { renderSvg } from '@shared/render';
import { api, saveBlob } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { toastError } from '../lib/toast';
import type { CodeListItem } from '../lib/types';
import { Glyph } from '../components/ui';
import { TypeGrid } from '../editor/ContentPanel';

export function HomePage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const q = useDebounced(text, 120);
  const det = useMemo(() => (q.trim() ? detectContent(q) : null), [q]);
  const enc = det ? encodeContent(det.type, { ...getType(det.type).defaults, ...det.content }) : null;
  const payload = enc?.payload ?? null;
  const preview = useMemo(() => {
    try {
      return renderSvg(payload ?? 'https://tessera.example', DEFAULT_DESIGN, { idPrefix: 'home', minEc: det ? getType(det.type).minEc : undefined }).svg;
    } catch {
      return null;
    }
  }, [payload, det?.type]);
  const recent = useQuery({ queryKey: ['codes', 'recent'], queryFn: () => api.get<{ items: CodeListItem[] }>('/api/codes?limit=12&sort=updated') });

  const open = () => {
    // Direkt auf dem aktuellen Text erkennen, nicht auf dem verzögerten Wert
    const now = text.trim() ? detectContent(text) : null;
    if (!now) { ref.current?.focus(); return; }
    navigate('/neu', { state: { type: now.type, content: now.content } });
  };
  const quickDownload = async () => {
    if (!payload) return;
    try {
      const r = await api.file('/api/render', { payload, design: DEFAULT_DESIGN, format: 'png', size: 1024, name: getType(det!.type).summary(det!.content) || 'qr-code' });
      saveBlob(r.blob, r.name);
    } catch (e) { toastError(e); }
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div>
          <h1 className="home-title">Was soll dein Code tun?</h1>
          <p className="home-sub">Füge einen Link, eine IBAN, WLAN-Daten oder eine Telefonnummer ein. Tessera erkennt den Inhalt und zeigt sofort den fertigen Code.</p>
          <div className="smart">
            <textarea ref={ref} value={text} rows={1} autoFocus aria-label="Inhalt für den QR-Code" data-testid="smart-input"
              placeholder="z. B. www.beispiel.de oder DE89 3704 0044 0532 0130 00"
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const t = e.clipboardData.getData('text');
                if (t.includes('\n')) { e.preventDefault(); setText(t); }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); open(); } }} />
            <button className="btn btn-primary btn-lg" onClick={open} disabled={!text.trim()}>Gestalten <ArrowRight size={16} /></button>
          </div>
          <div className="smart-hint" aria-live="polite">
            {det ? (
              <>
                <span className="chip chip-accent"><Glyph id={getType(det.type).icon} size={12} /> {getType(det.type).label}</span>
                <span>{det.reason}</span>
                {payload && <button className="btn btn-ghost btn-sm" onClick={quickDownload}><Download size={14} /> Sofort als PNG laden</button>}
              </>
            ) : <span><Sparkles size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Funktioniert auch mit vCards, Kartenlinks, WLAN-Strings und GiroCodes.</span>}
          </div>
        </div>
        <div className="home-live" aria-hidden="true">
          <div className="proof" style={{ padding: 26 }}>
            <div className={`proof-art ${payload ? '' : 'placeholder'}`} style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: preview ?? '' }} />
            <div className="colorbar"><i style={{ background: '#00a0e9' }} /><i style={{ background: '#e4007f' }} /><i style={{ background: '#fff100' }} /><i style={{ background: '#111' }} /></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="types-h">
        <h2 id="types-h" style={{ marginBottom: 18 }}>Oder wähle, was der Code enthalten soll</h2>
        <TypeGrid onPick={(id) => navigate(`/neu?type=${id}`)} />
      </section>

      {!!recent.data?.items.length && (
        <section className="home-recent" aria-labelledby="recent-h">
          <div className="spread" style={{ marginBottom: 14 }}>
            <h2 id="recent-h">Zuletzt bearbeitet</h2>
            <Link to="/bibliothek" className="btn btn-ghost btn-sm">Alle Codes</Link>
          </div>
          <div className="recent-row">
            {recent.data.items.map((c) => (
              <Link key={c.id} to={`/codes/${c.id}`} className="recent-card">
                <div className="thumb"><img src={`/api/codes/${c.id}/preview.svg?v=${encodeURIComponent(c.updatedAt)}`} alt="" loading="lazy" /></div>
                <b>{c.name}</b>
                <span className="faint small">{getType(c.type).label}{c.kind === 'dynamic' ? ' · dynamisch' : ''}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
