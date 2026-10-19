// Editor: Inhalt links, Andruck in der Mitte, Designstudio rechts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, MoreHorizontal, Redo2, Save, Trash2, Undo2 } from 'lucide-react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { getType, type ContentData, type Issue } from '@shared/content';
import { sanitizeDesign } from '@shared/design';
import { api, ApiError } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { canEdit, MOD_KEY, useAuth, useHotkey, useSettings } from '../lib/hooks';
import { toast, toastError } from '../lib/toast';
import type { CodeDetail, Template } from '../lib/types';
import { Confirm, Dialog, Glyph, Tip } from '../components/ui';
import { ContentPanel } from '../editor/ContentPanel';
import { DesignPanel } from '../editor/DesignPanel';
import { ScanPanel, Stage } from '../editor/Stage';
import { ExportDialog } from '../editor/ExportDialog';
import { useQr } from '../editor/useQr';

export function EditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const settings = useSettings();
  const s = useEditor();
  const [printMm, setPrintMm] = useState(40);
  const [exportOpen, setExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = canEdit(auth.data?.user?.role);

  // Laden bzw. neu beginnen
  const detail = useQuery({ queryKey: ['code', id], queryFn: () => api.get<CodeDetail>(`/api/codes/${id}`), enabled: !!id, staleTime: 0, gcTime: 0 });
  useEffect(() => {
    if (id && detail.data && useEditor.getState().id !== detail.data.id) s.load(detail.data);
  }, [id, detail.data]);
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/api/templates'), enabled: !id });
  // Neuer Code: genau einmal pro Seitenaufruf beginnen. Die Standardvorlage wird nachgeladen,
  // ohne bereits Eingegebenes zu überschreiben.
  const startedFor = useRef<string | null>(null);
  const st = location.state as { type?: string; content?: ContentData; design?: unknown } | null;
  useEffect(() => {
    if (id || startedFor.current === location.key) return;
    startedFor.current = location.key;
    const type = st?.type ?? params.get('type') ?? 'url';
    s.startNew(getType(type).id, st?.content, st?.design ? sanitizeDesign(st.design) : undefined);
  }, [id, location.key]);
  const tplApplied = useRef<string | null>(null);
  useEffect(() => {
    if (id || st?.design || tplApplied.current === location.key) return;
    if (!templates.isSuccess || !settings.isSuccess) return;
    tplApplied.current = location.key;
    const tpl = templates.data?.find((t) => t.id === settings.data?.defaultTemplateId);
    const ed = useEditor.getState();
    if (tpl && !ed.id && ed.past.length === 0) useEditor.setState({ design: sanitizeDesign(tpl.design) });
  }, [id, location.key, templates.isSuccess, settings.isSuccess]);

  const qr = useQr(printMm);
  const t = getType(s.type);
  const content = s.contents[s.type] ?? {};
  const autoName = useMemo(() => t.summary(content).slice(0, 80) || t.label, [t, content]);

  const save = async () => {
    if (!editable) return;
    useEditor.setState({ attempted: true });
    setSaving(true);
    setServerIssues([]);
    const kind = s.type === 'document' && content.source === 'upload' ? 'dynamic' : s.kind;
    const body = {
      name: s.name.trim() || autoName, type: s.type, content, design: s.design, kind, slug: kind === 'dynamic' ? s.slug : undefined,
      enabled: s.enabled, expiresAt: s.expiresAt, fallbackUrl: s.fallbackUrl, tracking: s.tracking, storeSecrets: s.storeSecrets,
      folderId: s.folderId, tags: s.tags, favorite: s.favorite, note: s.note,
    };
    try {
      const d = s.id ? await api.patch<CodeDetail>(`/api/codes/${s.id}`, body) : await api.post<CodeDetail>('/api/codes', body);
      const isNew = !s.id;
      useEditor.getState().markSaved(d);
      if (kind !== s.kind) useEditor.setState({ kind });
      qc.invalidateQueries({ queryKey: ['codes'] });
      qc.invalidateQueries({ queryKey: ['facets'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.setQueryData(['code', d.id], d);
      toast(isNew ? 'Gespeichert' : 'Änderungen gespeichert');
      if (isNew) navigate(`/codes/${d.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.field) setServerIssues([{ field: e.field, level: 'error', message: e.message }]);
      toastError(e);
    } finally { setSaving(false); }
  };

  const duplicate = async () => {
    if (!s.id) return;
    try {
      const d = await api.post<CodeDetail>(`/api/codes/${s.id}/duplicate`, {});
      qc.invalidateQueries({ queryKey: ['codes'] });
      toast('Kopie angelegt');
      navigate(`/codes/${d.id}`);
    } catch (e) { toastError(e); }
  };

  const remove = async () => {
    if (!s.id) return;
    const removedId = s.id;
    try {
      await api.del(`/api/codes/${removedId}`);
      useEditor.setState({ dirty: false });
      qc.invalidateQueries({ queryKey: ['codes'] });
      qc.invalidateQueries({ queryKey: ['facets'] });
      toast('In den Papierkorb gelegt', {
        action: { label: 'Rückgängig', run: async () => { await api.post(`/api/codes/${removedId}/restore`); qc.invalidateQueries({ queryKey: ['codes'] }); navigate(`/codes/${removedId}`); } },
      });
      navigate('/bibliothek');
    } catch (e) { toastError(e); }
  };

  const openExport = () => {
    useEditor.setState({ attempted: true });
    setExportOpen(true);
  };
  useHotkey('mod+s', () => void save(), editable);
  useHotkey('mod+e', () => openExport());
  useHotkey('mod+z', () => s.undo(), true, false);
  useHotkey('mod+shift+z', () => s.redo(), true, false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => useEditor.getState().dirty && editable && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (useEditor.getState().dirty && editable) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [editable]);

  if (id && detail.isError) {
    return <div className="page"><div className="empty"><h2>Code nicht gefunden</h2><p>{(detail.error as Error).message}</p><Link className="btn" to="/bibliothek">Zur Bibliothek</Link></div></div>;
  }
  if (id && !detail.data) return <div className="page"><div className="empty"><p>Wird geladen …</p></div></div>;

  const allIssues = [...qr.issues, ...serverIssues];
  return (
    <div className="editor">
      <header className="editor-bar">
        <Link to={s.id ? '/bibliothek' : '/'} className="btn btn-ghost btn-icon" aria-label="Zurück"><ArrowLeft size={18} /></Link>
        <input className="name-input grow" value={s.name} placeholder={autoName} aria-label="Name des Codes" onChange={(e) => s.setMeta({ name: e.target.value })} readOnly={!editable} />
        <span className="chip" style={{ flex: 'none' }}><Glyph id={t.icon} size={13} /> {t.label}{s.kind === 'dynamic' ? ' · dynamisch' : ''}</span>
        <span className="grow" />
        <span className="save-state" aria-live="polite">
          {s.dirty ? <><span className="dot" /> Nicht gespeichert</> : s.id ? 'Gespeichert' : ''}
        </span>
        <Tip label={`Rückgängig (${MOD_KEY}Z)`}><button className="btn btn-ghost btn-icon hide-sm" onClick={s.undo} disabled={!s.past.length} aria-label="Rückgängig"><Undo2 size={17} /></button></Tip>
        <Tip label={`Wiederholen (⇧${MOD_KEY}Z)`}><button className="btn btn-ghost btn-icon hide-sm" onClick={s.redo} disabled={!s.future.length} aria-label="Wiederholen"><Redo2 size={17} /></button></Tip>
        {s.id && (
          <Menu.Root>
            <Menu.Trigger className="btn btn-ghost btn-icon" aria-label="Weitere Aktionen"><MoreHorizontal size={18} /></Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" align="end" sideOffset={6}>
                <Menu.Item className="menu-item" onSelect={duplicate} disabled={!editable}><Copy size={15} /> Duplizieren</Menu.Item>
                <Menu.Item className="menu-item" onSelect={() => window.open(`/api/codes/${s.id}/export?format=png&size=1024&inline=1`, '_blank')}><Download size={15} /> Gespeicherte Fassung öffnen</Menu.Item>
                <Menu.Separator className="menu-sep" />
                <Menu.Item className="menu-item danger" onSelect={() => setConfirmDelete(true)} disabled={!editable}><Trash2 size={15} /> In den Papierkorb</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        )}
        {editable && (
          <button className="btn" onClick={save} disabled={saving || (!s.dirty && !!s.id)} data-testid="save" aria-label="Speichern">
            <Save size={15} /> <span className="btn-label">{saving ? 'Speichert …' : 'Speichern'}</span> <kbd>{MOD_KEY}S</kbd>
          </button>
        )}
        <button className="btn btn-primary" onClick={openExport} data-testid="export" aria-label="Exportieren"><Download size={15} /> <span className="btn-label">Exportieren</span></button>
      </header>
      <div className="editor-body">
        <ContentPanel issues={allIssues} serverIssues={serverIssues} />
        <div className="mobile-scan"><ScanPanel qr={qr} /></div>
        <Stage qr={qr} printMm={printMm} setPrintMm={setPrintMm} />
        <DesignPanel payload={qr.payload ?? ''} />
      </div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} payload={qr.payload} design={s.design} minEc={qr.minEc}
        name={s.name.trim() || autoName} meta={qr.meta} failing={qr.status === 'fail'} printMm={printMm} />
      <Dialog open={blocker.state === 'blocked'} onOpenChange={(v) => { if (!v && blocker.state === 'blocked') blocker.reset(); }}
        title="Änderungen verwerfen?"
        footer={<>
          <button className="btn" onClick={() => blocker.reset?.()}>Weiter bearbeiten</button>
          <button className="btn btn-danger" onClick={() => { useEditor.setState({ dirty: false }); blocker.proceed?.(); }}>Verwerfen</button>
        </>}>
        <p className="muted">Du hast Änderungen, die noch nicht gespeichert sind.</p>
      </Dialog>
      <Confirm open={confirmDelete} onOpenChange={setConfirmDelete} title="In den Papierkorb legen?"
        body={s.kind === 'dynamic' ? 'Gedruckte Exemplare dieses dynamischen Codes zeigen danach eine Hinweisseite. Du kannst ihn aus dem Papierkorb wiederherstellen.' : 'Du kannst den Code aus dem Papierkorb wiederherstellen.'}
        confirmLabel="In den Papierkorb" danger onConfirm={remove} />
    </div>
  );
}
