// Echte Benutzerabläufe gegen den laufenden Docker-Container.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encodeContent, getType } from '../../src/shared/content';

const OUT = 'test-results/exports';
const expected: Record<string, string> = fs.existsSync(`${OUT}/expected.json`) ? JSON.parse(fs.readFileSync(`${OUT}/expected.json`, 'utf8')) : {};
function remember(file: string, payload: string) {
  expected[file] = payload;
  fs.writeFileSync(`${OUT}/expected.json`, JSON.stringify(expected, null, 1));
}
const payloadOf = (type: string, d: Record<string, string | boolean>) => encodeContent(type, { ...getType(type).defaults, ...d }).payload!;

async function pickType(page: Page, type: string) {
  await page.getByTestId('type-picker').click();
  await page.locator(`.dialog button[data-type=${type}]`).click();
}

async function waitScan(page: Page, status: 'ok' | 'warn' | 'fail' = 'ok') {
  await expect(page.locator('.stage [data-testid=scan-panel]')).toHaveAttribute('data-status', status, { timeout: 20_000 });
}

async function exportAs(page: Page, format: 'PNG' | 'SVG' | 'PDF', file: string) {
  await page.getByTestId('export').click();
  await page.locator('.format-card', { hasText: format }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  await dl.saveAs(path.join(OUT, file));
  await expect(page.locator('.dialog')).toBeHidden();
}

test.describe.configure({ mode: 'serial' });

test('Anfänger: Link einfügen, Code sehen, PNG herunterladen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('smart-input').fill('www.beispiel.de/herbst-aktion');
  await expect(page.locator('.smart-hint')).toContainText('Webadresse erkannt');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/neu$/);
  await expect(page.locator('#f-url')).toHaveValue('https://www.beispiel.de/herbst-aktion');
  await waitScan(page);
  await expect(page.locator('.stage [data-testid=scan-title]')).toHaveText('Sicher scannbar');
  await exportAs(page, 'PNG', 'anfaenger.png');
  remember('anfaenger.png', 'https://www.beispiel.de/herbst-aktion');
});

test('WLAN, Visitenkarte, GiroCode und Termin über die Formulare', async ({ page }) => {
  await page.goto('/neu');
  await pickType(page, 'wifi');
  await page.fill('#f-ssid', 'Gäste; Büro');
  await page.fill('#f-password', 'Willkommen:2026');
  await waitScan(page);
  await expect(page.getByTestId('payload')).not.toContainText('Willkommen');
  await exportAs(page, 'PNG', 'wlan.png');
  remember('wlan.png', payloadOf('wifi', { ssid: 'Gäste; Büro', password: 'Willkommen:2026', security: 'WPA' }));

  await pickType(page, 'vcard');
  await page.fill('#f-firstName', 'Erika');
  await page.fill('#f-lastName', 'Müller-Lüdenscheidt');
  await page.fill('#f-org', 'Kanzlei, Partner');
  await page.fill('#f-mobile', '+49 171 2345678');
  await page.fill('#f-email', 'erika@example.de');
  await waitScan(page);
  await exportAs(page, 'SVG', 'vcard.svg');
  remember('vcard.svg', payloadOf('vcard', { firstName: 'Erika', lastName: 'Müller-Lüdenscheidt', org: 'Kanzlei, Partner', mobile: '+49 171 2345678', email: 'erika@example.de', format: 'vcard3' }));

  await pickType(page, 'epc');
  await page.fill('#f-name', 'Musterfirma GmbH');
  await page.fill('#f-iban', 'DE89 3704 0044 0532 0130 01');
  await expect(page.locator('.field-issue.error')).toContainText('IBAN ist ungültig');
  await page.fill('#f-iban', 'DE89 3704 0044 0532 0130 00');
  await page.fill('#f-amount', '1.250,00');
  await page.fill('#f-remittance', 'Rechnung 2026-0815');
  await expect(page.locator('.field-issue.error')).toHaveCount(0);
  await waitScan(page);
  await exportAs(page, 'PDF', 'girocode.pdf');
  remember('girocode.pdf', payloadOf('epc', { name: 'Musterfirma GmbH', iban: 'DE89 3704 0044 0532 0130 00', amount: '1.250,00', remittance: 'Rechnung 2026-0815' }));

  await pickType(page, 'event');
  await page.fill('#f-title', 'Mandantenabend');
  await page.fill('#f-start', '2026-11-20T18:30');
  await page.fill('#f-end', '2026-11-20T21:00');
  await page.fill('#f-location', 'Kanzlei, Saal 2');
  await waitScan(page);
  await exportAs(page, 'PNG', 'termin.png');
  remember('termin.png', payloadOf('event', { title: 'Mandantenabend', start: '2026-11-20T18:30', end: '2026-11-20T21:00', location: 'Kanzlei, Saal 2', tz: 'Europe/Berlin' }));
});

