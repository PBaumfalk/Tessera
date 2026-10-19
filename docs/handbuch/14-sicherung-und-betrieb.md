# 14 — Sicherung und Betrieb (IT)

Dieses Kapitel beschreibt, wo Tessera seine Daten ablegt, wie Sie sie sichern und wiederherstellen und wie Sie den Dienst überwachen und aktualisieren. Es richtet sich an die IT. Die Befehle gelten für Docker Compose; für einen Einzelcontainer aus Kapitel [2](02-installation.md) ersetzen Sie `docker compose exec tessera` durch `docker exec tessera`.

## Wo die Daten liegen

Alles Wichtige liegt im Volume `tessera-data`, im Container unter `/data`:

| Pfad | Inhalt |
| --- | --- |
| `tessera.db` | SQLite-Datenbank: Codes, Konten, Einstellungen, Statistik |
| `files/` | Hochgeladene Dateien für dynamische Dokument-Codes |
| `secret.key` | Schlüssel für verschlüsselte Felder (entfällt, wenn `SECRET_KEY` gesetzt ist) |
| `backups/` | Automatische Sicherungen vor Migrationen und Sicherungen per Befehl |

Tessera nutzt eine einzige Datenbankdatei und ist für genau eine Instanz ausgelegt. Mehrere Container auf derselben Datenbank sind nicht vorgesehen.

## Sicherung in der Oberfläche

1. Melden Sie sich mit der Rolle **Administration** an.
2. Klicken Sie auf **Optionen** und wählen Sie den Bereich **System**.
3. Entscheiden Sie mit dem Schalter **Schlüssel für vertrauliche Felder mitsichern**, ob der Schlüssel in die Sicherung kommt.
4. Klicken Sie auf **Sicherung herunterladen**.

Sie erhalten eine Datei `tessera-backup-<Zeitstempel>.zip` mit `tessera.db`, dem Ordner `files/`, `manifest.json` und, falls gewählt, `secret.key`. Ist der Schlüssel über `SECRET_KEY` gesetzt, legt Tessera keine Datei `secret.key` an; die Sicherung enthält ihn dann auch mit eingeschaltetem Schalter nicht.

| Schalter | Folge |
| --- | --- |
| an (Standard) | Die Sicherung enthält alles, auch zum Entschlüsseln von WLAN-Passwörtern und IBANs. Bewahren Sie sie geschützt auf. |
| aus | WLAN-Passwörter und IBANs sind in der Sicherung nicht lesbar. Bewahren Sie den Schlüssel (`secret.key` bzw. `SECRET_KEY`) dann getrennt auf. |

Der Bereich **System** zeigt außerdem **Version**, **Datenbankschema**, **Anmeldung** und **Maximale Dateigröße**.

## Sicherung per Befehl

Die Sicherung läuft im laufenden Betrieb und ist konsistent (`VACUUM INTO`):

```bash
docker compose exec tessera node dist/cli.js backup /data/backups/tessera-$(date +%F).db
docker compose cp tessera:/data/backups ./tessera-backups        # aus dem Container holen
```

Ohne Zielangabe schreibt Tessera nach `/data/backups/tessera-<Zeitstempel>.db`. Der Befehl sichert nur die Datenbank. Sichern Sie zusätzlich `files/` und `secret.key` bzw. notieren Sie `SECRET_KEY` an sicherer Stelle.

Regelmäßige Sicherung per Cronjob auf dem Host (eine Datei je Wochentag):

```cron
15 2 * * * cd /opt/tessera && docker compose exec -T tessera node dist/cli.js backup /data/backups/nacht-$(date +\%u).db
```

Die Sicherungen liegen dann im selben Volume wie die Datenbank. Kopieren Sie sie zusätzlich auf ein anderes System.

## Wiederherstellen

Stoppen Sie Tessera vor dem Wiederherstellen.

```bash
docker compose stop tessera
docker compose run --rm --no-deps tessera node dist/cli.js restore /data/backups/tessera-2026-10-19.db
docker compose start tessera
```

Beim Einzelcontainer:

```bash
docker stop tessera
docker run --rm -v tessera-data:/data ghcr.io/pbaumfalk/tessera:latest node dist/cli.js restore /data/backups/tessera-2026-10-19.db
docker start tessera
```

`restore` prüft die Integrität der Sicherung und lehnt Dateien ab, die keine Tessera-Sicherung sind. Die bisherige Datenbank bewahrt es als `tessera.db.vor-restore-…` auf. Nötige Migrationen laufen danach automatisch. Dateien und Schlüssel stellt `restore` nicht wieder her: Kopieren Sie `files/` und `secret.key` zurück, z. B. aus dem Backup-ZIP mit `docker compose cp`.

## Weitere Befehle

