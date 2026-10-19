// Rechte Spalte: das Designstudio.
import { memo, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Dices, ImagePlus, Save, Trash2 } from 'lucide-react';
import {
  applyPreset, BODY_SHAPES, EYE_BALLS, EYE_FRAMES, FONTS, FRAME_STYLES, STYLE_PRESETS, DEFAULT_DESIGN,
  type Background, type Design, type Paint,
} from '@shared/design';
import { contrastRatio } from '@shared/analyze';
import { ICONS } from '@shared/icons.generated';
import { renderSvg } from '@shared/render';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { canEdit, useAuth } from '../lib/hooks';
import { toast, toastError } from '../lib/toast';
import type { Template } from '../lib/types';
import { ColorInput, Dialog, Field, Glyph, Seg, Slider, Switch, TextInput } from '../components/ui';

type Tab = 'style' | 'shape' | 'color' | 'logo' | 'frame' | 'tech';
const TABS: { id: Tab; label: string }[] = [
  { id: 'style', label: 'Stil' }, { id: 'shape', label: 'Form' }, { id: 'color', label: 'Farbe' },
  { id: 'logo', label: 'Logo' }, { id: 'frame', label: 'Rahmen' }, { id: 'tech', label: 'Technik' },
];

// ------------------------------------------------------------ Mini-Vorschauen

const miniCache = new Map<string, string>();
function mini(payload: string, design: Design, crop?: number): string {
  const key = `${payload}|${crop ?? ''}|${JSON.stringify(design)}`;
  const hit = miniCache.get(key);
  if (hit) return hit;
  let svg: string;
  try {
    svg = renderSvg(payload, design, { idPrefix: `m${miniCache.size}` }).svg;
  } catch {
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
  }
  if (crop) {
    const m = design.margin * 10;
    svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${m - 4} ${m - 4} ${crop * 10 + 8} ${crop * 10 + 8}"`);
  }
  if (miniCache.size > 400) miniCache.clear();
  miniCache.set(key, svg);
  return svg;
}