test('Gestalten, speichern, wieder öffnen und bearbeiten', async ({ page }) => {
  await page.goto('/neu?type=url');
  await page.fill('#f-url', 'https://tessera.example/design');
  await page.getByRole('tab', { name: 'Stil' }).click();
  await page.getByRole('button', { name: 'Tiefsee' }).click();
  await page.getByRole('tab', { name: 'Logo' }).click();
  await page.getByRole('button', { name: 'Symbol', exact: true }).click();
  await page.getByRole('button', { name: 'Globe' }).click();
  await page.getByRole('tab', { name: 'Rahmen' }).click();
  await page.getByRole('button', { name: 'Etikett' }).click();
  await page.fill('#frame-text', 'Mehr erfahren');
  await waitScan(page);
  await page.getByLabel('Name des Codes').fill('Design-Test');
  await page.getByTestId('save').click();
  await expect(page).toHaveURL(/\/codes\/[\w-]+$/);
  await expect(page.locator('.save-state')).toHaveText('Gespeichert');
  const url = page.url();

  await page.reload();
  await expect(page.getByLabel('Name des Codes')).toHaveValue('Design-Test');
  await expect(page.locator('#f-url')).toHaveValue('https://tessera.example/design');
  await page.getByRole('tab', { name: 'Rahmen' }).click();
  await expect(page.locator('#frame-text')).toHaveValue('Mehr erfahren');
  await page.getByRole('tab', { name: 'Form' }).click();
  await expect(page.getByRole('button', { name: 'Blatt' }).first()).toHaveAttribute('aria-pressed', 'true');

  // Bearbeiten und Rückgängig
  await page.getByRole('button', { name: 'Punkte' }).click();
  await expect(page.locator('.save-state')).toContainText('Nicht gespeichert');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('button', { name: 'Blatt' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.fill('#f-url', 'https://tessera.example/design-neu');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-state')).toHaveText('Gespeichert');
  await page.goto(url);
  await expect(page.locator('#f-url')).toHaveValue('https://tessera.example/design-neu');
  await waitScan(page);
  await exportAs(page, 'PNG', 'gestaltet.png');
  remember('gestaltet.png', 'https://tessera.example/design-neu');
});

test('Warnung vor ungespeicherten Änderungen', async ({ page }) => {
  await page.goto('/neu?type=text');
  await page.fill('#f-text', 'Entwurf');
  await page.getByRole('link', { name: 'Codes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Änderungen verwerfen?' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(page.locator('#f-text')).toHaveValue('Entwurf');
});

test('Unlesbare Gestaltung wird erkannt und blockiert den Export', async ({ page }) => {
  await page.goto('/neu?type=url');
  await page.fill('#f-url', 'https://tessera.example/kontrast');
  await page.getByRole('tab', { name: 'Farbe' }).click();
  await page.getByLabel('Code als Hex-Wert').fill('#EEEEEE');
  await waitScan(page, 'fail');
  await expect(page.locator('.stage [data-testid=scan-title]')).toHaveText('Wahrscheinlich nicht lesbar');
  await page.getByTestId('export').click();
  await expect(page.locator('.dialog .notice-fail')).toContainText('wahrscheinlich nicht lesbar');
  await expect(page.getByTestId('export-download')).toBeDisabled();
  await page.keyboard.press('Escape');
  // Vorschlag der Prüfung übernehmen repariert den Code
  await page.locator('.stage .scan-head').click();
  await page.getByRole('button', { name: 'Code dunkler färben' }).click();
  await waitScan(page);
});

test('Dynamischer Code: Ziel ändern, ohne den Code zu ändern', async ({ page, request }) => {
  await page.goto('/neu?type=url');
  await page.fill('#f-url', 'https://ziel-eins.example/');
  await page.getByTestId('kind-dynamic').click();
  await page.fill('#slug', `e2e-${Date.now().toString(36)}`);
  const slug = await page.inputValue('#slug');
  await page.getByLabel('Name des Codes').fill('Dynamisch E2E');
  await page.getByTestId('save').click();
  await expect(page).toHaveURL(/\/codes\//);
  const payload = await page.getByTestId('payload').textContent();
  expect(payload).toContain(`/r/${slug}`);
  let r = await request.get(`/r/${slug}`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers().location).toBe('https://ziel-eins.example/');
  await exportAs(page, 'PNG', 'dynamisch.png');
  remember('dynamisch.png', payload!.trim());

  await page.fill('#f-url', 'https://ziel-zwei.example/neu');
  await page.getByTestId('save').click();
  await expect(page.locator('.save-state')).toHaveText('Gespeichert');
  expect((await page.getByTestId('payload').textContent())!.trim()).toBe(payload!.trim());
  r = await request.get(`/r/${slug}`, { maxRedirects: 0 });
  expect(r.headers().location).toBe('https://ziel-zwei.example/neu');
  await expect(page.locator('.timeline')).toContainText('Ziel geändert');
});

test('Bibliothek: suchen, duplizieren, Papierkorb', async ({ page }) => {
  await page.goto('/bibliothek');
  await page.getByTestId('library-search').fill('Design-Test');
  await expect(page.getByTestId('code-card')).toHaveCount(1);
  const card = page.getByTestId('code-card').first();
  await card.hover();
  await card.getByRole('button', { name: /Aktionen für/ }).click();
  await page.getByRole('menuitem', { name: 'Duplizieren' }).click();
  await expect(page.getByTestId('code-card')).toHaveCount(2);
  const copy = page.getByTestId('code-card').filter({ hasText: 'Kopie' });
  await copy.hover();
  await copy.getByRole('button', { name: /Aktionen für/ }).click();
  await page.getByRole('menuitem', { name: 'In den Papierkorb' }).click();
  await expect(page.getByTestId('code-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('code-card')).toHaveCount(2);
});

test('Serien: Tabelle einfügen, prüfen, ZIP und Bibliothek', async ({ page }) => {
  await page.goto('/serien');
  await page.selectOption('#btype', 'raw');
  const rows = ['Name;Inventarnummer', ...Array.from({ length: 25 }, (_, i) => `Laptop ${i + 1};INV-2026-${String(i + 1).padStart(4, '0')}`), 'Kaputt;'];
  await page.fill('#paste', rows.join('\n'));
  await page.getByTestId('batch-paste-load').click();
  await expect(page.getByText('26 Zeilen')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter zur Prüfung' }).click();
  await expect(page.getByText('25 von 26 Zeilen sind gültig.')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter zum Design' }).click();
  await page.getByRole('button', { name: 'Bildunterschrift' }).click();
  await page.fill('#lbl', '{{Inventarnummer}}');
  await page.getByRole('button', { name: 'Weiter zur Ausgabe' }).click();
  await page.getByTestId('batch-export').click();
  await page.locator('.dialog .chip', { hasText: 'SVG' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('batch-export-run').click()]);
  const zipPath = path.join(OUT, 'serie.zip');
  await dl.saveAs(zipPath);
  expect(fs.statSync(zipPath).size).toBeGreaterThan(10_000);
  await page.fill('#st', 'E2E-Inventar');
  await page.getByTestId('batch-save').click();
  await expect(page.getByText('25 Codes in der Bibliothek gespeichert')).toBeVisible();
  await page.goto('/bibliothek?tag=E2E-Inventar');
  await expect(page.locator('.lib-meta')).toContainText('25 Codes');
});

test('Scanner liest einen exportierten Code und übernimmt ihn ins Studio', async ({ page }) => {
  await page.goto('/scanner');
  await page.getByTestId('scan-file').setInputFiles(path.join(OUT, 'wlan.png'));
  await expect(page.getByTestId('scan-hit')).toContainText('WLAN');
  await page.getByRole('button', { name: 'Im Studio gestalten' }).click();
  await expect(page.locator('#f-ssid')).toHaveValue('Gäste; Büro');
  await expect(page.locator('#f-password')).toHaveValue('Willkommen:2026');
});

test('Smartphone-Ansicht', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: 'test-results/state.json', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.tabbar')).toBeVisible();
  await page.getByTestId('smart-input').fill('+49 30 1234567');
  await page.keyboard.press('Enter');
  await expect(page.locator('#f-phone')).toHaveValue('+49 30 1234567');
  await expect(page.locator('.mobile-scan [data-testid=scan-panel]')).toHaveAttribute('data-status', 'ok', { timeout: 20_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/mobil-editor.png' });
  await page.goto('/bibliothek');
  await page.screenshot({ path: 'test-results/mobil-bibliothek.png' });
  await ctx.close();
});
