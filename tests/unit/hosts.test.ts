// Host-Regeln ohne APP_URL: Die Oberfläche darf sich nicht selbst aussperren.
import { describe, expect, it } from 'vitest';

describe('Host-Regeln ohne APP_URL', () => {
  it('sperrt die Oberfläche nicht, wenn die Basisadresse auf denselben Host zeigt', async () => {
    delete process.env.APP_URL;
    const { buildApp } = await import('../../src/server/app');
    const { setSetting } = await import('../../src/server/db');
    const app = await buildApp({ logger: false });
    setSetting('publicBaseUrl', 'http://localhost:3111');
    const r = await app.inject({ method: 'GET', url: '/api/auth/state', headers: { host: 'localhost:3111' } });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});