const Mini = memo(function Mini({ svg }: { svg: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg width="100%" height="100%" ') }} style={{ display: 'block', width: '100%', height: '100%' }} />;
});

function Opt({ pressed, onClick, label, children, large }: { pressed: boolean; onClick: () => void; label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <button type="button" className={`opt ${large ? 'lg' : ''}`} aria-pressed={pressed} onClick={onClick} aria-label={label}>
      <span style={{ width: large ? 76 : 40, height: large ? 76 : 40 }}>{children}</span>
      <span className="opt-label">{label}</span>
    </button>
  );
}

const SAMPLE = 'TESSERA';

/** Stimmt das Design in den stilprägenden Teilen (Formen, Farben) überein? */
function sameStyle(a: Design, b: Design): boolean {
  const pick = (d: Design) => JSON.stringify([d.body, d.eyes, d.fg, d.bg, d.radius, d.ec]);
  return pick(a) === pick(b);
}

// ------------------------------------------------------------ Zufallsgestaltung (nur gut lesbare Kombinationen)

function hsl(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function surpriseDesign(base: Design): Design {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 40; i++) {
    const h = Math.floor(Math.random() * 360);
    const fg1 = hsl(h, 55 + Math.random() * 30, 18 + Math.random() * 14);
    const fg2 = hsl((h + 30 + Math.random() * 60) % 360, 60 + Math.random() * 25, 22 + Math.random() * 12);
    const bg = Math.random() < 0.6 ? '#ffffff' : hsl((h + 180) % 360, 30 + Math.random() * 40, 95 + Math.random() * 3);
    const fg: Paint = Math.random() < 0.45 ? { type: 'linear', colors: [fg1, fg2], angle: pick([0, 45, 90, 135]) } : { type: 'solid', color: fg1 };
    const cols = fg.type === 'solid' ? [fg.color] : fg.colors;
    if (cols.some((c) => contrastRatio(c, bg) < 6)) continue;
    const shape = pick(['square', 'rounded', 'dots', 'fluid', 'classy', 'vlines', 'hlines'] as const);
    return {
      ...base,
      ec: base.logo.kind !== 'none' ? 'H' : 'Q',
      body: { shape, size: shape === 'dots' ? 0.9 : shape === 'rounded' ? 0.94 : shape.endsWith('lines') ? 0.86 : 1 },
      eyes: { frame: pick(['square', 'rounded', 'circle', 'leaf', 'cut']), ball: pick(['square', 'rounded', 'circle', 'leaf']), frameColor: null, ballColor: Math.random() < 0.3 ? fg2 : null },
      fg, bg: { type: 'solid', color: bg }, radius: Math.random() < 0.4 ? 6 : 0,
      frame: { ...base.frame, color: fg1 },
    };
  }
  return base;
}

// ------------------------------------------------------------ Farbe

function PaintEditor({ value, onChange, allowTransparent, label }: { value: Paint | Background; onChange: (p: Paint | Background) => void; allowTransparent?: boolean; label: string }) {
  const mode = value.type;
  const c1 = value.type === 'solid' ? value.color : value.type === 'transparent' ? '#ffffff' : value.colors[0];
  const c2 = value.type === 'linear' || value.type === 'radial' ? value.colors[1] : c1;
  const opts = [
    { value: 'solid', label: 'Farbe' }, { value: 'linear', label: 'Verlauf' }, { value: 'radial', label: 'Radial' },
    ...(allowTransparent ? [{ value: 'transparent', label: 'Ohne' }] : []),
  ] as { value: Background['type']; label: string }[];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="spread"><div className="section-title" style={{ margin: 0 }}>{label}</div>
        <Seg label={`${label}: Art`} value={mode} options={opts} onChange={(m) => {
          if (m === 'solid') onChange({ type: 'solid', color: c1 });
          else if (m === 'transparent') onChange({ type: 'transparent' });
          else if (m === 'linear') onChange({ type: 'linear', colors: [c1, c2 === c1 ? shift(c1) : c2], angle: value.type === 'linear' ? value.angle : 45 });
          else onChange({ type: 'radial', colors: [c1, c2 === c1 ? shift(c1) : c2] });
        }} />
      </div>
      {mode === 'solid' && <ColorInput label={label} value={c1} onChange={(c) => onChange({ type: 'solid', color: c })} />}
      {(mode === 'linear' || mode === 'radial') && (
        <>
          <div className="grid2">
            <ColorInput label={`${label} Start`} value={c1} onChange={(c) => onChange({ ...(value as Paint & { colors: [string, string] }), colors: [c, c2] } as Paint)} />
            <ColorInput label={`${label} Ende`} value={c2} onChange={(c) => onChange({ ...(value as Paint & { colors: [string, string] }), colors: [c1, c] } as Paint)} />
          </div>
          {value.type === 'linear' && <Slider label="Winkel" min={0} max={360} step={15} value={value.angle} format={(v) => `${v}°`} onChange={(v) => onChange({ ...value, angle: v })} />}
        </>
      )}
      {mode === 'transparent' && <p className="faint small">Der Code wird ohne Hintergrund exportiert. Ideal für Druckvorlagen auf hellem Papier.</p>}
    </div>
  );
}

function shift(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 60), g = Math.max(0, ((n >> 8) & 255) - 20), b = Math.min(255, (n & 255) + 90);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const PALETTE = ['#000000', '#15161c', '#2234d6', '#0b3d91', '#0b7285', '#1e4d2b', '#7a1f3d', '#b02a1b', '#5b21b6', '#8a5a00'];

// ------------------------------------------------------------ Logo

