// Linke Spalte des Editors: Inhaltstyp, Felder, statisch/dynamisch, Ablage.
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileUp, Globe2, Info, Link2, Lock, Network, Search, Star, Upload } from 'lucide-react';
import { CATEGORIES, CONTENT_TYPES, formatIban, getType, ibanValid, type FieldDef, type Issue } from '@shared/content';
import { coordsFromText } from '@shared/detect';
import { api } from '../lib/api';
import { canEdit, relTime, useAuth, useSettings } from '../lib/hooks';
import { clientSlug, useEditor } from '../lib/editor-store';
import { toast, toastError } from '../lib/toast';
import type { Facets, Folder } from '../lib/types';
import { Dialog, Field, Glyph, IssueLine, SecretInput, Switch, TextInput } from '../components/ui';

// ------------------------------------------------------------ Typauswahl

export function TypeGrid({ onPick, current, filter = '' }: { onPick: (id: string) => void; current?: string; filter?: string }) {
  const f = filter.trim().toLowerCase();
  const match = (t: (typeof CONTENT_TYPES)[number]) => !f || t.label.toLowerCase().includes(f) || t.keywords.some((k) => k.includes(f)) || t.description.toLowerCase().includes(f);
  return (
    <div className="type-groups">
      {CATEGORIES.map((c) => {
        const items = CONTENT_TYPES.filter((t) => t.category === c.id && match(t));
        if (!items.length) return null;
        return (
          <div className="type-group" key={c.id}>
            <h3>{c.label}</h3>
            <div className="type-list">
              {items.map((t) => (
                <button type="button" key={t.id} className="type-item" onClick={() => onPick(t.id)} aria-current={t.id === current || undefined}
                  style={t.id === current ? { background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' } : undefined} data-type={t.id}>
                  <span className="type-icon"><Glyph id={t.icon} size={18} /></span>
                  <span><b>{t.label}</b><span>{t.description}</span></span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypePickerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('');
  const { type, setType } = useEditor();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Was soll der Code tun?" wide>
      <div className="search" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <Search size={16} />
        <input className="input" autoFocus placeholder="Suchen, z. B. WLAN, Rechnung, Instagram" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Inhaltstyp suchen" />
      </div>
      <TypeGrid current={type} filter={q} onPick={(id) => { setType(id); onOpenChange(false); setQ(''); }} />
    </Dialog>
  );
}

// ------------------------------------------------------------ Felder

function FieldInput({ f, value, issues }: { f: FieldDef; value: string | boolean | undefined; issues: Issue[] }) {
  const setField = useEditor((s) => s.setField);
  const setContent = useEditor((s) => s.setContent);
  const content = useEditor((s) => s.contents[s.type] ?? {});
  const id = `f-${f.key}`;
  const invalid = issues.some((i) => i.level === 'error');
  const str = typeof value === 'string' ? value : '';
  const count = f.maxLength ? <span className="faint" style={{ fontWeight: 400 }}>{[...str].length}/{f.maxLength}</span> : undefined;

  if (f.kind === 'toggle') {
    return <Switch label={f.label} help={f.help} checked={value === true} onChange={(v) => setField(f.key, v)} />;
  }
  let input: React.ReactNode;
  switch (f.kind) {
    case 'textarea':
      input = <textarea id={id} className="textarea" value={str} placeholder={f.placeholder} aria-invalid={invalid || undefined} onChange={(e) => setField(f.key, e.target.value)} rows={f.key === 'text' || f.key === 'data' ? 5 : 3} />;
      break;
    case 'select':
      input = (
        <select id={id} className="select" value={str || f.options?.[0]?.value} onChange={(e) => setField(f.key, e.target.value)}>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'secret':
      input = <SecretInput id={id} value={str} onChange={(v) => setField(f.key, v)} placeholder={f.placeholder} invalid={invalid} />;
      break;
    case 'iban':
      input = (
        <TextInput id={id} className="mono-input" value={str} placeholder={f.placeholder} invalid={invalid} spellCheck={false} autoComplete="off"
          onChange={(e) => setField(f.key, e.target.value.toUpperCase())}
          onBlur={() => { if (ibanValid(str)) setField(f.key, formatIban(str)); }} />
      );
      break;
    case 'datetime': {
      const allDay = content.allDay === true;
      input = (
        <TextInput id={id} type={allDay ? 'date' : 'datetime-local'} value={allDay ? str.slice(0, 10) : str.slice(0, 16)} invalid={invalid}
          onChange={(e) => setField(f.key, allDay ? (e.target.value ? `${e.target.value}T00:00` : '') : e.target.value)} />
      );
      break;
    }
    default: {
      const types: Record<string, string> = { url: 'url', email: 'email', tel: 'tel' };
      input = (
        <TextInput id={id} type={types[f.kind] ?? 'text'} inputMode={f.kind === 'number' ? 'decimal' : undefined} value={str}
          placeholder={f.placeholder} invalid={invalid} spellCheck={f.kind === 'text'} autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            // Kartenlink im Koordinatenfeld: Koordinaten automatisch übernehmen
            if (f.key === 'lat' || f.key === 'lon') {
              const c = /[/?=@#]/.test(v) ? coordsFromText(v) : null;
              if (c) { setContent({ ...content, lat: c.lat, lon: c.lon }); toast('Koordinaten aus dem Link übernommen'); return; }
            }
            setField(f.key, v);
          }} />
      );
    }
  }
  return <Field label={f.label} htmlFor={id} help={f.help} issues={issues} aside={count} className={f.half ? '' : 'full'}>{input}</Field>;
}

function DocumentUpload() {
  const { contents, type, setContent } = useEditor();
  const content = contents[type] ?? {};
  const fileId = typeof content.fileId === 'string' ? content.fileId : '';
  const meta = useQuery({ queryKey: ['file', fileId], queryFn: () => api.get<{ name: string; size: number }>(`/api/files/${fileId}/meta`), enabled: !!fileId });
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const r = await api.upload<{ id: string; name: string }>('/api/files', file);
      setContent({ ...content, fileId: r.id, title: (content.title as string) || r.name.replace(/\.[^.]+$/, '') });
      toast(`„${r.name}“ hochgeladen`);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="full">
      <div className="dropzone" data-over={over} role="button" tabIndex={0} onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ref.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
        {busy ? <span>Wird hochgeladen …</span> : fileId && meta.data ? (
          <><FileUp size={20} /><b>{meta.data.name}</b><span className="small faint">{(meta.data.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB · Klicken zum Ersetzen</span></>
        ) : (
          <><Upload size={20} /><b>Datei ablegen oder auswählen</b><span className="small faint">PDF, Bilder, Office-Dokumente</span></>
        )}
      </div>
      <input ref={ref} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
    </div>
  );
}

// ------------------------------------------------------------ Dynamische Einstellungen

function DynamicSection({ issues }: { issues: Issue[] }) {
  const s = useEditor();
  const settings = useSettings();
  const auth = useAuth();
  const [open, setOpen] = useState(true);
  const base = settings.data?.publicBase;
  const stats = useQuery({
    queryKey: ['stats', s.id], enabled: !!s.id && s.kind === 'dynamic',
    queryFn: () => api.get<{ trackingAllowed: boolean; total: number; lastScanAt: string | null; days: { day: string; total: number; mobile: number; desktop: number }[] }>(`/api/codes/${s.id}/stats`),
  });
  if (s.kind !== 'dynamic') return null;
  const days = stats.data?.days ?? [];
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
    return days.find((x) => x.day === d)?.total ?? 0;
  });
  const max = Math.max(1, ...last30);
  const sum30 = last30.reduce((a, b) => a + b, 0);
  const mobile = days.reduce((a, b) => a + b.mobile, 0);
  const all = days.reduce((a, b) => a + b.total, 0);
  return (
    <div className="side-section">
      <button className="spread" style={{ width: '100%', border: 0, background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>Kurzlink &amp; Verhalten</h3>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 12 }}>
          {base?.source === 'request' && !s.savedSlug && (
            <div className="notice notice-warn">
              <Info size={16} />
              <div>
                {auth.data?.user?.role === 'admin'
                  ? <>Noch keine Basisadresse für Kurzlinks festgelegt. Beim Speichern wird <b>{base.url}</b> festgeschrieben. Lege sie besser vorher unter Einstellungen fest.</>
                  : <>Die Administration muss zuerst die Basisadresse für Kurzlinks festlegen. Bis dahin lässt sich dieser Code nicht als dynamischer Code speichern.</>}
              </div>
            </div>
          )}
          {base && (
            <div className={`notice ${base.scope === 'internal' ? 'notice-warn' : 'notice-info'}`}>
              {base.scope === 'internal' ? <Network size={16} /> : <Globe2 size={16} />}
              <div>
                {base.scope === 'internal'
                  ? <><b>Nur im internen Netz scanbar.</b> Der Kurzlink zeigt auf {new URL(base.url).host}. Smartphones außerhalb des Firmennetzes erreichen ihn nicht. Für öffentliche Codes eine öffentliche Basisadresse in den Einstellungen hinterlegen.</>
                  : <>Der Kurzlink zeigt auf <b>{new URL(base.url).host}</b>. Diese Adresse muss dauerhaft auf Tessera weiterleiten.</>}
              </div>
            </div>
          )}
          <Field label="Kurzadresse" htmlFor="slug" help={s.savedSlug ? 'Ändern macht bereits gedruckte Codes ungültig.' : 'Wird beim Speichern reserviert.'} issues={issues.filter((i) => i.field === 'slug')}>
            <div className="row" style={{ gap: 6 }}>
              <span className="faint mono" style={{ whiteSpace: 'nowrap' }}>/r/</span>
              <TextInput id="slug" className="mono-input" value={s.slug ?? ''} onChange={(e) => s.setMeta({ slug: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} />
            </div>
          </Field>
          <Switch label="Aktiv" help="Pausierte Codes zeigen eine Hinweisseite oder leiten auf das Ersatzziel um." checked={s.enabled} onChange={(v) => s.setMeta({ enabled: v })} />
          <div className="grid2">
            <Field label="Läuft ab am" htmlFor="exp" className="full"
              issues={[...issues.filter((i) => i.field === 'expiresAt'), ...(s.expiresAt && s.expiresAt < new Date().toISOString() ? [{ field: 'expiresAt', level: 'warning' as const, message: 'Dieses Datum liegt in der Vergangenheit. Der Code ist damit sofort abgelaufen.' }] : [])]}>
              <TextInput id="exp" type="datetime-local" value={s.expiresAt ? toLocalInput(s.expiresAt) : ''}
                onChange={(e) => s.setMeta({ expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </Field>
          </div>
          <Field label="Ersatzziel" htmlFor="fb" help="Wohin der Code führt, wenn er pausiert oder abgelaufen ist. Leer lassen für eine Hinweisseite." issues={issues.filter((i) => i.field === 'fallbackUrl')}>
            <TextInput id="fb" type="url" value={s.fallbackUrl} invalid={issues.some((i) => i.field === 'fallbackUrl')} placeholder="beispiel.de/aktion-beendet" onChange={(e) => s.setMeta({ fallbackUrl: e.target.value })} />
          </Field>
          <Switch label="Scans zählen" disabled={settings.data && !settings.data.statsAllowed}
            help={settings.data && !settings.data.statsAllowed
              ? 'In den Einstellungen ist die Statistik ausgeschaltet. Ein Administrator kann sie dort erlauben.'
              : 'Nur anonyme Tageszahlen und Gerätetyp. Keine IP-Adressen, keine Cookies.'}
            checked={s.tracking} onChange={(v) => s.setMeta({ tracking: v })} />
          {s.id && s.tracking && stats.data && (
            <div>
              <div className="stat-nums">
                <div><b>{stats.data.total}</b><span>Scans gesamt</span></div>
                <div><b>{sum30}</b><span>Letzte 30 Tage</span></div>
                <div><b>{all ? Math.round((mobile / all) * 100) : 0} %</b><span>Smartphone</span></div>
              </div>
              <div className="bars" aria-label={`Scans der letzten 30 Tage, Maximum ${max} pro Tag`} role="img">
                {last30.map((v, i) => <div key={i} style={{ height: `${(v / max) * 100}%` }} title={`${v} Scans`} />)}
              </div>
              <p className="faint small">{stats.data.lastScanAt ? `Zuletzt gescannt ${relTime(stats.data.lastScanAt)}` : 'Noch keine Scans gezählt.'}</p>
            </div>
          )}
          {s.events.length > 0 && (
            <div>
              <div className="section-title">Verlauf</div>
              <ul className="timeline">
                {s.events.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <b>{eventLabel(e.kind)}</b> <span className="faint">{relTime(e.at)}{e.user ? ` · ${e.user}` : ''}</span>
                    {e.detail && <span className="mono">{e.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const eventLabel = (k: string) => ({ created: 'Erstellt', target: 'Ziel geändert', enabled: 'Aktiviert', disabled: 'Pausiert', slug: 'Kurzadresse geändert' }[k] ?? k);
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ------------------------------------------------------------ Ablage

function TagInput({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [v, setV] = useState('');
  const add = (t: string) => {
    const x = t.trim();
    if (x && !tags.includes(x)) onChange([...tags, x]);
    setV('');
  };
  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: tags.length ? 8 : 0 }}>
        {tags.map((t) => (
          <span className="chip" key={t}>{t}<button className="btn-ghost" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }} aria-label={`Schlagwort ${t} entfernen`} onClick={() => onChange(tags.filter((x) => x !== t))}>×</button></span>
        ))}
      </div>
      <input className="input" list="tag-suggestions" value={v} placeholder="Schlagwort hinzufügen" aria-label="Schlagwort hinzufügen"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(v); } }}
        onBlur={() => v && add(v)} />
      <datalist id="tag-suggestions">{suggestions.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function OrganizeSection() {
  const s = useEditor();
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.get<Folder[]>('/api/folders') });
  const facets = useQuery({ queryKey: ['facets'], queryFn: () => api.get<Facets>('/api/codes/facets') });
  const [open, setOpen] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const newFolder = async () => {
    const name = folderName?.trim();
    if (!name) { setFolderName(null); return; }
    try {
      const f = await api.post<Folder>('/api/folders', { name });
      await qc.invalidateQueries({ queryKey: ['folders'] });
      s.setMeta({ folderId: f.id });
      setFolderName(null);
    } catch (e) { toastError(e); }
  };
  return (
    <div className="side-section">
      <button className="spread" style={{ width: '100%', border: 0, background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>Ablage</h3>
        <span className="row faint small">{s.favorite && <Star size={14} fill="currentColor" />}{s.tags.length ? `${s.tags.length} Schlagwörter` : ''}{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 12 }}>
          <Field label="Ordner" htmlFor="folder">
            {folderName === null ? (
              <div className="row">
                <select id="folder" className="select" value={s.folderId ?? ''} onChange={(e) => s.setMeta({ folderId: e.target.value || null })}>
                  <option value="">Kein Ordner</option>
                  {folders.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button className="btn" onClick={() => setFolderName('')}>Neu</button>
              </div>
            ) : (
              <div className="row">
                <input className="input" autoFocus placeholder="Name des Ordners" value={folderName} aria-label="Name des neuen Ordners"
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void newFolder(); if (e.key === 'Escape') setFolderName(null); }} />
                <button className="btn btn-primary" onClick={() => void newFolder()}>Anlegen</button>
              </div>
            )}
          </Field>
          <Field label="Schlagwörter"><TagInput tags={s.tags} onChange={(tags) => s.setMeta({ tags })} suggestions={facets.data?.tags.map((t) => t.tag) ?? []} /></Field>
          <Switch label="Favorit" checked={s.favorite} onChange={(v) => s.setMeta({ favorite: v })} />
          <Field label="Notiz" htmlFor="note" help="Nur intern sichtbar, z. B. wo der Code hängt.">
            <textarea id="note" className="textarea" rows={2} value={s.note} onChange={(e) => s.setMeta({ note: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Panel

export function ContentPanel({ issues: allIssues, serverIssues }: { issues: Issue[]; serverIssues: Issue[] }) {
  const s = useEditor();
  // Fehler erst zeigen, wenn jemand etwas eingegeben hat oder speichern/exportieren wollte –
  // ein leeres Formular soll nicht mit roten Meldungen begrüßen.
  const contentNow = s.contents[s.type] ?? {};
  const anyTouched = Object.keys(s.touched).length > 0;
  const issues = allIssues.filter((i) => serverIssues.includes(i) || i.level === 'warning' || s.attempted
    || (i.field ? !!(s.touched[i.field] || (contentNow[i.field] && contentNow[i.field] !== getType(s.type).defaults[i.field])) : anyTouched));
  const auth = useAuth();
  const t = getType(s.type);
  const content = s.contents[s.type] ?? {};
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const visible = t.fields.filter((f) => !f.showIf || f.showIf(content));
  const basic = visible.filter((f) => !f.advanced && f.key !== 'fileId');
  const adv = visible.filter((f) => f.advanced);
  const advHasValue = adv.some((f) => content[f.key] && content[f.key] !== t.defaults[f.key]);
  const advOpen = showAdv || advHasValue;
  const hasSensitive = t.fields.some((f) => f.sensitive);
  const general = issues.filter((i) => !i.field);
  const editable = canEdit(auth.data?.user?.role);

  const setKind = (kind: 'static' | 'dynamic') => {
    if (kind === s.kind) return;
    if (kind === 'static' && s.savedSlug) {
      toast('Ein gespeicherter dynamischer Code bleibt dynamisch, damit gedruckte Exemplare weiter funktionieren.', { tone: 'error' });
      return;
    }
    s.setMeta({ kind, slug: kind === 'dynamic' ? s.slug ?? clientSlug() : s.slug });
  };

  const missing = useMemo(() => s.missingSecrets.filter((k) => !content[k]), [s.missingSecrets, content]);

  return (
    <aside className="side side-left" aria-label="Inhalt">
      <div className="side-section">
        <button className="type-picker" onClick={() => setPickerOpen(true)} data-testid="type-picker" disabled={!editable && !!s.id}>
          <span className="type-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Glyph id={t.icon} /></span>
          <span className="grow"><b>{t.label}</b><span>{t.description}</span></span>
          <ChevronDown size={16} className="faint" />
        </button>
        <TypePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </div>

      <div className="side-section">
        <div className="grid2" key={s.type}>
          {basic.map((f) => <FieldInput key={f.key} f={f} value={content[f.key]} issues={issues.filter((i) => i.field === f.key)} />)}
          {s.type === 'document' && content.source === 'upload' && (
            <>
              <DocumentUpload />
              {s.kind !== 'dynamic' && <div className="full notice notice-info"><Info size={16} /><div>Hochgeladene Dateien brauchen einen dynamischen Code. Er wird beim Speichern automatisch eingerichtet.</div></div>}
            </>
          )}
          {adv.length > 0 && (
            <div className="full">
              <button className="adv-toggle" onClick={() => setShowAdv(!advOpen)} aria-expanded={advOpen}>
                {advOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {advOpen ? 'Weniger Felder' : `Weitere Felder (${adv.length})`}
              </button>
            </div>
          )}
          {advOpen && adv.map((f) => <FieldInput key={f.key} f={f} value={content[f.key]} issues={issues.filter((i) => i.field === f.key)} />)}
          {general.map((i, k) => <div className="full" key={k}><IssueLine issue={i} /></div>)}
        </div>
        {missing.length > 0 && (
          <div className="notice notice-warn" style={{ marginTop: 14 }}><Lock size={16} /><div>Vertrauliche Angaben ({missing.map((k) => t.fields.find((f) => f.key === k)?.label ?? k).join(', ')}) wurden bei diesem Code nicht gespeichert. Gib sie erneut ein, um den Code zu exportieren.</div></div>
        )}
        {hasSensitive && (
          <div style={{ marginTop: 14 }}>
            <Switch label="Vertrauliche Felder speichern" checked={s.storeSecrets} onChange={(v) => s.setMeta({ storeSecrets: v })}
              help={s.storeSecrets ? 'Verschlüsselt mit AES-256 auf dem Server. Erscheint nie in Protokollen oder Übersichten.' : 'Wird nicht gespeichert. Beim nächsten Öffnen musst du es erneut eingeben.'} />
          </div>
        )}
      </div>

      <div className="side-section">
        <div className="section-title">Art des Codes</div>
        <div className="kind-switch" role="group" aria-label="Art des Codes">
          <button className="kind-card" aria-pressed={s.kind === 'static'} onClick={() => setKind('static')} disabled={!!s.savedSlug}>
            <b><Lock size={14} /> Statisch</b><span>Inhalt steht im Code. Funktioniert für immer, ohne Server.</span>
          </button>
          <button className="kind-card" aria-pressed={s.kind === 'dynamic'} onClick={() => setKind('dynamic')} disabled={!t.dynamic} data-testid="kind-dynamic"
            title={t.dynamic ? undefined : `${t.label}-Codes müssen ihren Inhalt direkt enthalten.`}>
            <b><Link2 size={14} /> Dynamisch</b><span>{t.dynamic ? 'Kurzlink über Tessera. Ziel später änderbar.' : 'Für diesen Typ nicht möglich.'}</span>
          </button>
        </div>
        {s.kind === 'dynamic' && t.dynamic === 'hosted' && (
          <p className="faint small" style={{ marginTop: 10 }}>Tessera zeigt beim Scannen eine kleine Seite mit {s.type === 'vcard' ? '„Kontakt speichern“' : '„In den Kalender eintragen“'}. Der Code bleibt dadurch klein und gut lesbar.</p>
        )}
        {s.kind === 'dynamic' && s.type === 'appstore' && (
          <p className="faint small" style={{ marginTop: 10 }}>Beim Scannen erkennt Tessera das Gerät und öffnet den passenden Store.</p>
        )}
      </div>

      <DynamicSection issues={serverIssues} />
      <OrganizeSection />
    </aside>
  );
}
