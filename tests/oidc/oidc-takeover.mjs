// Versucht, per OIDC ein bestehendes lokales Administratorkonto (gleiche E-Mail) zu übernehmen – muss scheitern.
import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1'] });
const p = await b.newPage();
await p.goto('http://localhost:8091/login');
await p.click('text=Mit Testanbieter anmelden');
await p.waitForURL(/host\.docker\.internal:8095/);
await p.fill('input[name=username]', 'angreifer');
await p.fill('textarea[name=claims]', JSON.stringify({ email: 'admin@firma.test', email_verified: true, name: 'Angreifer' }));
await p.click('input[type=submit]');
await p.waitForURL(/localhost:8091\/login/, { timeout: 20000 });
const state = await p.evaluate(() => fetch('/api/auth/state').then((r) => r.json()));
console.log('Übernahme verhindert:', !state.user, '| Meldung:', (await p.locator('.field-issue').textContent())?.slice(0, 60));
await b.close();
