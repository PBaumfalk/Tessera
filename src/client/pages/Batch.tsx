// Serien: viele Codes aus einer Tabelle (CSV, Excel, JSON oder eingefügt).
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { AlertCircle, Check, Download, FileSpreadsheet, Library } from 'lucide-react';
import { CONTENT_TYPES, encodeContent, getType, sanitizeContent, type ContentData } from '@shared/content';
import { applyPreset, DEFAULT_DESIGN, FRAME_STYLES, STYLE_PRESETS, type Design } from '@shared/design';
import { renderSvg } from '@shared/render';
import { api, saveBlob } from '../lib/api';
import { toast, toastError } from '../lib/toast';
import type { Folder, Template } from '../lib/types';
import { Field, Seg, TextInput } from '../components/ui';
import { BatchExportDialog } from './Library';

type Table = { headers: string[]; rows: string[][] };
type Mapping = Record<string, { mode: 'column' | 'fixed' | 'template'; value: string }>;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const SYNONYMS: Record<string, string[]> = {
  url: ['url', 'link', 'webadresse', 'website', 'adresse', 'ziel'], firstName: ['vorname', 'firstname', 'givenname'],
  lastName: ['nachname', 'name', 'lastname', 'familienname', 'surname'], org: ['firma', 'unternehmen', 'organisation', 'company', 'org'],
  title: ['position', 'titel', 'jobtitle', 'funktion'], mobile: ['mobil', 'handy', 'mobile', 'cell'], phone: ['telefon', 'tel', 'phone', 'festnetz'],
  email: ['email', 'mail', 'emailadresse'], website: ['website', 'web', 'url', 'homepage'], street: ['strasse', 'street', 'adresse'],
  zip: ['plz', 'postleitzahl', 'zip'], city: ['ort', 'stadt', 'city'], ssid: ['ssid', 'netzwerk', 'wlan', 'netzwerkname'],
  password: ['passwort', 'password', 'kennwort', 'key'], text: ['text', 'inhalt', 'nachricht'], data: ['daten', 'inhalt', 'id', 'nummer', 'inventarnummer', 'seriennummer', 'code'],
  name: ['empfanger', 'empfaenger', 'name', 'kontoinhaber'], iban: ['iban', 'konto'], amount: ['betrag', 'summe', 'amount', 'preis'],
  remittance: ['verwendungszweck', 'zweck', 'rechnung', 'rechnungsnummer', 'referenz'], to: ['email', 'empfanger', 'empfaenger', 'an', 'to'],
  subject: ['betreff', 'subject'], body: ['nachricht', 'text', 'body'], message: ['nachricht', 'text', 'message'],
};

function parseText(text: string): Table {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed) as Record<string, unknown>[];
    const headers = [...new Set(arr.flatMap((o) => Object.keys(o)))];
    return { headers, rows: arr.map((o) => headers.map((h) => (o[h] === undefined || o[h] === null ? '' : String(o[h])))) };
  }
  const res = Papa.parse<string[]>(trimmed, { skipEmptyLines: 'greedy' });
  const [headers = [], ...rows] = res.data;
  return { headers: headers.map((h, i) => h.trim() || `Spalte ${i + 1}`), rows };
}

async function parseFile(file: File): Promise<Table> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsx } = await import('read-excel-file/browser');
    // Erste Tabelle der Arbeitsmappe verwenden
    const sheets = await readXlsx(file);
    const data = (sheets[0]?.data ?? []) as unknown[][];
    const [headers = [], ...rows] = data;
    return { headers: headers.map((h, i) => (h ? String(h) : `Spalte ${i + 1}`)), rows: rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 16) : String(c)))) };
  }
  return parseText(await file.text());
}

function autoMap(type: string, headers: string[]): Mapping {
  const t = getType(type);
  const m: Mapping = {};
  const used = new Set<string>();
  for (const f of t.fields) {
    if (f.kind === 'toggle' || f.key === 'fileId') continue;
    const cands = [norm(f.key), norm(f.label), ...(SYNONYMS[f.key] ?? [])];
    const h = headers.find((x) => !used.has(x) && cands.includes(norm(x))) ?? headers.find((x) => !used.has(x) && cands.some((c) => c.length > 3 && norm(x).includes(c)));
    if (h) { m[f.key] = { mode: 'column', value: h }; used.add(h); }
    else if (t.defaults[f.key] !== undefined && typeof t.defaults[f.key] === 'string') m[f.key] = { mode: 'fixed', value: String(t.defaults[f.key]) };
  }
  return m;
}

