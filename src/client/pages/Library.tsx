// Bibliothek: alle Codes finden, ordnen und gemeinsam exportieren.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Check, Copy, Download, FolderInput, FolderPlus, LayoutGrid, Link2, List, MoreHorizontal, Pencil,
  Plus, RotateCcw, Search, Star, Tag, Trash2, X, Inbox, Layers,
} from 'lucide-react';
import { CONTENT_TYPES, getType } from '@shared/content';
import { api, saveBlob } from '../lib/api';
import { canEdit, relTime, useAuth, useDebounced, useHotkey } from '../lib/hooks';
import { toast, toastError } from '../lib/toast';
import type { CodeListItem, Facets, Folder } from '../lib/types';
import { Confirm, Dialog, Field, Glyph, Seg, Switch, TextInput } from '../components/ui';

const PAGE = 60;

function useLibParams() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setSp(next, { replace: true });
  };
  return { get, set, sp };
}

export function LibraryPage() {
  const { get, set } = useLibParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const editable = canEdit(auth.data?.user?.role);
  const [search, setSearch] = useState(get('q'));
  const dq = useDebounced(search, 200);
  useEffect(() => { if (dq !== get('q')) set({ q: dq || null }); }, [dq]);
  const view = (get('view') || 'grid') as 'grid' | 'list';
  const trash = get('trash') === '1';
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkey('/', () => searchRef.current?.focus());

  const filters = { q: get('q'), type: get('type'), kind: get('kind'), folder: get('folder'), tag: get('tag'), fav: get('fav'), trash: get('trash'), sort: get('sort') || 'updated' };
  const qs = (offset: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), limit: String(PAGE), offset: String(offset) }).toString();
  const list = useInfiniteQuery({
    queryKey: ['codes', 'list', filters],
    queryFn: ({ pageParam }) => api.get<{ items: CodeListItem[]; total: number }>(`/api/codes?${qs(pageParam)}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (all.length * PAGE < last.total ? all.length * PAGE : undefined),
  });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const facets = useQuery({ queryKey: ['facets'], queryFn: () => api.get<Facets>('/api/codes/facets') });
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.get<Folder[]>('/api/folders') });

  // Nachladen beim Scrollen
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, items.length]);

  // Auswahl
  const [sel, setSel] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null);
  useEffect(() => { setSel(new Set()); }, [JSON.stringify(filters)]);
  const toggle = (id: string, idx: number, shift: boolean) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked.current !== null) {
        const [a, b] = [lastClicked.current, idx].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) next.add(items[i].id);
      } else if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    lastClicked.current = idx;
  };
  useHotkey('escape', () => setSel(new Set()));
  useHotkey('mod+a', () => setSel(new Set(items.map((i) => i.id))), items.length > 0, false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['codes'] });
    qc.invalidateQueries({ queryKey: ['facets'] });
  };
  const bulk = async (action: string, extra: Record<string, unknown> = {}, ids = [...sel]) => {
    try {
      const r = await api.post<{ changed: number }>('/api/codes/bulk', { action, ids, ...extra });
      refresh();
      setSel(new Set());
      return r;
    } catch (e) { toastError(e); return null; }
  };

  const [exportIds, setExportIds] = useState<string[] | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const removeOne = async (c: CodeListItem) => {
    await bulk('delete', {}, [c.id]);
    toast(`„${c.name}“ im Papierkorb`, { action: { label: 'Rückgängig', run: () => void bulk('restore', {}, [c.id]) } });
  };
  const duplicateOne = async (c: CodeListItem) => {
    try {
      const d = await api.post<{ id: string }>(`/api/codes/${c.id}/duplicate`, {});
      refresh();
      toast('Kopie angelegt', { action: { label: 'Öffnen', run: () => navigate(`/codes/${d.id}`) } });
    } catch (e) { toastError(e); }
  };
  const downloadOne = async (c: CodeListItem) => {
    try {
      const r = await api.file(`/api/codes/${c.id}/export?format=png&size=1024`);
      saveBlob(r.blob, r.name);
    } catch (e) { toastError(e); }
  };
  const favOne = (c: CodeListItem) => void bulk('favorite', { value: !c.favorite }, [c.id]);

  const scopeTitle = trash ? 'Papierkorb' : get('fav') ? 'Favoriten' : get('kind') === 'dynamic' ? 'Dynamische Codes'
    : get('folder') === 'none' ? 'Ohne Ordner' : get('folder') ? folders.data?.find((f) => f.id === get('folder'))?.name ?? 'Ordner'
    : get('tag') ? `#${get('tag')}` : 'Alle Codes';

  return (
    <div className="lib">
      <LibrarySidebar facets={facets.data} folders={folders.data ?? []} get={get} set={set} editable={editable} onChanged={refresh} />
      <div className="lib-main">
        <div className="lib-toolbar">
          <div className="search">
            <Search size={16} />
            <input ref={searchRef} className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, Inhalt, Schlagwort oder Kurzlink" aria-label="Codes durchsuchen" data-testid="library-search" />
            {!search && <span className="kbd">/</span>}
          </div>
          <select className="select mobile-only" style={{ width: 'auto' }} aria-label="Bereich"
            value={trash ? 'trash' : get('fav') ? 'fav' : get('kind') === 'dynamic' ? 'dynamic' : get('folder') ? `f:${get('folder')}` : get('tag') ? `t:${get('tag')}` : ''}
            onChange={(e) => {
              const v = e.target.value;
              const clear = { folder: null, tag: null, fav: null, kind: null, trash: null };
              if (!v) set(clear);
              else if (v === 'trash') set({ ...clear, trash: '1' });
              else if (v === 'fav') set({ ...clear, fav: '1' });
              else if (v === 'dynamic') set({ ...clear, kind: 'dynamic' });
              else if (v.startsWith('f:')) set({ ...clear, folder: v.slice(2) });
              else if (v.startsWith('t:')) set({ ...clear, tag: v.slice(2) });
            }}>
            <option value="">Alle Codes</option>
            <option value="fav">Favoriten</option>
            <option value="dynamic">Dynamisch</option>
            <option value="f:none">Ohne Ordner</option>
            {folders.data?.map((f) => <option key={f.id} value={`f:${f.id}`}>Ordner: {f.name}</option>)}
            {facets.data?.tags.map((t) => <option key={t.tag} value={`t:${t.tag}`}>#{t.tag}</option>)}
            <option value="trash">Papierkorb</option>
          </select>
          <select className="select" style={{ width: 'auto' }} value={get('type')} onChange={(e) => set({ type: e.target.value || null })} aria-label="Nach Typ filtern">
            <option value="">Alle Typen</option>
            {CONTENT_TYPES.filter((t) => facets.data?.types[t.id]).map((t) => <option key={t.id} value={t.id}>{t.label} ({facets.data?.types[t.id]})</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={filters.sort} onChange={(e) => set({ sort: e.target.value === 'updated' ? null : e.target.value })} aria-label="Sortierung">
            <option value="updated">Zuletzt geändert</option>
            <option value="created">Neueste zuerst</option>
            <option value="name">Name A–Z</option>
            <option value="type">Typ</option>
            <option value="scans">Meiste Scans</option>
          </select>
          <Seg label="Ansicht" value={view} onChange={(v) => set({ view: v === 'grid' ? null : v })}
            options={[{ value: 'grid', label: <LayoutGrid size={15} />, title: 'Raster' }, { value: 'list', label: <List size={15} />, title: 'Liste' }]} />
          <span className="grow" />
          {editable && <Link to="/neu" className="btn btn-primary"><Plus size={16} /> Neuer Code</Link>}
        </div>
        <div className={`lib-content ${sel.size ? 'selecting' : ''}`}>
          <div className="lib-meta">
            <span><b style={{ color: 'var(--ink)', fontSize: 15 }}>{scopeTitle}</b> · {total} {total === 1 ? 'Code' : 'Codes'}</span>
            {items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}>
              {sel.size === items.length ? 'Auswahl aufheben' : 'Alle auswählen'}
            </button>}
          </div>
          {list.isLoading ? <div className="empty"><p>Wird geladen …</p></div> : items.length === 0 ? (
            <EmptyLibrary trash={trash} filtered={!!(filters.q || filters.type || filters.tag || filters.folder || filters.fav || filters.kind)} editable={editable} />
          ) : view === 'grid' ? (
            <div className="cards">
              {items.map((c, i) => (
                <CodeCard key={c.id} c={c} selected={sel.has(c.id)} onToggle={(shift) => toggle(c.id, i, shift)} trash={trash} editable={editable}
                  onDelete={() => removeOne(c)} onDuplicate={() => duplicateOne(c)} onDownload={() => downloadOne(c)} onFav={() => favOne(c)}
                  onRestore={() => void bulk('restore', {}, [c.id])} folders={folders.data ?? []} onMove={(f) => void bulk('move', { folderId: f }, [c.id])} />
              ))}
            </div>
          ) : (
            <div className="list" role="table" aria-label="Codes">
              <div className="list-row list-head" role="row">
                <span /><span /><span>Name</span><span className="hide-m">Inhalt</span><span className="hide-m">Typ</span><span className="hide-m">Geändert</span><span />
              </div>
              {items.map((c, i) => (
                <div className="list-row" role="row" key={c.id} data-selected={sel.has(c.id)}>
                  <button className="check-box" role="checkbox" aria-checked={sel.has(c.id)} aria-label={`${c.name} auswählen`} onClick={(e) => toggle(c.id, i, e.shiftKey)}><Check size={14} /></button>
                  <img src={`/api/codes/${c.id}/preview.svg?v=${encodeURIComponent(c.updatedAt)}`} alt="" loading="lazy" />
                  <Link to={trash ? '#' : `/codes/${c.id}`} className="card-name" style={{ minWidth: 0 }}>{c.favorite && <Star size={12} fill="currentColor" style={{ display: 'inline', marginRight: 4, color: 'var(--warn)' }} />}{c.name}</Link>
                  <span className="card-sum hide-m">{c.shortUrl ?? c.summary}</span>
                  <span className="hide-m small row" style={{ gap: 6 }}><Glyph id={getType(c.type).icon} size={13} /> {getType(c.type).label}</span>
                  <span className="hide-m small faint">{relTime(c.updatedAt)}</span>
                  <button className="btn btn-ghost btn-sm btn-icon" aria-label="PNG herunterladen" onClick={() => downloadOne(c)}><Download size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <div ref={sentinel} style={{ height: 1 }} />
          {list.isFetchingNextPage && <p className="faint small" style={{ textAlign: 'center', marginTop: 16 }}>Weitere werden geladen …</p>}
        </div>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar" role="toolbar" aria-label="Aktionen für Auswahl">
          <b>{sel.size} ausgewählt</b>
          {!trash ? (
            <>
              <button className="btn btn-sm" onClick={() => setExportIds([...sel])}><Download size={15} /> Exportieren</button>
              {editable && (
                <>
                  <Menu.Root>
                    <Menu.Trigger className="btn btn-sm"><FolderInput size={15} /> Verschieben</Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content className="menu" side="top" sideOffset={8}>
                        <Menu.Item className="menu-item" onSelect={() => void bulk('move', { folderId: null }).then((r) => r && toast('Aus Ordnern entfernt'))}><Inbox size={15} /> Kein Ordner</Menu.Item>
                        {folders.data?.map((f) => (
                          <Menu.Item key={f.id} className="menu-item" onSelect={() => void bulk('move', { folderId: f.id }).then((r) => r && toast(`In „${f.name}“ verschoben`))}>
                            <span className="fdot" style={{ width: 9, height: 9, borderRadius: 3, background: f.color }} /> {f.name}
                          </Menu.Item>
                        ))}
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                  <button className="btn btn-sm" onClick={() => setTagOpen(true)}><Tag size={15} /> Schlagwort</button>
                  <button className="btn btn-sm" onClick={() => void bulk('favorite', { value: true }).then((r) => r && toast('Als Favorit markiert'))}><Star size={15} /> Favorit</button>
                  <button className="btn btn-sm" onClick={() => {
                    const ids = [...sel];
                    void bulk('delete', {}, ids).then((r) => r && toast(`${ids.length} im Papierkorb`, { action: { label: 'Rückgängig', run: () => void bulk('restore', {}, ids) } }));
                  }}><Trash2 size={15} /> Löschen</button>
                </>
              )}
            </>
          ) : editable && (
            <>
              <button className="btn btn-sm" onClick={() => void bulk('restore').then((r) => r && toast('Wiederhergestellt'))}><RotateCcw size={15} /> Wiederherstellen</button>
              <button className="btn btn-sm" onClick={() => setPurgeOpen(true)}><Trash2 size={15} /> Endgültig löschen</button>
            </>
          )}
          <button className="btn btn-sm btn-icon" aria-label="Auswahl aufheben" onClick={() => setSel(new Set())}><X size={15} /></button>
        </div>
      )}

      <BatchExportDialog ids={exportIds} onClose={() => setExportIds(null)} />
      <TagDialog open={tagOpen} onOpenChange={setTagOpen} suggestions={facets.data?.tags.map((t) => t.tag) ?? []}
        onApply={async (tag, remove) => { const r = await bulk(remove ? 'untag' : 'tag', { tag }); if (r) toast(remove ? `Schlagwort „${tag}“ entfernt` : `Schlagwort „${tag}“ vergeben`); }} />
      <Confirm open={purgeOpen} onOpenChange={setPurgeOpen} title="Endgültig löschen?" danger confirmLabel="Endgültig löschen"
        body={`${sel.size} Codes werden unwiderruflich gelöscht. Gedruckte dynamische Codes führen danach ins Leere.`}
        onConfirm={() => void bulk('purge').then((r) => r && toast('Endgültig gelöscht'))} />
    </div>
  );
}

function EmptyLibrary({ trash, filtered, editable }: { trash: boolean; filtered: boolean; editable: boolean }) {
  if (trash) return <div className="empty"><Trash2 size={28} /><h2>Der Papierkorb ist leer</h2><p>Gelöschte Codes landen hier und lassen sich wiederherstellen.</p></div>;
  if (filtered) return <div className="empty"><Search size={28} /><h2>Keine Treffer</h2><p>Ändere die Suche oder entferne Filter.</p></div>;
  return (
    <div className="empty">
      <Layers size={28} />
      <h2>Noch keine Codes gespeichert</h2>
      <p>Gespeicherte Codes erscheinen hier, mit Ordnern, Schlagwörtern und Suche.</p>
      {editable && <div className="row"><Link to="/neu" className="btn btn-primary"><Plus size={16} /> Ersten Code erstellen</Link><Link to="/serien" className="btn">Aus Tabelle erzeugen</Link></div>}
    </div>
  );
}

function CodeCard({ c, selected, onToggle, trash, editable, onDelete, onDuplicate, onDownload, onFav, onRestore, folders, onMove }: {
  c: CodeListItem; selected: boolean; onToggle: (shift: boolean) => void; trash: boolean; editable: boolean;
  onDelete: () => void; onDuplicate: () => void; onDownload: () => void; onFav: () => void; onRestore: () => void; folders: Folder[]; onMove: (f: string | null) => void;
}) {
  const t = getType(c.type);
  const navigate = useNavigate();
  const expired = c.expiresAt && c.expiresAt < new Date().toISOString();
  return (
    <article className="card" data-selected={selected} data-testid="code-card">
      <div className="card-check">
        <button className="check-box" role="checkbox" aria-checked={selected} aria-label={`${c.name} auswählen`} onClick={(e) => onToggle(e.shiftKey)}><Check size={14} /></button>
      </div>
      <div className="card-actions">
        {!trash && editable && (
          <button className="btn btn-sm btn-icon" onClick={onFav} aria-label={c.favorite ? 'Kein Favorit mehr' : 'Als Favorit markieren'} aria-pressed={c.favorite}>
            <Star size={14} fill={c.favorite ? 'currentColor' : 'none'} />
          </button>
        )}
        <Menu.Root>
          <Menu.Trigger className="btn btn-sm btn-icon" aria-label={`Aktionen für ${c.name}`}><MoreHorizontal size={15} /></Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="menu" align="end" sideOffset={4}>
              {trash ? (
                <Menu.Item className="menu-item" onSelect={onRestore} disabled={!editable}><RotateCcw size={15} /> Wiederherstellen</Menu.Item>
              ) : (
                <>
                  <Menu.Item className="menu-item" onSelect={() => navigate(`/codes/${c.id}`)}><Pencil size={15} /> Bearbeiten</Menu.Item>
                  <Menu.Item className="menu-item" onSelect={onDownload}><Download size={15} /> PNG herunterladen</Menu.Item>
                  {c.shortUrl && <Menu.Item className="menu-item" onSelect={() => { void navigator.clipboard.writeText(c.shortUrl!); toast('Kurzlink kopiert'); }}><Link2 size={15} /> Kurzlink kopieren</Menu.Item>}
                  {editable && <Menu.Item className="menu-item" onSelect={onDuplicate}><Copy size={15} /> Duplizieren</Menu.Item>}
                  {editable && (
                    <Menu.Sub>
                      <Menu.SubTrigger className="menu-item"><FolderInput size={15} /> Verschieben nach</Menu.SubTrigger>
                      <Menu.Portal>
                        <Menu.SubContent className="menu" sideOffset={4}>
                          <Menu.Item className="menu-item" onSelect={() => onMove(null)}><Inbox size={15} /> Kein Ordner</Menu.Item>
                          {folders.map((f) => <Menu.Item key={f.id} className="menu-item" onSelect={() => onMove(f.id)}><span style={{ width: 9, height: 9, borderRadius: 3, background: f.color }} /> {f.name}</Menu.Item>)}
                        </Menu.SubContent>
                      </Menu.Portal>
                    </Menu.Sub>
                  )}
                  {editable && <><Menu.Separator className="menu-sep" /><Menu.Item className="menu-item danger" onSelect={onDelete}><Trash2 size={15} /> In den Papierkorb</Menu.Item></>}
                </>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="card-art" onClick={(e) => (trash || e.shiftKey || e.metaKey ? onToggle(e.shiftKey) : navigate(`/codes/${c.id}`))}>
        <img src={`/api/codes/${c.id}/preview.svg?v=${encodeURIComponent(c.updatedAt)}`} alt={`QR-Code ${c.name}`} loading="lazy" />
      </div>
      <div className="card-body">
        <Link to={trash ? '#' : `/codes/${c.id}`} className="card-name">{c.name}</Link>
        <span className="card-sum">{c.shortUrl ? c.shortUrl.replace(/^https?:\/\//, '') : c.summary || '—'}</span>
        <div className="card-meta">
          <span className="chip"><Glyph id={t.icon} size={12} /> {t.label}</span>
          {c.kind === 'dynamic' && <span className="chip chip-accent">Dynamisch</span>}
          {c.kind === 'dynamic' && !c.enabled && <span className="chip chip-warn">Pausiert</span>}
          {expired && <span className="chip chip-fail">Abgelaufen</span>}
          {c.kind === 'dynamic' && c.tracking && <span className="chip">{c.scanTotal} Scans</span>}
        </div>
      </div>
    </article>
  );
}

function LibrarySidebar({ facets, folders, get, set, editable, onChanged }: {
  facets?: Facets; folders: Folder[]; get: (k: string) => string; set: (p: Record<string, string | null>) => void; editable: boolean; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState<string | null>(null);
  const [rename, setRename] = useState<Folder | null>(null);
  const [del, setDel] = useState<Folder | null>(null);
  const clear = { folder: null, tag: null, fav: null, kind: null, trash: null };
  const is = (k: string, v: string) => get(k) === v;
  const noScope = !get('folder') && !get('tag') && !get('fav') && !get('kind') && !get('trash');
  const create = async () => {
    const name = newName?.trim();
    setNewName(null);
    if (!name) return;
    try {
      const f = await api.post<Folder>('/api/folders', { name, color: ['#2234d6', '#0b7285', '#1e4d2b', '#7a1f3d', '#b7791f', '#5b21b6'][folders.length % 6] });
      qc.invalidateQueries({ queryKey: ['folders'] });
      set({ ...clear, folder: f.id });
    } catch (e) { toastError(e); }
  };
  return (
    <nav className="lib-side" aria-label="Bibliothek filtern">
      <h2>Bibliothek</h2>
      <button className="nav-item" aria-current={noScope} onClick={() => set(clear)}><Layers size={16} /> Alle Codes <span className="count">{facets?.counts.total ?? ''}</span></button>
      <button className="nav-item" aria-current={is('fav', '1')} onClick={() => set({ ...clear, fav: '1' })}><Star size={16} /> Favoriten <span className="count">{facets?.counts.favorites || ''}</span></button>
      <button className="nav-item" aria-current={is('kind', 'dynamic')} onClick={() => set({ ...clear, kind: 'dynamic' })}><Link2 size={16} /> Dynamisch <span className="count">{facets?.counts.dynamic || ''}</span></button>
      <button className="nav-item" aria-current={is('folder', 'none')} onClick={() => set({ ...clear, folder: 'none' })}><Inbox size={16} /> Ohne Ordner <span className="count">{facets?.counts.unfiled || ''}</span></button>

      <div className="nav-group">
        <div className="nav-group-title">Ordner {editable && <button className="btn btn-ghost btn-sm btn-icon" aria-label="Neuer Ordner" onClick={() => setNewName('')}><FolderPlus size={15} /></button>}</div>
        {folders.map((f) => (
          <div key={f.id} className="row" style={{ gap: 0 }}>
            <button className="nav-item" aria-current={is('folder', f.id)} onClick={() => set({ ...clear, folder: f.id })}>
              <span className="fdot" style={{ background: f.color }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span className="count">{facets?.folders[f.id] || ''}</span>
            </button>
            {editable && (
              <Menu.Root>
                <Menu.Trigger className="btn btn-ghost btn-sm btn-icon" aria-label={`Ordner ${f.name} bearbeiten`}><MoreHorizontal size={14} /></Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content className="menu" align="start">
                    <Menu.Item className="menu-item" onSelect={() => setRename(f)}><Pencil size={15} /> Umbenennen</Menu.Item>
                    <Menu.Item className="menu-item danger" onSelect={() => setDel(f)}><Trash2 size={15} /> Ordner löschen</Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            )}
          </div>
        ))}
        {newName !== null && (
          <input className="input" autoFocus value={newName} placeholder="Name des Ordners" aria-label="Name des neuen Ordners" style={{ marginTop: 4 }}
            onChange={(e) => setNewName(e.target.value)} onBlur={create} onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setNewName(null); }} />
        )}
        {!folders.length && newName === null && <p className="faint small" style={{ padding: '4px 10px' }}>Noch keine Ordner.</p>}
      </div>

      {!!facets?.tags.length && (
        <div className="nav-group">
          <div className="nav-group-title">Schlagwörter</div>
          {facets.tags.slice(0, 30).map((t) => (
            <button key={t.tag} className="nav-item" aria-current={is('tag', t.tag)} onClick={() => set({ ...clear, tag: t.tag })}><Tag size={14} /> {t.tag} <span className="count">{t.count}</span></button>
          ))}
        </div>
      )}
      <div className="nav-group">
        <button className="nav-item" aria-current={is('trash', '1')} onClick={() => set({ ...clear, trash: '1' })}><Trash2 size={16} /> Papierkorb <span className="count">{facets?.counts.trash || ''}</span></button>
      </div>

      <Dialog open={!!rename} onOpenChange={(v) => !v && setRename(null)} title="Ordner umbenennen"
        footer={<><button className="btn" onClick={() => setRename(null)}>Abbrechen</button><button className="btn btn-primary" onClick={async () => {
          try { await api.patch(`/api/folders/${rename!.id}`, { name: rename!.name, color: rename!.color }); qc.invalidateQueries({ queryKey: ['folders'] }); setRename(null); } catch (e) { toastError(e); }
        }}>Speichern</button></>}>
        {rename && (
          <div className="stack">
            <Field label="Name" htmlFor="fname2"><TextInput id="fname2" autoFocus value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field>
            <div className="row" style={{ gap: 6 }}>
              {['#2234d6', '#0b7285', '#1e4d2b', '#7a1f3d', '#b7791f', '#5b21b6', '#4a4f5e'].map((c) => (
                <button key={c} className="swatch" style={{ width: 28, height: 28, background: c, outline: rename.color === c ? '2px solid var(--ink)' : undefined, outlineOffset: 2 }} aria-label={`Farbe ${c}`} onClick={() => setRename({ ...rename, color: c })} />
              ))}
            </div>
          </div>
        )}
      </Dialog>
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`Ordner „${del?.name}“ löschen?`} confirmLabel="Ordner löschen" danger
        body="Die Codes darin bleiben erhalten und landen unter „Ohne Ordner“."
        onConfirm={async () => { try { await api.del(`/api/folders/${del!.id}`); qc.invalidateQueries({ queryKey: ['folders'] }); onChanged(); if (get('folder') === del!.id) set(clear); } catch (e) { toastError(e); } }} />
    </nav>
  );
}

function TagDialog({ open, onOpenChange, onApply, suggestions }: { open: boolean; onOpenChange: (v: boolean) => void; onApply: (tag: string, remove: boolean) => void; suggestions: string[] }) {
  const [tag, setTag] = useState('');
  const [remove, setRemove] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Schlagwort für Auswahl"
      footer={<><button className="btn" onClick={() => onOpenChange(false)}>Abbrechen</button><button className="btn btn-primary" disabled={!tag.trim()} onClick={() => { onApply(tag.trim(), remove); onOpenChange(false); setTag(''); }}>{remove ? 'Entfernen' : 'Vergeben'}</button></>}>
      <div className="stack">
        <Field label="Schlagwort" htmlFor="bulk-tag"><TextInput id="bulk-tag" list="bulk-tags" autoFocus value={tag} onChange={(e) => setTag(e.target.value)} /></Field>
        <datalist id="bulk-tags">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <Switch label="Schlagwort entfernen statt vergeben" checked={remove} onChange={setRemove} />
      </div>
    </Dialog>
  );
}

export function BatchExportDialog({ ids, onClose, rows }: { ids: string[] | null; onClose: () => void; rows?: { type: string; items: unknown[]; design: unknown } }) {
  const open = !!ids || !!rows;
  const [mode, setMode] = useState<'zip' | 'sheet'>('zip');
  const [formats, setFormats] = useState<string[]>(['png']);
  const [size, setSize] = useState(1024);
  const [mm, setMm] = useState(40);
  const [paper, setPaper] = useState('A4');
  const [cols, setCols] = useState(4);
  const [rowsN, setRowsN] = useState(6);
  const [labels, setLabels] = useState(true);
  const [busy, setBusy] = useState(false);
  const count = ids?.length ?? rows?.items.length ?? 0;
  const run = async () => {
    setBusy(true);
    try {
      const opts = mode === 'sheet' ? { sheet: { paper, cols, rows: rowsN, labels, marginMm: 10 } } : { formats, size, mm, dpi: 300 };
      const r = rows ? await api.file('/api/batch/export', { ...rows, ...opts }) : await api.file('/api/codes/export', { ids, ...opts });
      saveBlob(r.blob, r.name);
      toast(r.skipped ? `Exportiert. Übersprungen (unvollständig): ${r.skipped}` : `${count} Codes exportiert`, { ms: r.skipped ? 7000 : 3200 });
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const toggleFmt = (f: string) => setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title={`${count} Codes exportieren`}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || (mode === 'zip' && !formats.length)} onClick={run} data-testid="batch-export-run"><Download size={15} /> {busy ? 'Wird erstellt …' : mode === 'zip' ? 'ZIP herunterladen' : 'PDF herunterladen'}</button></>}>
      <div className="stack">
        <Seg full label="Ausgabe" value={mode} onChange={setMode} options={[{ value: 'zip', label: 'Einzeldateien (ZIP)' }, { value: 'sheet', label: 'Etikettenbogen (PDF)' }]} />
        {mode === 'zip' ? (
          <>
            <div className="row" role="group" aria-label="Formate">
              {['png', 'svg', 'pdf'].map((f) => <button key={f} className="chip" aria-pressed={formats.includes(f)} onClick={() => toggleFmt(f)}>{f.toUpperCase()}</button>)}
            </div>
            <div className="grid2">
              <Field label="PNG-Breite" htmlFor="bx"><select id="bx" className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[512, 1024, 2048, 4096].map((v) => <option key={v} value={v}>{v} px</option>)}</select></Field>
              <Field label="SVG/PDF-Breite" htmlFor="bm"><TextInput id="bm" type="number" min={10} value={mm} onChange={(e) => setMm(Number(e.target.value))} /></Field>
            </div>
            <p className="faint small">Das Archiv enthält zusätzlich eine Übersicht als CSV. Vertrauliche Inhalte wie WLAN-Passwörter sind darin nicht aufgeführt.</p>
          </>
        ) : (
          <>
            <div className="grid2">
              <Field label="Papier" htmlFor="pp"><select id="pp" className="select" value={paper} onChange={(e) => setPaper(e.target.value)}><option value="A4">A4</option><option value="A3">A3</option><option value="LETTER">US Letter</option></select></Field>
              <div />
              <Field label="Spalten" htmlFor="pc"><TextInput id="pc" type="number" min={1} max={10} value={cols} onChange={(e) => setCols(Number(e.target.value))} /></Field>
              <Field label="Zeilen" htmlFor="pr"><TextInput id="pr" type="number" min={1} max={14} value={rowsN} onChange={(e) => setRowsN(Number(e.target.value))} /></Field>
            </div>
            <Switch label="Name unter jeden Code drucken" checked={labels} onChange={setLabels} />
            <p className="faint small">{cols * rowsN} Codes pro Seite, {Math.ceil(count / (cols * rowsN))} {Math.ceil(count / (cols * rowsN)) === 1 ? 'Seite' : 'Seiten'}. Feine Schnittlinien helfen beim Zuschneiden.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

