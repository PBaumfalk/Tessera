// Einstellungen: Kurzlinks, Datenschutz, Konto, Benutzer, API, System.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, Globe2, KeyRound, Network, Plus, Trash2 } from 'lucide-react';
import { linkScope } from '@shared/links';
import { api, ApiError, saveBlob } from '../lib/api';
import { relTime, useAuth, useSettings } from '../lib/hooks';
import { useTheme, type ThemePref } from '../lib/theme';
import { toast, toastError } from '../lib/toast';
import { Confirm, Dialog, Field, Seg, Switch, TextInput } from '../components/ui';

interface UserRow { id: string; email: string; name: string; role: string; disabled: boolean; sso: boolean; hasPassword: boolean; lastLoginAt: string | null }
interface TokenRow { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

const SECTIONS = [
  { id: 'links', label: 'Dynamische Codes' }, { id: 'privacy', label: 'Datenschutz' }, { id: 'account', label: 'Konto' },
  { id: 'users', label: 'Benutzer', admin: true }, { id: 'api', label: 'Schnittstelle' }, { id: 'system', label: 'System', admin: true },
];

export function SettingsPage() {
  const auth = useAuth();
  const isAdmin = auth.data?.user?.role === 'admin';
  const [section, setSection] = useState('links');
  return (
    <div className="page">
      <div className="page-head"><div><h1>Einstellungen</h1></div></div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Bereiche">
          {SECTIONS.filter((s) => !s.admin || isAdmin).map((s) => (
            <button key={s.id} className="nav-item" aria-current={section === s.id} onClick={() => setSection(s.id)}>{s.label}</button>
          ))}
        </nav>
        <div>
          {section === 'links' && <LinksSection isAdmin={isAdmin} />}
          {section === 'privacy' && <PrivacySection isAdmin={isAdmin} />}
          {section === 'account' && <AccountSection />}
          {section === 'users' && isAdmin && <UsersSection />}
          {section === 'api' && <ApiSection />}
          {section === 'system' && isAdmin && <SystemSection />}
        </div>
      </div>
    </div>
  );
}

function LinksSection({ isAdmin }: { isAdmin: boolean }) {
  const settings = useSettings();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  useEffect(() => { if (settings.data) setUrl(settings.data.publicBase.url); }, [settings.data?.publicBase.url]);
  const pb = settings.data?.publicBase;
  const scope = url ? linkScope(/^https?:\/\//.test(url) ? url : `https://${url}`) : pb?.scope;
  const save = async (confirm = false) => {
    try {
      await api.patch('/api/settings', { publicBaseUrl: url, confirm });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['codes'] });
      setConflict(null);
      toast('Basisadresse gespeichert');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(e.message); else toastError(e);
    }
  };
  if (!pb) return null;
  return (
    <section className="settings-section">
      <h2>Basisadresse für Kurzlinks</h2>
      <p>Dynamische Codes enthalten einen Kurzlink wie <span className="mono">{pb.url}/r/abc123</span>. Smartphones müssen diese Adresse erreichen können. Lege sie fest, bevor du Codes druckst.</p>
      <div className="stack">
        <Field label="Basisadresse" htmlFor="base" help={pb.locked ? 'Über die Umgebungsvariable PUBLIC_BASE_URL fest eingestellt.' : pb.source === 'request' ? 'Noch nicht festgelegt. Tessera verwendet die aktuelle Adresse im Browser.' : undefined}>
          <div className="row">
            <TextInput id="base" className="mono-input" value={url} disabled={pb.locked || !isAdmin} onChange={(e) => setUrl(e.target.value)} placeholder="https://qr.firma.de" />
            {isAdmin && !pb.locked && <button className="btn btn-primary" onClick={() => save()} disabled={url === pb.url}>Speichern</button>}
          </div>
        </Field>
        <div className={`notice ${scope === 'internal' ? 'notice-warn' : 'notice-info'}`}>
          {scope === 'internal' ? <Network size={16} /> : <Globe2 size={16} />}
          <div>{scope === 'internal'
            ? <><b>Interne Adresse.</b> Codes funktionieren nur für Geräte im Firmennetz oder per VPN, nicht für Kundinnen und Kunden unterwegs. Für öffentliche Codes eine öffentliche Domain eintragen und im Reverse Proxy nur den Pfad <span className="mono">/r/</span> freigeben.</>
            : <><b>Öffentliche Adresse.</b> Stelle sicher, dass sie per Reverse Proxy auf Tessera zeigt. Tessera liefert auf dieser Adresse nur Weiterleitungen aus, die Oberfläche bleibt intern (sofern APP_URL eine andere Adresse ist).</>}
          </div>
        </div>
        {settings.data && <p className="faint small">{settings.data.dynamicCount === 1 ? 'Ein dynamischer Code verwendet' : `${settings.data.dynamicCount} dynamische Codes verwenden`} diese Adresse.</p>}
      </div>
      <Confirm open={!!conflict} onOpenChange={(v) => !v && setConflict(null)} title="Basisadresse wirklich ändern?" danger confirmLabel="Trotzdem ändern"
        body={<>{conflict} Neue Exporte enthalten die neue Adresse.</>} onConfirm={() => void save(true)} />
    </section>
  );
}

