// App-Rahmen: Navigation, Befehlspalette, Toasts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, Layers, LogOut, Moon, Palette, ScanLine, Settings, Sun, Table2, Plus } from 'lucide-react';
import * as RTooltip from '@radix-ui/react-tooltip';
import { CONTENT_TYPES } from '@shared/content';
import { api } from '../lib/api';
import { canEdit, MOD_KEY, useAuth, useDebounced, useHotkey } from '../lib/hooks';
import { useTheme } from '../lib/theme';
import { useToasts } from '../lib/toast';
import type { CodeListItem } from '../lib/types';
import { Glyph, Logo, Tip } from './ui';

const NAV = [
  { to: '/', label: 'Start', icon: Home, end: true },
  { to: '/bibliothek', label: 'Codes', icon: Layers },
  { to: '/serien', label: 'Serien', icon: Table2, edit: true },
  { to: '/vorlagen', label: 'Vorlagen', icon: Palette },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
];

function Toasts() {
  const { list, dismiss } = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
          <span>{t.message}</span>
          {t.action && <button onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

interface Cmd { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }

function Palette_({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const dq = useDebounced(q, 150);
  const inputRef = useRef<HTMLInputElement>(null);
  const codes = useQuery({ queryKey: ['palette', dq], queryFn: () => api.get<{ items: CodeListItem[] }>(`/api/codes?limit=8&q=${encodeURIComponent(dq)}`), enabled: open && dq.length > 1 });
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
  const cmds: Cmd[] = useMemo(() => {
    const f = q.trim().toLowerCase();
    const base: Cmd[] = [
      { id: 'new', label: 'Neuer Code', hint: 'N', icon: <Plus size={16} />, run: () => navigate('/neu') },
      ...CONTENT_TYPES.map((t) => ({ id: `t-${t.id}`, label: `Neu: ${t.label}`, icon: <Glyph id={t.icon} size={16} />, run: () => navigate(`/neu?type=${t.id}`) })),
      { id: 'lib', label: 'Bibliothek öffnen', icon: <Layers size={16} />, run: () => navigate('/bibliothek') },
      { id: 'batch', label: 'Serien aus Tabelle', icon: <Table2 size={16} />, run: () => navigate('/serien') },
      { id: 'tpl', label: 'Vorlagen', icon: <Palette size={16} />, run: () => navigate('/vorlagen') },
      { id: 'scan', label: 'Code scannen', icon: <ScanLine size={16} />, run: () => navigate('/scanner') },
      { id: 'set', label: 'Einstellungen', icon: <Settings size={16} />, run: () => navigate('/einstellungen') },
      { id: 'theme', label: 'Hell/Dunkel umschalten', icon: <Moon size={16} />, run: () => theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
    ].filter((c) => !f || c.label.toLowerCase().includes(f));
    const found = (codes.data?.items ?? []).map((c) => ({ id: `c-${c.id}`, label: c.name, hint: 'Code', icon: <img src={`/api/codes/${c.id}/preview.svg?v=${encodeURIComponent(c.updatedAt)}`} alt="" width={18} height={18} />, run: () => navigate(`/codes/${c.id}`) }));
    return [...found, ...base].slice(0, 30);
  }, [q, codes.data]);
  if (!open) return null;
  const run = (c: Cmd) => { onClose(); c.run(); };
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Befehle"
        onKeyDown={(e) => {
          // Fokus bleibt im Eingabefeld der Palette
          if (e.key === 'Tab') { e.preventDefault(); inputRef.current?.focus(); }
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}>
        <input ref={inputRef} value={q} placeholder="Code suchen oder Befehl eingeben" aria-label="Befehl suchen" role="combobox" aria-expanded="true" aria-controls="palette-list"
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(cmds.length - 1, i + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && cmds[idx]) run(cmds[idx]);
            if (e.key === 'Escape') onClose();
          }} />
        <ul id="palette-list" role="listbox">
          {cmds.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}>
              {c.icon}<span>{c.label}</span>{c.hint && <span className="faint">{c.hint}</span>}
            </li>
          ))}
          {!cmds.length && <li className="faint">Nichts gefunden</li>}
        </ul>
      </div>
    </>
  );
}

export function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const [palette, setPalette] = useState(false);
  const user = auth.data?.user;
  useHotkey('mod+k', () => setPalette((v) => !v));
  useHotkey('n', () => navigate('/neu'), canEdit(user?.role));
  const logout = async () => {
    await api.post('/api/auth/logout');
    location.href = '/login';
  };
  const nav = NAV.filter((n) => !n.edit || canEdit(user?.role));
  const dark = theme.pref === 'dark' || (theme.pref === 'system' && document.documentElement.dataset.theme === 'dark');
  return (
    <RTooltip.Provider>
      <a href="#main" className="skip-link">Zum Inhalt springen</a>
      <div className="shell">
        <nav className="rail" aria-label="Hauptnavigation">
          <NavLink to="/" className="rail-mark" aria-label="Tessera Start"><Logo size={32} /></NavLink>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="rail-link"><n.icon size={20} /><span>{n.label}</span></NavLink>
          ))}
          <span className="rail-spacer" />
          <Tip label={`Suchen und Befehle (${MOD_KEY}K)`}><button className="rail-link" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setPalette(true)}><span className="kbd">{MOD_KEY}K</span></button></Tip>
          <Tip label={dark ? 'Helles Design' : 'Dunkles Design'}><button className="rail-link" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => theme.set(dark ? 'light' : 'dark')} aria-label="Farbschema umschalten">{dark ? <Sun size={19} /> : <Moon size={19} />}</button></Tip>
          <NavLink to="/einstellungen" className="rail-link"><Settings size={20} /><span>Optionen</span></NavLink>
          {!auth.data?.authDisabled && <Tip label={`Abmelden (${user?.email ?? ''})`}><button className="rail-link" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={logout} aria-label="Abmelden"><LogOut size={19} /></button></Tip>}
        </nav>
        <main className="main" id="main" tabIndex={-1}><Outlet /></main>
        <nav className="tabbar" aria-label="Navigation">
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className="rail-link"><n.icon size={20} /><span>{n.label}</span></NavLink>)}
          <NavLink to="/einstellungen" className="rail-link"><Settings size={20} /><span>Optionen</span></NavLink>
        </nav>
      </div>
      <Palette_ open={palette} onClose={() => setPalette(false)} />
      <Toasts />
    </RTooltip.Provider>
  );
}

export { Toasts };
