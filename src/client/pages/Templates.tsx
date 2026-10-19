// Designvorlagen verwalten: umbenennen, als Standard festlegen, löschen, neuen Code daraus erstellen.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { renderSvg } from '@shared/render';
import { api } from '../lib/api';
import { canEdit, relTime, useAuth, useSettings } from '../lib/hooks';
import { toast, toastError } from '../lib/toast';
import type { Template } from '../lib/types';
import { Confirm, Dialog, Field, TextInput } from '../components/ui';

export function TemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const settings = useSettings();
  const isAdmin = auth.data?.user?.role === 'admin';
  const editable = canEdit(auth.data?.user?.role);
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/api/templates') });
  const [rename, setRename] = useState<Template | null>(null);
  const [del, setDel] = useState<Template | null>(null);

  const setDefault = async (id: string) => {
    try {
      await api.patch('/api/settings', { defaultTemplateId: settings.data?.defaultTemplateId === id ? '' : id });
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast(settings.data?.defaultTemplateId === id ? 'Standardvorlage entfernt' : 'Neue Codes starten mit dieser Vorlage');
    } catch (e) { toastError(e); }
  };
  const useTpl = (t: Template) => navigate('/neu', { state: { type: 'url', design: t.design } });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Vorlagen</h1><p className="muted">Gespeicherte Designs mit Farben, Formen, Logo und Rahmen. Speichere neue Vorlagen im Editor unter „Stil“.</p></div>
        {editable && <button className="btn btn-primary" onClick={() => navigate('/neu')}><Plus size={16} /> Neuer Code</button>}
      </div>
      {templates.data?.length === 0 && (
        <div className="empty"><Palette size={28} /><h2>Noch keine Vorlagen</h2><p>Gestalte einen Code und wähle im Bereich „Stil“ den Punkt „Aktuelles Design sichern“.</p></div>
      )}
      <div className="cards">
        {templates.data?.map((t) => {
          const isDefault = settings.data?.defaultTemplateId === t.id;
          return (
            <article className="card" key={t.id}>
              <button type="button" className="card-art" style={{ border: 0, width: '100%' }} onClick={() => useTpl(t)} aria-label={`Neuen Code mit Vorlage ${t.name} erstellen`}>
                <span style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: renderSvg('https://tessera.example/vorlage', t.design, { idPrefix: `tp${t.id.slice(0, 4)}` }).svg.replace('<svg ', '<svg width="100%" height="100%" ') }} />
              </button>
              <div className="card-body">
                <span className="card-name">{t.name}</span>
                <span className="card-sum">Geändert {relTime(t.updatedAt)}</span>
                <div className="row" style={{ marginTop: 6, gap: 4 }}>
                  {isDefault && <span className="chip chip-accent">Standard</span>}
                  <span className="grow" />
                  {isAdmin && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDefault(t.id)} aria-label={isDefault ? 'Nicht mehr Standard' : 'Als Standard festlegen'} title={isDefault ? 'Nicht mehr Standard' : 'Als Standard für neue Codes'}><Star size={15} fill={isDefault ? 'currentColor' : 'none'} /></button>}
                  {editable && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setRename(t)} aria-label="Umbenennen"><Pencil size={15} /></button>}
                  {editable && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDel(t)} aria-label="Löschen"><Trash2 size={15} /></button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog open={!!rename} onOpenChange={(v) => !v && setRename(null)} title="Vorlage umbenennen"
        footer={<><button className="btn" onClick={() => setRename(null)}>Abbrechen</button><button className="btn btn-primary" onClick={async () => {
          try { await api.patch(`/api/templates/${rename!.id}`, { name: rename!.name }); qc.invalidateQueries({ queryKey: ['templates'] }); setRename(null); } catch (e) { toastError(e); }
        }}>Speichern</button></>}>
        {rename && <Field label="Name" htmlFor="tn"><TextInput id="tn" autoFocus value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field>}
      </Dialog>
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`Vorlage „${del?.name}“ löschen?`} danger confirmLabel="Löschen"
        body="Bereits erstellte Codes behalten ihr Design."
        onConfirm={async () => { try { await api.del(`/api/templates/${del!.id}`); qc.invalidateQueries({ queryKey: ['templates'] }); qc.invalidateQueries({ queryKey: ['settings'] }); } catch (e) { toastError(e); } }} />
    </div>
  );
}
