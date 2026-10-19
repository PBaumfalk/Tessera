// Verwaltungsbefehle: node dist/cli.js <befehl>
//   backup [ziel.db]            Konsistente Sicherung der Datenbank (läuft auch im Betrieb)
//   restore <quelle.db>         Datenbank wiederherstellen (nur bei gestopptem Server!)
//   reset-password <email>      Neues Passwort setzen (wird aus TESSERA_NEW_PASSWORD gelesen oder erzeugt)
//   check                       Integrität der Datenbank prüfen
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';
import { backupTo, db, openDb } from './db';
import { hashPassword, passwordProblem } from './security';

const [cmd, arg] = process.argv.slice(2);

function out(msg: string) {
  process.stdout.write(msg + '\n');
}

switch (cmd) {
  case 'backup': {
    openDb();
    const target = path.resolve(arg ?? path.join(config.backupsDir, `tessera-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`));
    backupTo(target);
    out(`Sicherung geschrieben: ${target}`);
    out('Hinweis: Für hochgeladene Dateien zusätzlich den Ordner files/ sichern, für verschlüsselte Inhalte secret.key bzw. SECRET_KEY.');
    break;
  }
  case 'restore': {
    if (!arg || !fs.existsSync(arg)) { out('Bitte eine vorhandene Sicherungsdatei angeben.'); process.exit(1); }
    const check = new DatabaseSync(arg, { readOnly: true });
    const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    const hasSchema = check.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").get();
    check.close();
    if (ok !== 'ok' || !hasSchema) { out('Die Datei ist keine gültige Tessera-Sicherung.'); process.exit(1); }
    if (fs.existsSync(config.dbFile)) {
      const keep = `${config.dbFile}.vor-restore-${Date.now()}`;
      fs.renameSync(config.dbFile, keep);
      for (const ext of ['-wal', '-shm']) fs.rmSync(config.dbFile + ext, { force: true });
      out(`Bisherige Datenbank aufbewahrt als ${keep}`);
    }
    fs.copyFileSync(arg, config.dbFile);
    openDb();
    out('Wiederhergestellt. Migrationen wurden geprüft. Server jetzt starten.');
    break;
  }
  case 'reset-password': {
    openDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(arg ?? '') as { id: string } | undefined;
    if (!user) { out('Kein Konto mit dieser E-Mail-Adresse.'); process.exit(1); }
    const pw = process.env.TESSERA_NEW_PASSWORD || crypto.randomBytes(12).toString('base64url');
    const problem = passwordProblem(pw);
    if (problem) { out(problem); process.exit(1); }
    db.prepare('UPDATE users SET password_hash = ?, disabled = 0 WHERE id = ?').run(hashPassword(pw), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    out(process.env.TESSERA_NEW_PASSWORD ? 'Passwort gesetzt.' : `Neues Passwort: ${pw}`);
    break;
  }
  case 'check': {
    openDb();
    out(`Integrität: ${(db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check}`);
    break;
  }
  default:
    out('Befehle: backup [ziel] | restore <quelle> | reset-password <email> | check');
    process.exit(cmd ? 1 : 0);
}