function resolve(spec: { mode: string; value: string } | undefined, headers: string[], row: string[]): string {
  if (!spec) return '';
  if (spec.mode === 'fixed') return spec.value;
  if (spec.mode === 'column') return row[headers.indexOf(spec.value)] ?? '';
  return spec.value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, col: string) => row[headers.indexOf(col)] ?? '');
}

const STEPS = ['Daten', 'Zuordnung', 'Prüfen', 'Design', 'Ausgabe'];

export function BatchPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [type, setType] = useState('url');
  const [table, setTable] = useState<Table | null>(null);
  const [paste, setPaste] = useState('');
  const [mapping, setMapping] = useState<Mapping>({});
  const [nameSpec, setNameSpec] = useState<{ mode: 'column' | 'fixed' | 'template'; value: string }>({ mode: 'template', value: '' });
  const [labelSpec, setLabelSpec] = useState('');
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveKind, setSaveKind] = useState<'static' | 'dynamic'>('static');
  const [folderId, setFolderId] = useState('');
  const [tag, setTag] = useState('');
  const [saving, setSaving] = useState(false);
  // Merkt sich, welcher Datenstand schon gespeichert wurde, damit ein zweiter Klick keine Duplikate erzeugt
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = getType(type);
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/api/templates') });
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.get<Folder[]>('/api/folders') });

  const load = (tb: Table) => {
    if (!tb.headers.length || !tb.rows.length) { toastError(new Error('Die Tabelle braucht eine Kopfzeile und mindestens eine Datenzeile.')); return; }
    if (tb.rows.length > 5000) { toastError(new Error('Höchstens 5000 Zeilen pro Durchgang.')); return; }
    setTable(tb);
    setMapping(autoMap(type, tb.headers));
    setNameSpec({ mode: 'column', value: tb.headers[0] });
    setStep(1);
  };

  const rows = useMemo(() => {
    if (!table) return [];
    return table.rows.map((r) => {
      const raw: ContentData = { ...t.defaults };
      for (const f of t.fields) {
        const spec = mapping[f.key];
        if (!spec) continue;
        const v = resolve(spec, table.headers, r);
        if (f.kind === 'toggle') raw[f.key] = /^(1|ja|yes|true|x)$/i.test(v.trim());
        else if (v !== '') raw[f.key] = v;
      }
      const content = sanitizeContent(type, raw);
      const { payload, issues } = encodeContent(type, content);
      const name = resolve(nameSpec, table.headers, r).trim() || t.summary(content) || t.label;
      const label = labelSpec ? resolve({ mode: 'template', value: labelSpec }, table.headers, r).slice(0, 40) : undefined;
      return { content, payload, error: payload ? null : issues.find((i) => i.level === 'error')?.message ?? 'Unvollständig', name, label };
    });
  }, [table, mapping, nameSpec, labelSpec, type]);
  const bad = rows.filter((r) => r.error).length;
  const good = rows.length - bad;

  const sample = () => {
    const fields = t.fields.filter((f) => !f.advanced && f.kind !== 'toggle' && f.key !== 'fileId');
    const csv = Papa.unparse({ fields: ['Name', ...fields.map((f) => f.label)], data: [['Beispiel', ...fields.map((f) => String(t.example[f.key] ?? ''))]] }, { delimiter: ';' });
    saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `vorlage-${t.id}.csv`);
  };

  const saveKey = JSON.stringify([type, mapping, nameSpec, labelSpec, design, saveKind, folderId, tag, table?.rows.length]);
  const names = rows.filter((r) => !r.error).map((r) => r.name);
  const dupNames = names.length - new Set(names).size;
  const headers = table?.headers ?? [];
  const unknownPlaceholders = [...labelSpec.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g), ...Object.values(mapping).filter((m) => m.mode === 'template').flatMap((m) => [...m.value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)])]
    .map((m) => m[1]).filter((c) => !headers.includes(c));
  const exportRows = { type, design, items: rows.filter((r) => !r.error).map((r) => ({ name: r.name, content: r.content, label: r.label })) };

  const saveAll = async () => {
    setSaving(true);
    try {
      const items = rows.filter((r) => !r.error).map((r) => ({
        name: r.name, type, content: r.content, kind: saveKind, folderId: folderId || null, tags: tag ? [tag] : [],
        design: r.label !== undefined && design.frame.style !== 'none' ? { ...design, frame: { ...design.frame, text: r.label } } : design,
      }));
      const res = await api.post<{ created: number }>('/api/codes/import', { items });
      setSavedKey(saveKey);
      qc.invalidateQueries({ queryKey: ['codes'] });
      qc.invalidateQueries({ queryKey: ['facets'] });
      toast(`${res.created} Codes in der Bibliothek gespeichert`, { action: { label: 'Ansehen', run: () => navigate(folderId ? `/bibliothek?folder=${folderId}` : tag ? `/bibliothek?tag=${encodeURIComponent(tag)}` : '/bibliothek') } });
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  const previewSvgs = useMemo(() => rows.filter((r) => r.payload).slice(0, 6).map((r) => {
    const d = r.label !== undefined && design.frame.style !== 'none' ? { ...design, frame: { ...design.frame, text: r.label } } : design;
    try { return { name: r.name, svg: renderSvg(r.payload!, d, { idPrefix: `b${r.name.length}`, minEc: t.minEc }).svg }; } catch { return { name: r.name, svg: '' }; }
  }), [rows, design]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Serien</h1><p className="muted">Erzeuge Hunderte Codes aus einer Tabelle, als Dateien, Etikettenbogen oder direkt in der Bibliothek.</p></div>
      </div>
      <nav className="steps" aria-label="Schritte">
        {STEPS.map((label, i) => (
          <button key={label} className="step" aria-current={i === step ? 'step' : undefined} data-done={i < step} disabled={i > 0 && !table} onClick={() => setStep(i)}>
            <i>{i < step ? <Check size={12} /> : i + 1}</i>{label}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <div className="batch-grid">
          <div className="stack">
            <Field label="Welche Art von Code?" htmlFor="btype">
              <select id="btype" className="select" value={type} onChange={(e) => { setType(e.target.value); if (table) setMapping(autoMap(e.target.value, table.headers)); }}>
                {CONTENT_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label} – {x.description}</option>)}
              </select>
            </Field>
            <div className="dropzone" style={{ padding: 32 }} role="button" tabIndex={0} onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) try { load(await parseFile(f)); } catch (er) { toastError(er); } }}>
              <FileSpreadsheet size={26} />
              <b>Tabelle ablegen oder auswählen</b>
              <span className="small faint">CSV, Excel (.xlsx), TSV oder JSON · erste Zeile mit Spaltennamen</span>
            </div>
            <input ref={fileRef} type="file" hidden accept=".csv,.tsv,.txt,.json,.xlsx" data-testid="batch-file"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) try { load(await parseFile(f)); } catch (er) { toastError(er); } }} />
            <Field label="Oder Tabelle einfügen" htmlFor="paste" help="Direkt aus Excel kopieren funktioniert.">
              <textarea id="paste" className="textarea mono-input" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Name;Webadresse\nFlyer Herbst;beispiel.de/herbst'} />
            </Field>
            <div className="row wrap">
              <button className="btn btn-primary" disabled={!paste.trim()} onClick={() => { try { load(parseText(paste)); } catch (er) { toastError(er); } }} data-testid="batch-paste-load">Eingefügte Tabelle verwenden</button>
              <button className="btn" onClick={sample}><Download size={15} /> Beispieltabelle für {t.label}</button>
            </div>
          </div>
          <div className="panel-card" style={{ padding: 18 }}>
            <h3 style={{ marginBottom: 8 }}>So funktioniert es</h3>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Tabelle mit einer Zeile pro Code hochladen</li>
              <li>Spalten den Feldern zuordnen, Tessera schlägt passende vor</li>
              <li>Fehlerhafte Zeilen werden markiert, bevor etwas erzeugt wird</li>
              <li>Design wählen und optional eine Beschriftung je Zeile</li>
              <li>Als ZIP, als Etikettenbogen oder in die Bibliothek</li>
            </ol>
          </div>
        </div>
      )}

      {step === 1 && table && (
        <div className="batch-grid">
          <div className="panel-card" style={{ padding: 18 }}>
            <h3 style={{ marginBottom: 6 }}>Spalten zuordnen</h3>
            <p className="muted small" style={{ marginBottom: 10 }}>{table.rows.length} Zeilen, {table.headers.length} Spalten. Vorlagen wie <span className="mono">{'https://firma.de/{{Raum}}'}</span> setzen Werte zusammen.</p>
            <MapRow label="Name in Tessera" spec={nameSpec} headers={table.headers} onChange={setNameSpec} />
            {t.fields.filter((f) => f.kind !== 'toggle' && f.key !== 'fileId').map((f) => (
              <MapRow key={f.key} label={f.label + (f.required ? ' *' : '')} spec={mapping[f.key]} headers={table.headers} options={f.options}
                onChange={(spec) => setMapping({ ...mapping, [f.key]: spec })} />
            ))}
          </div>
          <div className="stack">
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="data"><thead><tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{table.rows.slice(0, 8).map((r, i) => <tr key={i}>{table.headers.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody></table>
            </div>
            <button className="btn btn-primary" onClick={() => setStep(2)}>Weiter zur Prüfung</button>
          </div>
        </div>
      )}

      {step === 2 && table && (
        <div className="stack">
          <div className={`notice ${bad ? 'notice-warn' : 'notice-info'}`}>
            {bad ? <AlertCircle size={16} /> : <Check size={16} />}
            <div><b>{good} von {rows.length} Zeilen sind gültig.</b> {bad ? `${bad} Zeilen werden übersprungen, bis du sie korrigierst oder die Zuordnung änderst.` : 'Alles bereit.'}</div>
          </div>
          {dupNames > 0 && <div className="notice notice-warn"><AlertCircle size={16} /><div>{dupNames} {dupNames === 1 ? 'Name kommt' : 'Namen kommen'} mehrfach vor. In ZIP-Dateien erhalten Duplikate eine laufende Nummer; prüfe, ob doppelte Zeilen gewollt sind.</div></div>}
          {unknownPlaceholders.length > 0 && <div className="notice notice-warn"><AlertCircle size={16} /><div>Unbekannte Spalte in einer Vorlage: {[...new Set(unknownPlaceholders)].map((u) => `{{${u}}}`).join(', ')}. Diese Stellen bleiben leer.</div></div>}
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>#</th><th>Status</th><th>Name</th><th>Inhalt</th></tr></thead>
              <tbody>
                {rows.slice(0, 500).map((r, i) => (
                  <tr key={i} className={r.error ? 'bad' : ''}>
                    <td>{i + 1}</td>
                    <td>{r.error ? <span style={{ color: 'var(--fail)' }}>{r.error}</span> : <span style={{ color: 'var(--ok)' }}>OK</span>}</td>
                    <td>{r.name}</td>
                    <td className="mono">{t.fields.some((f) => f.sensitive) ? t.summary(r.content) : r.payload?.replace(/\r?\n/g, ' ⏎ ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row"><button className="btn" onClick={() => setStep(1)}>Zuordnung ändern</button><button className="btn btn-primary" disabled={!good} onClick={() => setStep(3)}>Weiter zum Design</button></div>
        </div>
      )}

      {step === 3 && table && (
        <div className="batch-grid">
          <div className="stack">
            <div className="section-title">Stil</div>
            <div className="opt-grid lg">
              {STYLE_PRESETS.map((p) => (
                <button key={p.id} className="opt lg" onClick={() => setDesign(applyPreset(design, p))}>
                  <span style={{ width: 76, height: 76 }} dangerouslySetInnerHTML={{ __html: renderSvg('TESSERA', applyPreset(design, p), { idPrefix: `bp${p.id}` }).svg }} />
                  <span className="opt-label">{p.name}</span>
                </button>
              ))}
              {templates.data?.map((tp) => (
                <button key={tp.id} className="opt lg" onClick={() => setDesign(tp.design)}>
                  <span style={{ width: 76, height: 76 }} dangerouslySetInnerHTML={{ __html: renderSvg('TESSERA', tp.design, { idPrefix: `bt${tp.id}` }).svg }} />
                  <span className="opt-label">{tp.name}</span>
                </button>
              ))}
            </div>
            <div className="section-title" style={{ marginTop: 8 }}>Beschriftung je Code</div>
            <Seg label="Rahmen" value={design.frame.style} onChange={(v) => setDesign({ ...design, frame: { ...design.frame, style: v } })}
              options={FRAME_STYLES.filter((f) => ['none', 'card', 'pill', 'caption'].includes(f.id)).map((f) => ({ value: f.id, label: f.label }))} />
            {design.frame.style !== 'none' && (
              <Field label="Text unter dem Code" htmlFor="lbl" help={`Mit {{Spalte}} pro Zeile, z. B. {{${table.headers[0]}}}. Leer lassen für denselben Text auf allen Codes.`}
                issues={unknownPlaceholders.length ? [{ level: 'warning', message: `Unbekannte Spalte: ${[...new Set(unknownPlaceholders)].join(', ')}. Vorhanden: ${table.headers.join(', ')}` }] : undefined}>
                <TextInput id="lbl" value={labelSpec} placeholder={design.frame.text} onChange={(e) => setLabelSpec(e.target.value)} />
              </Field>
            )}
            <div className="row"><button className="btn btn-primary" onClick={() => setStep(4)}>Weiter zur Ausgabe</button></div>
          </div>
          <div className="panel-card" style={{ padding: 16 }}>
            <div className="section-title">Vorschau</div>
            <div className="opt-grid lg">
              {previewSvgs.map((p, i) => <div key={i} className="opt lg" style={{ cursor: 'default' }}><span style={{ width: 76, height: 76 }} dangerouslySetInnerHTML={{ __html: p.svg }} /><span className="opt-label">{p.name}</span></div>)}
            </div>
          </div>
        </div>
      )}

      {step === 4 && table && (
        <div className="batch-grid">
          <div className="stack">
            <div className="panel-card" style={{ padding: 18 }}>
              <h3>Als Dateien</h3>
              <p className="muted" style={{ margin: '6px 0 12px' }}>{good} Codes als ZIP mit PNG, SVG oder PDF, oder als Etikettenbogen zum Ausdrucken.</p>
              <button className="btn btn-primary" onClick={() => setExportOpen(true)} data-testid="batch-export"><Download size={15} /> Exportieren</button>
            </div>
            <div className="panel-card" style={{ padding: 18 }}>
              <h3>In der Bibliothek speichern</h3>
              <p className="muted" style={{ margin: '6px 0 12px' }}>Damit kannst du die Codes später einzeln bearbeiten{t.dynamic ? ' und bei dynamischen Codes das Ziel ändern' : ''}.</p>
              <div className="grid2">
                <Field label="Art" htmlFor="sk">
                  <select id="sk" className="select" value={saveKind} onChange={(e) => setSaveKind(e.target.value as 'static' | 'dynamic')}>
                    <option value="static">Statisch</option>
                    {t.dynamic && <option value="dynamic">Dynamisch (Kurzlink)</option>}
                  </select>
                </Field>
                <Field label="Ordner" htmlFor="sf">
                  <select id="sf" className="select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                    <option value="">Kein Ordner</option>
                    {folders.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
                <Field label="Schlagwort" htmlFor="st" className="full"><TextInput id="st" value={tag} placeholder="z. B. Herbstkampagne" onChange={(e) => setTag(e.target.value)} /></Field>
              </div>
              {saveKind === 'dynamic' && <p className="faint small" style={{ marginTop: 8 }}>Jeder Code bekommt einen eigenen Kurzlink. Exportiere die Codes danach aus der Bibliothek, damit die Kurzlinks im Code stehen.</p>}
              <button className="btn" style={{ marginTop: 12 }} disabled={saving || savedKey === saveKey} onClick={saveAll} data-testid="batch-save"><Library size={15} /> {saving ? 'Speichert …' : savedKey === saveKey ? 'Gespeichert' : `${good} Codes speichern`}</button>
            </div>
          </div>
          <div className="panel-card" style={{ padding: 16 }}>
            <div className="section-title">Zusammenfassung</div>
            <dl className="kv"><dt>Typ</dt><dd>{t.label}</dd><dt>Gültige Zeilen</dt><dd>{good}</dd><dt>Übersprungen</dt><dd>{bad}</dd><dt>Beschriftung</dt><dd>{design.frame.style === 'none' ? 'keine' : labelSpec || design.frame.text}</dd></dl>
          </div>
        </div>
      )}
      <BatchExportDialog ids={null} rows={exportOpen ? exportRows : undefined} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function MapRow({ label, spec, headers, onChange, options }: {
  label: string; spec?: { mode: 'column' | 'fixed' | 'template'; value: string }; headers: string[];
  onChange: (s: { mode: 'column' | 'fixed' | 'template'; value: string }) => void; options?: { value: string; label: string }[];
}) {
  const mode = spec?.mode ?? 'column';
  return (
    <div className="map-row">
      <span style={{ fontWeight: 550 }}>{label}</span>
      <div className="row">
        <select className="select" style={{ width: 150, flex: 'none' }} value={mode} aria-label={`${label}: Quelle`}
          onChange={(e) => onChange({ mode: e.target.value as 'column', value: e.target.value === 'column' ? headers[0] : '' })}>
          <option value="column">Spalte</option><option value="fixed">Fester Wert</option><option value="template">Vorlage</option>
        </select>
        {mode === 'column' ? (
          <select className="select" value={spec?.value ?? ''} aria-label={`${label}: Spalte`} onChange={(e) => onChange({ mode, value: e.target.value })}>
            <option value="">– nicht verwenden –</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        ) : mode === 'fixed' && options ? (
          <select className="select" value={spec?.value ?? ''} aria-label={`${label}: Wert`} onChange={(e) => onChange({ mode, value: e.target.value })}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input className="input" value={spec?.value ?? ''} aria-label={`${label}: ${mode === 'fixed' ? 'Wert' : 'Vorlage'}`}
            placeholder={mode === 'template' ? `{{${headers[0]}}}` : ''} onChange={(e) => onChange({ mode, value: e.target.value })} />
        )}
      </div>
    </div>
  );
}

