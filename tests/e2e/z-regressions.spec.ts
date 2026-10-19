// Regressionstests für Befunde aus dem explorativen Test.
import { expect, test } from '@playwright/test';
import path from 'node:path';

test('Leeres Formular zeigt keine Fehler, erst nach Eingabe oder Speicherversuch', async ({ page }) => {
  await page.goto('/neu?type=geo');
  await expect(page.locator('.side-left .field-issue.error')).toHaveCount(0);
  await page.getByTestId('save').click();
  await expect(page.locator('.side-left .field-issue.error').first()).toBeVisible();
});

test('Sofort eingegebener Inhalt bleibt erhalten (kein Zurücksetzen nach dem Laden)', async ({ page }) => {
  for (let i = 0; i < 4; i++) {
    await page.goto('/neu?type=text');
    await page.locator('#f-text').fill(`Sofort ${i}`);
    await page.waitForTimeout(1500);
    await expect(page.locator('#f-text')).toHaveValue(`Sofort ${i}`);
  }
});

test('Mehrdeutige Beträge werden abgelehnt statt umgedeutet', async ({ page }) => {
  await page.goto('/neu?type=epc');
  await page.fill('#f-name', 'Firma');
  await page.fill('#f-iban', 'DE89370400440532013000');
  await page.fill('#f-amount', '12,345');
  await expect(page.locator('.field-issue.error')).toContainText('eindeutig');
  await page.fill('#f-amount', '12,34');
  await expect(page.locator('.field-issue.error')).toHaveCount(0);
  await expect(page.getByTestId('payload')).toContainText('EUR12.34');
});

test('Strg/Cmd+Z und Strg/Cmd+A bleiben in Textfeldern normale Textbefehle', async ({ page }) => {
  await page.goto('/neu?type=url');
  await page.locator('#f-url').fill('beispiel.de');
  await page.getByRole('tab', { name: 'Stil' }).click();
  await page.getByRole('button', { name: 'Kobalt' }).click();
  await page.locator('#f-url').focus();
  await page.keyboard.press('ControlOrMeta+z');
  // Das Design bleibt Kobalt, weil ⌘Z im Feld nicht das Design zurücknimmt
  await expect(page.getByRole('button', { name: 'Kobalt' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
});

test('Export übernimmt die gewählte Druckbreite', async ({ page }) => {
  await page.goto('/neu?type=url');
  await page.locator('#f-url').fill('beispiel.de');
  await page.getByLabel('Druckbreite in Millimetern').selectOption('100');
  await page.getByTestId('export').click();
  await page.locator('.format-card', { hasText: 'PDF' }).click();
  await expect(page.locator('#mm')).toHaveValue('100');
});

test('Zu viele Daten werden verständlich gemeldet', async ({ page }) => {
  await page.goto('/neu?type=text');
  await page.locator('#f-text').fill('x'.repeat(4000));
  await expect(page.locator('.side-left .field-issue.error')).toContainText('Zu viele Daten');
  await expect(page.locator('.stage [data-testid=scan-panel]')).toHaveAttribute('data-status', 'fail');
});

test('Scanner liest auch eigene SVG-Exporte', async ({ page }) => {
  await page.goto('/scanner');
  await page.getByTestId('scan-file').setInputFiles(path.join('test-results/exports', 'vcard.svg'));
  await expect(page.getByTestId('scan-hit')).toContainText('Visitenkarte');
});

test('Befehlspalette hält den Fokus und schließt mit Escape', async ({ page }) => {
  await page.goto('/bibliothek');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: 'Befehl suchen' });
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).toHaveCount(0);
});