| Befehl | Zweck |
| --- | --- |
| `node dist/cli.js check` | Integrität der Datenbank prüfen (Ausgabe `Integrität: ok`) |
| `node dist/cli.js reset-password <E-Mail>` | Neues Passwort setzen, siehe Kapitel [12](12-benutzer-und-anmeldung.md#passwort-der-administration-vergessen-für-it) |

Beispiel: `docker compose exec tessera node dist/cli.js check`

## Updates

```bash
git pull && docker compose pull && docker compose up -d    # fertiges Image
git pull && docker compose up -d --build                   # lokal gebaut
```

Beim Einzelcontainer gehen Sie vor wie in Kapitel [2](02-installation.md#e-updates) beschrieben.

Datenbankmigrationen laufen beim Start automatisch und transaktional. Vor jeder Migration einer bestehenden Datenbank legt Tessera eine Sicherung unter `/data/backups/vor-migration-*.db` an. Schlägt eine Migration fehl, rollt Tessera sie zurück und bricht den Start ab. Die Daten bleiben dann im alten Zustand.

## Starten, stoppen, Zustand

```bash
docker compose ps                  # Status inkl. Healthcheck
docker compose logs -f tessera     # Protokoll
docker compose down                # stoppen (Daten bleiben im Volume tessera-data)
```

Der Healthcheck fragt alle 30 Sekunden `GET /healthz` ab und prüft dabei auch die Datenbank. Den Endpunkt können Sie ebenso in Ihre Überwachung einbinden.

## Protokolle

Das Protokoll enthält pro Anfrage nur Methode, Pfad ohne Query-String, Status und Dauer. Nicht protokolliert werden Anfrageinhalte, Cookies, Authorization-Header, IP-Adressen und Query-Strings. Die Ausführlichkeit steuern Sie mit `LOG_LEVEL` (`debug`, `info`, `warn`, `error`, `silent`). Die mitgelieferte `docker-compose.yml` begrenzt das Protokoll auf fünf Dateien zu je 10 MB.

## Container-Härtung

Mit der mitgelieferten `docker-compose.yml` läuft der Container

- als unprivilegierter Benutzer,
- mit schreibgeschütztem Dateisystem (geschrieben wird nur nach `/data`, temporär nach `/tmp`),
- ohne Linux-Capabilities und mit `no-new-privileges`.

Beim `docker run`-Befehl aus Kapitel 2 sind nur der unprivilegierte Benutzer und der Healthcheck aktiv, weil sie im Image festgelegt sind. Für den Produktivbetrieb empfiehlt sich deshalb die Compose-Datei.

## Datenschutz und Sicherheit

| Thema | Umsetzung |
| --- | --- |
| Vertrauliche Felder | WLAN-Passwörter und IBANs werden mit AES-256-GCM verschlüsselt gespeichert. Auf Wunsch speichert Tessera sie gar nicht. Sie erscheinen nie in Zusammenfassungen, Protokollen oder ZIP-Übersichten. |
| Schlüssel | `SECRET_KEY` (mindestens 32 Zeichen) oder automatisch erzeugtes `/data/secret.key`. **Nach dem ersten Start nicht mehr ändern**, sonst sind gespeicherte Passwörter und IBANs nicht mehr lesbar. |
| Passwörter | gehasht mit scrypt; Sitzungen und API-Tokens nur als Hash in der Datenbank |
| Telemetrie | keine. Tessera sendet keine Daten an Dritte. |
| Externe Abrufe | keine. Schriften und alle Dateien der Oberfläche liefert Tessera selbst aus, ohne Google Fonts oder CDNs. |
| Scan-Statistik | standardmäßig aus. Wenn erlaubt, nur Scans pro Tag und Gerätetyp; keine IP-Adressen, Cookies oder Browserkennungen (Kapitel [10](10-dynamische-codes.md)) |
| Öffentliche Kurzlinks | Auf der öffentlichen Kurzlink-Domain liefert Tessera nur Weiterleitungen und `/healthz` aus, die Oberfläche bleibt intern ([../betrieb.md](../betrieb.md#dynamische-codes-intern-oder-öffentlich)). |
| Anfragelimits | Anmeldung 10 je IP und Minute, höchstens 10 Fehlversuche je Konto in 15 Minuten |

Das Backup-ZIP mit Schlüssel enthält alles, um vertrauliche Felder zu entschlüsseln. Behandeln Sie es wie ein Passwort.

## Bekannte Grenzen

- Das Image gibt es für `linux/amd64` und `linux/arm64`. Betrieben und getestet wurde es auf ARM64 (Docker Desktop); ein Lauf auf einem x86-64-Host wurde nicht durchgeführt.
- Exporte und Prüfungen laufen im Hauptprozess über eine Warteschlange. Ein sehr großer PNG-Export verzögert andere Anfragen kurz.
- Reverse Proxy mit TLS und öffentlicher Domain wurde nur mit simulierten Host-Headern getestet.

Alle Einschränkungen: [../einschraenkungen.md](../einschraenkungen.md). Reverse Proxy, öffentliche Kurzlinks und authentik: [../betrieb.md](../betrieb.md).

---

← [13 — Schnittstelle (IT)](13-schnittstelle.md) | [Inhalt](README.md) | [15 — Häufige Fragen](15-haeufige-fragen.md) →