async function fileToLogo(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    if (text.length > 900_000) throw new Error('Die SVG-Datei ist zu groß (max. 900 KB).');
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Bitte wähle ein Bild im Format PNG, JPG, WebP oder SVG.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Das Bild konnte nicht gelesen werden.')); i.src = url; });
    const max = 600;
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------ Panel

export function DesignPanel({ payload }: { payload: string }) {
  const { design, setDesign, replaceDesign } = useEditor();
  const auth = useAuth();
  const editable = canEdit(auth.data?.user?.role);
  const [tab, setTab] = useState<Tab>('style');
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/api/templates') });
  const logoRef = useRef<HTMLInputElement>(null);
  const [iconQuery, setIconQuery] = useState('');


  const sample = payload || SAMPLE;
  const presetTiles = useMemo(() => STYLE_PRESETS.map((p) => ({ p, svg: mini(sample, applyPreset({ ...design, logo: DEFAULT_DESIGN.logo, frame: DEFAULT_DESIGN.frame }, p)) })), [sample, design.margin]);
  const neutral = { ...DEFAULT_DESIGN, fg: design.fg, bg: design.bg };

  const saveTemplate = async () => {
    try {
      await api.post('/api/templates', { name: tplName, design });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      setTplOpen(false);
      setTplName('');
      toast('Vorlage gespeichert');
    } catch (e) { toastError(e); }
  };

  const L = design.logo;
  const icons = Object.entries(ICONS).filter(([id, i]) => !iconQuery || id.includes(iconQuery.toLowerCase()) || i.label.toLowerCase().includes(iconQuery.toLowerCase()));

  return (
    <aside className="side side-right" aria-label="Design">
      <div className="design-tabs">
        <div role="tablist" aria-label="Designbereiche" style={{ display: 'flex', gap: 2 }}
          onKeyDown={(e) => {
            // Pfeiltasten wechseln zwischen den Tabs (WAI-ARIA-Muster)
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const i = TABS.findIndex((t) => t.id === tab);
            const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
            setTab(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
          }}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} aria-controls={`pane-${t.id}`} id={`tab-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="design-pane" role="tabpanel" id={`pane-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'style' && (
          <>
            <div>
              <div className="spread" style={{ marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>Stile</div>
                <button className="btn btn-sm" onClick={() => replaceDesign(surpriseDesign(design))}><Dices size={15} /> Überrasch mich</button>
              </div>
              <div className="opt-grid lg">
                {presetTiles.map(({ p, svg }) => (
                  <Opt key={p.id} large label={p.name} pressed={sameStyle(design, applyPreset(design, p))} onClick={() => replaceDesign(applyPreset(design, p))}><Mini svg={svg} /></Opt>
                ))}
              </div>
            </div>
            <div>
              <div className="spread" style={{ marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>Eigene Vorlagen</div>
                {editable && <button className="btn btn-sm" onClick={() => setTplOpen(true)}><Save size={14} /> Aktuelles Design sichern</button>}
              </div>
              {templates.data?.length ? (
                <div className="opt-grid lg">
                  {templates.data.map((t) => (
                    <Opt key={t.id} large label={t.name} pressed={JSON.stringify(t.design) === JSON.stringify(design)} onClick={() => replaceDesign(t.design)}><Mini svg={mini(sample, t.design)} /></Opt>
                  ))}
                </div>
              ) : <p className="faint small">Speichere dein Firmendesign mit Logo und Farben einmal als Vorlage und verwende es für jeden neuen Code.</p>}
            </div>
            <Dialog open={tplOpen} onOpenChange={setTplOpen} title="Design als Vorlage sichern" description="Farben, Formen, Logo und Rahmen werden übernommen, der Inhalt nicht."
              footer={<><button className="btn" onClick={() => setTplOpen(false)}>Abbrechen</button><button className="btn btn-primary" disabled={!tplName.trim()} onClick={saveTemplate}>Vorlage speichern</button></>}>
              <Field label="Name der Vorlage" htmlFor="tpl-name"><TextInput id="tpl-name" autoFocus value={tplName} placeholder="z. B. Firmendesign" onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tplName.trim()) void saveTemplate(); }} /></Field>
            </Dialog>
          </>
        )}

        {tab === 'shape' && (
          <>
            <div>
              <div className="section-title">Module</div>
              <div className="opt-grid">
                {BODY_SHAPES.map((b) => (
                  <Opt key={b.id} label={b.label} pressed={design.body.shape === b.id} onClick={() => setDesign((d) => ({ ...d, body: { ...d.body, shape: b.id } }))}>
                    <Mini svg={mini(SAMPLE, { ...neutral, margin: 1, body: { shape: b.id, size: 1 }, eyes: design.eyes }, 9)} />
                  </Opt>
                ))}
              </div>
            </div>
            {design.body.shape !== 'fluid' && design.body.shape !== 'classy' && (
              <Slider label="Modulgröße" min={0.6} max={1} step={0.02} value={design.body.size} format={(v) => `${Math.round(v * 100)} %`}
                onChange={(v) => setDesign((d) => ({ ...d, body: { ...d.body, size: v } }))} />
            )}
            <div>
              <div className="section-title">Rahmen der Ecken</div>
              <div className="opt-grid">
                {EYE_FRAMES.map((e) => (
                  <Opt key={e.id} label={e.label} pressed={design.eyes.frame === e.id} onClick={() => setDesign((d) => ({ ...d, eyes: { ...d.eyes, frame: e.id } }))}>
                    <Mini svg={mini(SAMPLE, { ...neutral, margin: 1, eyes: { ...design.eyes, frame: e.id } }, 7)} />
                  </Opt>
                ))}
              </div>
            </div>
            <div>
              <div className="section-title">Mitte der Ecken</div>
              <div className="opt-grid">
                {EYE_BALLS.map((e) => (
                  <Opt key={e.id} label={e.label} pressed={design.eyes.ball === e.id} onClick={() => setDesign((d) => ({ ...d, eyes: { ...d.eyes, ball: e.id } }))}>
                    <Mini svg={mini(SAMPLE, { ...neutral, margin: 1, eyes: { ...design.eyes, ball: e.id } }, 7)} />
                  </Opt>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'color' && (
          <>
            <div className="row wrap" style={{ gap: 6 }} aria-label="Schnellfarben">
              {PALETTE.map((c) => (
                <button key={c} className="swatch" style={{ width: 26, height: 26, borderRadius: 7, background: c }} aria-label={`Codefarbe ${c}`}
                  onClick={() => setDesign((d) => ({ ...d, fg: { type: 'solid', color: c }, frame: { ...d.frame, color: c } }))} />
              ))}
            </div>
            <PaintEditor label="Code" value={design.fg} onChange={(p) => setDesign((d) => ({ ...d, fg: p as Paint }))} />
            <PaintEditor label="Hintergrund" allowTransparent value={design.bg} onChange={(p) => setDesign((d) => ({ ...d, bg: p as Background }))} />
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={design.bg.type === 'transparent'}
              onClick={() => setDesign((d) => (d.bg.type === 'transparent' ? d : { ...d, fg: d.bg as Paint, bg: d.fg, eyes: { ...d.eyes, frameColor: null, ballColor: null } }))}>
              <ArrowLeftRight size={14} /> Farben tauschen
            </button>
            <div>
              <div className="section-title">Ecken eigens färben</div>
              <div className="stack" style={{ gap: 10 }}>
                <Switch label="Eigene Farbe für Eckrahmen" checked={!!design.eyes.frameColor}
                  onChange={(v) => setDesign((d) => ({ ...d, eyes: { ...d.eyes, frameColor: v ? '#2234d6' : null } }))} />
                {design.eyes.frameColor && <ColorInput label="Eckrahmen" value={design.eyes.frameColor} onChange={(c) => setDesign((d) => ({ ...d, eyes: { ...d.eyes, frameColor: c } }))} />}
                <Switch label="Eigene Farbe für Eckmitte" checked={!!design.eyes.ballColor}
                  onChange={(v) => setDesign((d) => ({ ...d, eyes: { ...d.eyes, ballColor: v ? '#d9480f' : null } }))} />
                {design.eyes.ballColor && <ColorInput label="Eckmitte" value={design.eyes.ballColor} onChange={(c) => setDesign((d) => ({ ...d, eyes: { ...d.eyes, ballColor: c } }))} />}
              </div>
            </div>
            <Slider label="Ecken des Hintergrunds" min={0} max={20} step={1} value={design.radius} format={(v) => (v ? `${v} %` : 'eckig')}
              onChange={(v) => setDesign((d) => ({ ...d, radius: v }))} />
          </>
        )}

        {tab === 'logo' && (
          <>
            <Seg full label="Logo" value={L.kind} onChange={(k) => setDesign((d) => ({ ...d, logo: { ...d.logo, kind: k } }))}
              options={[{ value: 'none', label: 'Ohne' }, { value: 'icon', label: 'Symbol' }, { value: 'image', label: 'Eigenes Bild' }]} />
            {L.kind === 'icon' && (
              <div>
                <input className="input" placeholder="Symbol suchen" value={iconQuery} onChange={(e) => setIconQuery(e.target.value)} aria-label="Symbol suchen" style={{ marginBottom: 10 }} />
                <div className="icon-grid">
                  {icons.map(([id, ic]) => (
                    <button key={id} className="opt" aria-pressed={L.icon === id} title={ic.label} aria-label={ic.label}
                      onClick={() => setDesign((d) => ({ ...d, logo: { ...d.logo, icon: id } }))}><Glyph id={id} size={20} /></button>
                  ))}
                </div>
                <div style={{ marginTop: 12 }} className="stack">
                  <Switch label="Eigene Symbolfarbe" checked={!!L.iconColor} onChange={(v) => setDesign((d) => ({ ...d, logo: { ...d.logo, iconColor: v ? ICONS[d.logo.icon]?.brandColor ?? '#2234d6' : null } }))}
                    help={L.iconColor ? undefined : 'Sonst übernimmt das Symbol die Codefarbe.'} />
                  {L.iconColor && <ColorInput label="Symbolfarbe" value={L.iconColor} onChange={(c) => setDesign((d) => ({ ...d, logo: { ...d.logo, iconColor: c } }))} />}
                </div>
              </div>
            )}
            {L.kind === 'image' && (
              <div>
                <div className="dropzone" role="button" tabIndex={0} onClick={() => logoRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') logoRef.current?.click(); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) try { const src = await fileToLogo(f); setDesign((d) => ({ ...d, logo: { ...d.logo, image: src } })); } catch (er) { toastError(er); } }}>
                  {L.image ? <img src={L.image} alt="Aktuelles Logo" style={{ width: 56, height: 56, objectFit: 'contain' }} /> : <ImagePlus size={22} />}
                  <b>{L.image ? 'Logo ersetzen' : 'Logo hochladen'}</b>
                  <span className="small faint">PNG, JPG, WebP oder SVG</span>
                </div>
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden
                  onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const src = await fileToLogo(f); setDesign((d) => ({ ...d, logo: { ...d.logo, image: src } })); } catch (er) { toastError(er); } }} />
                {L.image && <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setDesign((d) => ({ ...d, logo: { ...d.logo, image: null } }))}><Trash2 size={14} /> Logo entfernen</button>}
              </div>
            )}
            {L.kind !== 'none' && (
              <>
                <Slider label="Größe" min={0.1} max={0.32} step={0.01} value={L.size} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setDesign((d) => ({ ...d, logo: { ...d.logo, size: v } }))} />
                <Slider label="Innenabstand" min={0} max={0.35} step={0.01} value={L.padding} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setDesign((d) => ({ ...d, logo: { ...d.logo, padding: v } }))} />
                <div>
                  <div className="section-title">Fläche hinter dem Logo</div>
                  <Seg full label="Form der Logofläche" value={L.shape} onChange={(v) => setDesign((d) => ({ ...d, logo: { ...d.logo, shape: v } }))}
                    options={[{ value: 'square', label: 'Eckig' }, { value: 'rounded', label: 'Abgerundet' }, { value: 'circle', label: 'Rund' }]} />
                </div>
                <Switch label="Module unter dem Logo aussparen" help="Empfohlen. Sonst überdeckt das Logo Teile des Codes." checked={L.excavate}
                  onChange={(v) => setDesign((d) => ({ ...d, logo: { ...d.logo, excavate: v } }))} />
                {L.excavate && (
                  <>
                    <Switch label="Eigene Farbe der Logofläche" checked={!!L.plate} onChange={(v) => setDesign((d) => ({ ...d, logo: { ...d.logo, plate: v ? '#ffffff' : null } }))} />
                    {L.plate && <ColorInput label="Logofläche" value={L.plate} onChange={(c) => setDesign((d) => ({ ...d, logo: { ...d.logo, plate: c } }))} />}
                  </>
                )}
                {design.ec !== 'auto' && design.ec !== 'H' && (
                  <div className="notice notice-warn"><span>Mit Logo ist Fehlerkorrektur H am sichersten.</span>
                    <button className="btn btn-sm" onClick={() => setDesign((d) => ({ ...d, ec: 'H' }))}>Auf H stellen</button></div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'frame' && (
          <>
            <div className="opt-grid lg">
              {FRAME_STYLES.map((f) => (
                <Opt key={f.id} large label={f.label} pressed={design.frame.style === f.id} onClick={() => setDesign((d) => ({ ...d, frame: { ...d.frame, style: f.id } }))}>
                  <Mini svg={mini(SAMPLE, { ...design, logo: DEFAULT_DESIGN.logo, margin: 2, frame: { ...design.frame, style: f.id, text: design.frame.text || 'Scan mich' } })} />
                </Opt>
              ))}
            </div>
            {design.frame.style !== 'none' && (
              <>
                <Field label="Beschriftung" htmlFor="frame-text" aside={<span className="faint" style={{ fontWeight: 400 }}>{design.frame.text.length}/40</span>}>
                  <TextInput id="frame-text" maxLength={40} value={design.frame.text} onChange={(e) => setDesign((d) => ({ ...d, frame: { ...d.frame, text: e.target.value } }))} />
                </Field>
                <div className="row wrap" style={{ gap: 6 }}>
                  {['Scan mich', 'Jetzt scannen', 'WLAN verbinden', 'Kontakt speichern', 'Mehr erfahren', 'Termin buchen'].map((t) => (
                    <button key={t} className="chip" onClick={() => setDesign((d) => ({ ...d, frame: { ...d.frame, text: t } }))}>{t}</button>
                  ))}
                </div>
                <Field label="Schrift" htmlFor="frame-font">
                  <select id="frame-font" className="select" value={design.frame.font} onChange={(e) => setDesign((d) => ({ ...d, frame: { ...d.frame, font: e.target.value as Design['frame']['font'] } }))}>
                    {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </Field>
                <div className="grid2">
                  <Field label={design.frame.style === 'caption' || design.frame.style === 'brackets' ? 'Farbe' : 'Rahmenfarbe'}><ColorInput label="Rahmenfarbe" value={design.frame.color} onChange={(c) => setDesign((d) => ({ ...d, frame: { ...d.frame, color: c } }))} /></Field>
                  {design.frame.style !== 'caption' && design.frame.style !== 'brackets' && (
                    <Field label="Schriftfarbe"><ColorInput label="Schriftfarbe" value={design.frame.textColor} onChange={(c) => setDesign((d) => ({ ...d, frame: { ...d.frame, textColor: c } }))} /></Field>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'tech' && (
          <>
            <div>
              <div className="section-title">Fehlerkorrektur</div>
              <Seg full label="Fehlerkorrektur" value={design.ec} onChange={(v) => setDesign((d) => ({ ...d, ec: v }))}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'L', label: 'L' }, { value: 'M', label: 'M' }, { value: 'Q', label: 'Q' }, { value: 'H', label: 'H' }]} />
              <p className="faint small" style={{ marginTop: 8 }}>
                Wie viel Beschädigung der Code verträgt: L 7 %, M 15 %, Q 25 %, H 30 %. Mehr Korrektur macht den Code dichter.
                Automatik wählt H mit Logo, Q für gestaltete Formen und M für klassische Codes.
              </p>
            </div>
            <Slider label="Ruhezone (Rand)" min={0} max={10} step={1} value={design.margin} format={(v) => `${v} Module`} onChange={(v) => setDesign((d) => ({ ...d, margin: v }))} />
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => replaceDesign(DEFAULT_DESIGN)}>Design zurücksetzen</button>
          </>
        )}
      </div>
    </aside>
  );
}
