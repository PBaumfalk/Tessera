// Aufbau der Fastify-Anwendung (ohne Start), damit Tests sie direkt verwenden können.
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config, VERSION } from './config';
import { db, openDb, schemaVersion } from './db';
import { authRoutes, bootstrapAuth, resolveUser } from './auth';
import { codeRoutes, libraryRoutes } from './codes';
import { apiRoutes } from './api';
import { publicRoutes } from './public';
import { UserError } from './errors';
import { loadServerFonts } from './raster';
import { hostAllowedForOpenMode, hostOfUrl, internalHosts, redirectOnly, requestHost } from './hosts';


export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  openDb();
  loadServerFonts();

  const app = Fastify({
    trustProxy: config.trustProxy as boolean | string,
    // Eigene, datensparsame Anfrage-Protokollierung (siehe onResponse)
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 2 * 1024 * 1024,
    logger: opts.logger === false ? false : {
      level: config.logLevel,
      // Keine Anfrageinhalte, keine Query-Strings, keine Cookies im Protokoll
      redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'body', 'password'], remove: true },
    },
  });

  bootstrapAuth(app.log);

  // Leere JSON-Bodys (z. B. bei DELETE) als {} behandeln statt abzulehnen
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = String(body ?? '').trim();
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new UserError(400, 'Die Anfrage enthält ungültige Daten.'), undefined);
    }
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure ? undefined : false,
  });

  // Öffentlicher Host: nur Weiterleitungen ausliefern, die App bleibt intern
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path.startsWith('/r/') || path === '/healthz') return;
    if (redirectOnly(req)) return reply.code(404).type('text/plain; charset=utf-8').send('Nicht gefunden');
    if (config.authDisabled && path.startsWith('/api/') && !hostAllowedForOpenMode(req)) {
      return reply.code(403).send({ error: { message: 'Dieser Hostname ist nicht freigegeben. Setze APP_URL oder ALLOWED_HOSTS.' } });
    }
  });

  app.addHook('onRequest', async (req) => {
    req.user = req.url.startsWith('/api/') ? await resolveUser(req) : null;
  });

  // CSRF-Schutz: Schreibende API-Aufrufe aus der Oberfläche brauchen einen eigenen Header
  // (Browser senden ihn bei fremden Seiten nicht ohne CORS-Freigabe) und eine passende Herkunft.
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (req.headers.authorization?.startsWith('Bearer ')) return;
    if (req.headers['x-tessera'] !== '1') throw new UserError(403, 'Anfrage abgelehnt (fehlender Sicherheits-Header).');
    const origin = req.headers.origin;
    if (origin) {
      const o = hostOfUrl(origin);
      if (o !== requestHost(req) && !internalHosts().has(o)) throw new UserError(403, 'Anfrage von fremder Herkunft abgelehnt.');
    }
  });

  app.addHook('onResponse', async (req, reply) => {
    if (req.url === '/healthz' || req.url.startsWith('/assets/')) return;
    const level = reply.statusCode >= 500 ? 'error' : 'info';
    app.log[level]({ method: req.method, path: req.url.split('?')[0], status: reply.statusCode, ms: Math.round(reply.elapsedTime) }, 'Anfrage');
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof UserError) return reply.code(err.statusCode).send({ error: { message: err.message, field: err.field } });
    if (err.statusCode === 429) return reply.code(429).send({ error: { message: 'Zu viele Versuche. Bitte warte eine Minute.' } });
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: { message: 'Die Daten sind zu groß. Verwende ein kleineres Logo oder weniger Zeilen.' } });
    }
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { message: 'Die Anfrage konnte nicht verarbeitet werden.' } });
    req.log.error({ err: { message: err.message, stack: err.stack } }, 'Unerwarteter Fehler');
    return reply.code(500).send({ error: { message: 'Etwas ist schiefgelaufen. Die Details stehen im Server-Protokoll.' } });
  });

  app.get('/healthz', async (_req, reply) => {
    try {
      db.prepare('SELECT 1').get();
      return { status: 'ok', version: VERSION, schema: schemaVersion() };
    } catch {
      return reply.code(503).send({ status: 'error' });
    }
  });

  await app.register(authRoutes);
  await app.register(codeRoutes);
  await app.register(libraryRoutes);
  await app.register(apiRoutes);
  await app.register(publicRoutes);

  // Oberfläche (Single-Page-App)
  const indexFile = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      wildcard: false,
      index: false,
      setHeaders: (res: any, file: string) => {
        res.header('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    const index = fs.readFileSync(indexFile, 'utf8');
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/r/') && !path.extname(req.url.split('?')[0])) {
        return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(index);
      }
      return reply.code(404).send({ error: { message: 'Nicht gefunden.' } });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { message: 'Nicht gefunden.' } }));
  }

  return app;
}