function PrivacySection({ isAdmin }: { isAdmin: boolean }) {
  const settings = useSettings();
  const qc = useQueryClient();
  const set = async (v: boolean) => {
    try { await api.patch('/api/settings', { statsAllowed: v }); qc.invalidateQueries({ queryKey: ['settings'] }); } catch (e) { toastError(e); }
  };
  return (
    <section className="settings-section">
      <h2>Statistik und Datenschutz</h2>
      <p>Standardmäßig zählt Tessera keine Scans. Wird die Statistik erlaubt, kann sie pro dynamischem Code eingeschaltet werden.</p>
      <Switch label="Scan-Statistik erlauben" disabled={!isAdmin} checked={!!settings.data?.statsAllowed} onChange={set}
        help="Gezählt werden nur Anzahl pro Tag und Gerätetyp (Smartphone oder Computer)." />
      <hr className="divider" style={{ margin: '18px 0' }} />
      <dl className="kv">
        <dt>Gespeichert</dt><dd>Anzahl der Scans je Tag, Anteil Smartphone/Computer</dd>
        <dt>Nie gespeichert</dt><dd>IP-Adressen, Standorte, Cookies, vollständige Browserkennungen</dd>
        <dt>Nicht gezählt</dt><dd>Linkvorschauen von Messengern, Bots sowie Browser mit „Do Not Track“ oder „Global Privacy Control“</dd>
        <dt>Vertrauliche Felder</dt><dd>WLAN-Passwörter und IBANs werden mit AES-256-GCM verschlüsselt gespeichert und nie protokolliert</dd>
        <dt>Telemetrie</dt><dd>Keine. Tessera sendet keine Daten an Dritte.</dd>
      </dl>
    </section>
  );
}

