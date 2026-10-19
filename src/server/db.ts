// SQLite-Datenbank (node:sqlite) mit versionierten, transaktionalen Migrationen.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';

export type Row = Record<string, any>;

const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'grundschema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL DEFAULT '',
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor','viewer')),
        oidc_sub TEXT UNIQUE,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);
      CREATE TABLE folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#2234d6',
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE codes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        design TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'static' CHECK (kind IN ('static','dynamic')),
        slug TEXT UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT,
        fallback_url TEXT,
        tracking INTEGER NOT NULL DEFAULT 0,
        store_secrets INTEGER NOT NULL DEFAULT 1,
        folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        favorite INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        scan_total INTEGER NOT NULL DEFAULT 0,
        last_scan_at TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX codes_updated ON codes(updated_at);
      CREATE INDEX codes_folder ON codes(folder_id);
      CREATE INDEX codes_deleted ON codes(deleted_at);
      CREATE TABLE code_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code_id TEXT NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX code_events_code ON code_events(code_id, at);
      CREATE TABLE scan_daily (
        code_id TEXT NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        mobile INTEGER NOT NULL DEFAULT 0,
        desktop INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (code_id, day)
      );
      CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        design TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );
      CREATE TABLE files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

export let db: DatabaseSync;

export function openDb(file = config.dbFile): DatabaseSync {
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(file);
  return db;
}

function migrate(file: string) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied = new Set((db.prepare('SELECT id FROM schema_migrations').all() as Row[]).map((r) => r.id as number));
  const pending = MIGRATIONS.filter((m) => !applied.has(m.id));
  if (!pending.length) return;
  // Vor Migrationen einer bestehenden Datenbank automatisch sichern
  if (applied.size > 0 && file !== ':memory:') {
    const target = path.join(config.backupsDir, `vor-migration-${pending[0].id}-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }
  for (const m of pending) {
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.id} (${m.name}) fehlgeschlagen: ${(e as Error).message}`);
    }
  }
}

export function schemaVersion(): number {
  const r = db.prepare('SELECT MAX(id) v FROM schema_migrations').get() as Row;
  return (r?.v as number) ?? 0;
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const now = () => new Date().toISOString();

export function getSetting<T>(key: string, def: T): T {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
  if (!r) return def;
  try {
    return JSON.parse(r.value as string) as T;
  } catch {
    return def;
  }
}

export function setSetting(key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

/** Konsistente Online-Sicherung der Datenbank in eine Datei. */
export function backupTo(target: string): void {
  if (fs.existsSync(target)) fs.unlinkSync(target);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
}
