// Anmeldung und Ersteinrichtung.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/hooks';
import { Field, IssueLine, Logo, TextInput } from '../components/ui';

const OIDC_ERRORS: Record<string, string> = {
  'oidc-nicht-erreichbar': 'Der Anmeldedienst ist gerade nicht erreichbar.',
  'oidc-abgelaufen': 'Die Anmeldung hat zu lange gedauert. Bitte versuche es erneut.',
  'oidc-fehlgeschlagen': 'Die Anmeldung über den Firmen-Login ist fehlgeschlagen.',
  'keine-berechtigung': 'Dein Konto ist für Tessera nicht freigegeben. Wende dich an die Administration.',
  'konto-deaktiviert': 'Dein Konto ist deaktiviert.',
  'konto-existiert': 'Für deine E-Mail-Adresse gibt es bereits ein lokales Konto. Melde dich mit Passwort an oder bitte die Administration, das lokale Konto zu löschen.',
};

function AuthArt() {
  return (
    <div className="auth-art" role="complementary" aria-label="Über Tessera">
      <div className="row" style={{ gap: 10 }}><Logo size={30} /><b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Tessera</b></div>
      <div>
        <h1>Jeder Code ein Stück Handwerk.</h1>
        <p style={{ marginTop: 14, opacity: 0.7, maxWidth: '38ch' }}>Das QR-Studio deines Teams: gestalten, prüfen, drucken. Läuft vollständig auf eurem eigenen Server.</p>
      </div>
      <svg viewBox="0 0 400 120" style={{ width: '100%', opacity: 0.16 }} aria-hidden="true">
        {Array.from({ length: 60 }, (_, i) => <rect key={i} x={(i % 20) * 20} y={Math.floor(i / 20) * 40 + ((i * 7) % 3) * 4} width="14" height="14" rx={(i % 3) * 4} fill="currentColor" opacity={((i * 13) % 10) / 10 + 0.1} />)}
      </svg>
    </div>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(sp.get('fehler') ? OIDC_ERRORS[sp.get('fehler')!] ?? 'Die Anmeldung ist fehlgeschlagen.' : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (auth.data?.user) navigate('/', { replace: true });
    else if (auth.data?.setupRequired) navigate('/einrichten', { replace: true });
    else if (auth.data?.oidc.enabled && auth.data.oidc.autoRedirect && !auth.data.localLogin && !sp.get('fehler')) location.href = '/api/auth/oidc/start';
  }, [auth.data]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/login', { email, password });
      await qc.invalidateQueries();
      navigate('/', { replace: true });
    } catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  };
  const a = auth.data;
  return (
    <div className="auth-wrap">
      <AuthArt />
      <main className="auth-form">
        <form onSubmit={submit}>
          <div><h2 style={{ fontSize: 26 }}>Anmelden</h2><p className="muted" style={{ marginTop: 4 }}>Willkommen zurück bei Tessera.</p></div>
          {error && <IssueLine issue={{ level: 'error', message: error }} />}
          {a?.oidc.enabled && <a className="btn btn-primary btn-lg" href="/api/auth/oidc/start">{a.oidc.label}</a>}
          {a?.oidc.enabled && a.localLogin && <div className="faint small" style={{ textAlign: 'center' }}>oder mit Passwort</div>}
          {a?.localLogin !== false && (
            <>
              <Field label="E-Mail" htmlFor="le"><TextInput id="le" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></Field>
              <Field label="Passwort" htmlFor="lp"><TextInput id="lp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <button className={`btn btn-lg ${a?.oidc.enabled ? '' : 'btn-primary'}`} disabled={busy}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}

export function SetupPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ code: '', email: '', name: '', password: '' });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/auth/setup', f);
      await qc.invalidateQueries();
      navigate('/', { replace: true });
    } catch (er) { setError({ message: (er as Error).message, field: (er as { field?: string }).field }); }
  };
  const issue = (field: string) => (error?.field === field ? [{ level: 'error' as const, message: error.message }] : undefined);
  return (
    <div className="auth-wrap">
      <AuthArt />
      <main className="auth-form">
        <form onSubmit={submit}>
          <div><h2 style={{ fontSize: 26 }}>Tessera einrichten</h2><p className="muted" style={{ marginTop: 4 }}>Lege das erste Administratorkonto an. Den Einrichtungscode findest du im Protokoll des Containers (<span className="mono">docker compose logs tessera</span>).</p></div>
          {error && !error.field && <IssueLine issue={{ level: 'error', message: error.message }} />}
          <Field label="Einrichtungscode" htmlFor="sc" issues={issue('code')}><TextInput id="sc" className="mono-input" placeholder="1234-5678-9012" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoFocus required /></Field>
          <Field label="Name" htmlFor="sn"><TextInput id="sn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-Mail" htmlFor="se" issues={issue('email')}><TextInput id="se" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Passwort" htmlFor="sp" help="Mindestens 10 Zeichen." issues={issue('password')}><TextInput id="sp" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          <button className="btn btn-primary btn-lg">Konto anlegen und starten</button>
        </form>
      </main>
    </div>
  );
}