function AccountSection() {
  const auth = useAuth();
  const theme = useTheme();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const u = auth.data?.user;
  const change = async () => {
    try { await api.post('/api/auth/password', { current: cur, next }); setCur(''); setNext(''); toast('Passwort geändert'); } catch (e) { toastError(e); }
  };
  return (
    <>
      <section className="settings-section">
        <h2>Darstellung</h2>
        <p>Gilt für diesen Browser.</p>
        <Seg label="Farbschema" value={theme.pref} onChange={(v: ThemePref) => theme.set(v)} options={[{ value: 'system', label: 'Wie System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]} />
      </section>
      {u && (
        <section className="settings-section">
          <h2>Konto</h2>
          <dl className="kv" style={{ marginBottom: 16 }}><dt>Name</dt><dd>{u.name}</dd><dt>E-Mail</dt><dd>{u.email}</dd><dt>Rolle</dt><dd>{roleLabel(u.role)}</dd></dl>
          {u.hasPassword && !auth.data?.authDisabled && (
            <div className="grid2" style={{ maxWidth: 520 }}>
              <Field label="Aktuelles Passwort" htmlFor="pc"><TextInput id="pc" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
              <Field label="Neues Passwort" htmlFor="pn" help="Mindestens 10 Zeichen."><TextInput id="pn" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
              <div><button className="btn btn-primary" disabled={!cur || next.length < 10} onClick={change}>Passwort ändern</button></div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

const roleLabel = (r: string) => ({ admin: 'Administration', editor: 'Bearbeiten', viewer: 'Nur ansehen' }[r] ?? r);

function UsersSection() {
  const qc = useQueryClient();
  const auth = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/api/users') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'editor', password: '' });
  const [del, setDel] = useState<UserRow | null>(null);
  const [reset, setReset] = useState<UserRow | null>(null);
  const [pw, setPw] = useState('');
  const patch = async (id: string, body: Record<string, unknown>) => {
    try { await api.patch(`/api/users/${id}`, body); qc.invalidateQueries({ queryKey: ['users'] }); } catch (e) { toastError(e); }
  };
  const create = async () => {
    try { await api.post('/api/users', form); qc.invalidateQueries({ queryKey: ['users'] }); setOpen(false); setForm({ email: '', name: '', role: 'editor', password: '' }); toast('Konto angelegt'); } catch (e) { toastError(e); }
  };
  return (
    <section className="settings-section">
      <div className="spread"><h2>Benutzer</h2><button className="btn btn-sm" onClick={() => setOpen(true)}><Plus size={14} /> Konto anlegen</button></div>
      <p>Konten aus dem Firmen-Login (OIDC) werden bei der ersten Anmeldung automatisch angelegt.</p>
      {users.data?.map((u) => (
        <div className="user-row" key={u.id}>
          <div style={{ minWidth: 0 }}>
            <b>{u.name || u.email}</b> {u.sso && <span className="chip">SSO</span>} {u.disabled && <span className="chip chip-warn">Deaktiviert</span>}
            <div className="faint small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email} · {u.lastLoginAt ? `zuletzt ${relTime(u.lastLoginAt)}` : 'noch nie angemeldet'}</div>
          </div>
          <select className="select hide-m" value={u.role} aria-label={`Rolle von ${u.email}`} onChange={(e) => patch(u.id, { role: e.target.value })} disabled={u.id === auth.data?.user?.id}>
            <option value="admin">Administration</option><option value="editor">Bearbeiten</option><option value="viewer">Nur ansehen</option>
          </select>
          <span className="hide-m"><Switch label="Aktiv" checked={!u.disabled} disabled={u.id === auth.data?.user?.id} onChange={(v) => patch(u.id, { disabled: !v })} /></span>
          <div className="row" style={{ gap: 2 }}>
            {!u.sso && <button className="btn btn-ghost btn-sm btn-icon" aria-label="Passwort setzen" title="Passwort setzen" onClick={() => setReset(u)}><KeyRound size={15} /></button>}
            <button className="btn btn-ghost btn-sm btn-icon" aria-label="Konto löschen" title="Konto löschen" disabled={u.id === auth.data?.user?.id} onClick={() => setDel(u)}><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
      <Dialog open={open} onOpenChange={setOpen} title="Konto anlegen"
        footer={<><button className="btn" onClick={() => setOpen(false)}>Abbrechen</button><button className="btn btn-primary" onClick={create}>Anlegen</button></>}>
        <div className="grid2">
          <Field label="E-Mail" htmlFor="ue" className="full"><TextInput id="ue" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Name" htmlFor="un"><TextInput id="un" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Rolle" htmlFor="ur"><select id="ur" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="admin">Administration</option><option value="editor">Bearbeiten</option><option value="viewer">Nur ansehen</option></select></Field>
          <Field label="Startpasswort" htmlFor="up" className="full" help="Mindestens 10 Zeichen. Die Person kann es danach selbst ändern."><TextInput id="up" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </Dialog>
      <Dialog open={!!reset} onOpenChange={(v) => { if (!v) { setReset(null); setPw(''); } }} title={`Passwort für ${reset?.email}`}
        footer={<><button className="btn" onClick={() => setReset(null)}>Abbrechen</button><button className="btn btn-primary" disabled={pw.length < 10} onClick={async () => { await patch(reset!.id, { password: pw }); setReset(null); setPw(''); toast('Passwort gesetzt, alle Sitzungen beendet'); }}>Passwort setzen</button></>}>
        <Field label="Neues Passwort" htmlFor="rp"><TextInput id="rp" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      </Dialog>
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`${del?.email} löschen?`} danger confirmLabel="Konto löschen"
        body="Die Codes dieses Kontos bleiben erhalten." onConfirm={async () => { try { await api.del(`/api/users/${del!.id}`); qc.invalidateQueries({ queryKey: ['users'] }); } catch (e) { toastError(e); } }} />
    </section>
  );
}

function ApiSection() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => api.get<TokenRow[]>('/api/tokens') });
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<TokenRow | null>(null);
  const create = async () => {
    try { const r = await api.post<{ token: string }>('/api/tokens', { name }); setFresh(r.token); setName(''); qc.invalidateQueries({ queryKey: ['tokens'] }); } catch (e) { toastError(e); }
  };
  const origin = location.origin;
  return (
    <section className="settings-section">
      <h2>Schnittstelle für andere Anwendungen</h2>
      <p>Andere Intranet-Anwendungen können QR-Codes über Tessera erzeugen. Ein Token hat dieselben Rechte wie dein Konto.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <TextInput value={name} placeholder="Name, z. B. Ticketsystem" aria-label="Name des Tokens" onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim()} onClick={create}>Token erstellen</button>
      </div>
      {fresh && (
        <div className="notice notice-info" style={{ marginBottom: 14 }}>
          <Check size={16} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b>Token erstellt. Er wird nur jetzt angezeigt.</b>
            <div className="row" style={{ marginTop: 6 }}><code className="mono" style={{ wordBreak: 'break-all' }}>{fresh}</code>
              <button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(fresh); toast('Token kopiert'); }}><Copy size={14} /> Kopieren</button></div>
          </div>
        </div>
      )}
      {tokens.data?.map((t) => (
        <div className="user-row" key={t.id} style={{ gridTemplateColumns: '1fr auto' }}>
          <div><b>{t.name}</b><div className="faint small"><span className="mono">{t.prefix}…</span> · erstellt {relTime(t.createdAt)} · {t.lastUsedAt ? `zuletzt verwendet ${relTime(t.lastUsedAt)}` : 'noch nie verwendet'}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => setRevoke(t)}>Widerrufen</button>
        </div>
      ))}
      <Confirm open={!!revoke} onOpenChange={(v) => !v && setRevoke(null)} title={`Token „${revoke?.name}“ widerrufen?`} danger confirmLabel="Widerrufen"
        body="Anwendungen, die dieses Token verwenden, verlieren sofort den Zugriff."
        onConfirm={async () => { try { await api.del(`/api/tokens/${revoke!.id}`); qc.invalidateQueries({ queryKey: ['tokens'] }); toast('Token widerrufen'); } catch (e) { toastError(e); } }} />
      <h3 style={{ margin: '20px 0 8px' }}>Beispiele</h3>
      <div className="code-block">{`# Website als SVG
curl -H "Authorization: Bearer $TOKEN" \\
  "${origin}/api/v1/qr?type=url&url=https://firma.de&format=svg"

# Beliebiger Inhalt als PNG mit Stilvorlage
curl -H "Authorization: Bearer $TOKEN" -o code.png \\
  "${origin}/api/v1/qr?data=INV-000123&format=png&size=1024&preset=kobalt"

# Gespeicherter Code als druckfertiges PDF (50 mm)
curl -H "Authorization: Bearer $TOKEN" -o code.pdf \\
  "${origin}/api/codes/<id>/export?format=pdf&mm=50"`}</div>
    </section>
  );
}

function SystemSection() {
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [withKey, setWithKey] = useState(true);
  const s = settings.data;
  return (
    <section className="settings-section">
      <h2>System</h2>
      <p>Informationen zur Installation und Datensicherung.</p>
      {s && (
        <dl className="kv" style={{ marginBottom: 18 }}>
          <dt>Version</dt><dd>Tessera {s.version}</dd>
          <dt>Datenbankschema</dt><dd>Version {s.schema}</dd>
          <dt>Anmeldung</dt><dd>{s.auth.disabled ? 'Ohne Anmeldung (AUTH_DISABLED)' : [s.auth.local && 'Lokale Konten', s.auth.oidc && `OIDC (${s.auth.oidcIssuer})`].filter(Boolean).join(', ')}</dd>
          <dt>Maximale Dateigröße</dt><dd>{s.maxUploadMb} MB</dd>
        </dl>
      )}
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const r = await api.file(`/api/admin/backup${withKey ? '' : '?key=0'}`); saveBlob(r.blob, r.name); toast('Sicherung heruntergeladen'); } catch (e) { toastError(e); } finally { setBusy(false); }
      }}><Download size={15} /> {busy ? 'Wird erstellt …' : 'Sicherung herunterladen'}</button>
      <div style={{ maxWidth: 520, marginTop: 14 }}>
        <Switch label="Schlüssel für vertrauliche Felder mitsichern" checked={withKey} onChange={setWithKey}
          help={withKey ? 'Die Sicherung enthält dann alles, auch zum Entschlüsseln von WLAN-Passwörtern und IBANs. Bewahre sie geschützt auf.' : 'Ohne Schlüssel sind WLAN-Passwörter und IBANs in der Sicherung nicht lesbar. Den Schlüssel (secret.key bzw. SECRET_KEY) dann getrennt aufbewahren.'} />
      </div>
      <p className="faint small" style={{ marginTop: 10 }}>Wiederherstellung: siehe docs/betrieb.md.</p>
    </section>
  );
}
