// Vollständiger OIDC-Ablauf im Browser gegen den Testanbieter.
import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1'] });
const p = await b.newPage();
await p.goto('http://localhost:8091/login');
await p.screenshot({ path: 'scratch/oidc-1-login.png' });
await p.click('text=Mit Testanbieter anmelden');
await p.waitForURL(/host\.docker\.internal:8095/);
await p.fill('input[name=username]', 'erika.muster');
await p.fill('textarea[name=claims]', JSON.stringify({ email: 'erika@firma.test', name: 'Erika Muster', groups: ['tessera-admins'] }));
await p.screenshot({ path: 'scratch/oidc-2-idp.png' });
await p.click('input[type=submit]');
await p.waitForURL('http://localhost:8091/', { timeout: 20000 });
const state = await p.evaluate(() => fetch('/api/auth/state').then((r) => r.json()));
console.log('Angemeldet als:', state.user?.email, '| Rolle:', state.user?.role, '| via:', state.user?.via);
const users = await p.evaluate(() => fetch('/api/users').then((r) => r.json()));
console.log('Konten:', users.map((u) => `${u.email} (${u.role}, sso=${u.sso})`).join(', '));
await b.close();
