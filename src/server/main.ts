// Startpunkt des Servers.
import { buildApp } from './app';
import { config, VERSION } from './config';
import { db } from './db';
import { cleanupOrphanFiles } from './codes';

const app = await buildApp();

// Abgelaufene Sitzungen regelmäßig entfernen
// Abgelaufene Sitzungen und verwaiste Uploads (älter als 24 h, von keinem Code verwendet) regelmäßig entfernen
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  const n = cleanupOrphanFiles();
  if (n) app.log.info(`${n} verwaiste Dateien entfernt`);
}, 3600_000).unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} empfangen, Tessera wird beendet`);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`Tessera ${VERSION} läuft auf Port ${config.port}${config.appUrl ? ` (${config.appUrl})` : ''}`);
