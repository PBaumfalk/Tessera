// Richtet eine frische Tessera-Instanz über die echte Oberfläche ein (Einrichtungscode aus dem Container-Protokoll).
import { chromium, type FullConfig } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

export const ADMIN = { email: 'e2e@tessera.test', password: 'e2e-passwort-123' };

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  fs.mkdirSync('test-results/exports', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/');
  await page.waitForURL(/login|einrichten/);
  if (page.url().includes('einrichten')) {
    const logs = execSync(`docker compose -p ${process.env.E2E_PROJECT ?? 'tessera-e2e'} logs tessera`, { encoding: 'utf8' });
    const code = [...logs.matchAll(/Einrichtungscode (\d{4}-\d{4}-\d{4})/g)].pop()?.[1];
    if (!code) throw new Error('Kein Einrichtungscode im Protokoll gefunden');
    await page.fill('#sc', code);
    await page.fill('#sn', 'E2E Admin');
    await page.fill('#se', ADMIN.email);
    await page.fill('#sp', ADMIN.password);
    await page.click('button:has-text("Konto anlegen")');
  } else {
    await page.fill('#le', ADMIN.email);
    await page.fill('#lp', ADMIN.password);
    await page.click('button:has-text("Anmelden")');
  }
  await page.waitForURL(baseURL + '/');
  await page.context().storageState({ path: 'test-results/state.json' });
  await browser.close();
}
