# 2 — Installation

Tessera läuft als Docker-Container. Docker ist ein Programm, das fertig gepackte Anwendungen startet. Sie installieren also nicht Tessera selbst, sondern Docker, und laden Tessera dann mit einem einzigen Befehl.

Es gibt drei Wege:

| Weg | Für wen | Ergebnis |
| --- | --- | --- |
| [Auf dem Mac](#a-auf-dem-mac) | Einzelplatz, Ausprobieren | Tessera läuft auf Ihrem Rechner unter http://localhost:8080 |
| [Auf dem Windows-PC](#b-auf-dem-windows-pc) | Einzelplatz, Ausprobieren | wie beim Mac |
| [Auf einem Server](#c-auf-einem-server-für-it) (für IT) | Kanzlei, Team | eine Adresse für alle, zentrale Sicherung |

Auf einem Einzelplatz sehen nur Sie Ihre Codes. Dynamische Codes (Kapitel 10) funktionieren dort nur, solange Ihr Rechner läuft und das scannende Smartphone ihn erreicht. Für den Alltag im Team empfiehlt sich der Server.

## a) Auf dem Mac

1. Öffnen Sie [docker.com](https://www.docker.com/products/docker-desktop/) und laden Sie **Docker Desktop** für Mac herunter. Wählen Sie die Variante passend zu Ihrem Prozessor (Apple-Chip oder Intel).
2. Öffnen Sie die heruntergeladene Datei und ziehen Sie Docker in den Ordner „Programme“.
3. Starten Sie Docker Desktop aus dem Ordner „Programme“. Bestätigen Sie die Nutzungsbedingungen. Warten Sie, bis Docker Desktop meldet, dass es läuft.
4. Öffnen Sie das Programm **Terminal** (Programme → Dienstprogramme → Terminal).
5. Kopieren Sie diesen Befehl, fügen Sie ihn im Terminal ein und drücken Sie die Eingabetaste:

   ```
   docker run -d --name tessera -p 8080:3000 -v tessera-data:/data --restart unless-stopped ghcr.io/pbaumfalk/tessera:latest
   ```

   Docker lädt Tessera herunter und startet es. Beim ersten Mal dauert das etwas.
6. Öffnen Sie im Browser die Adresse **http://localhost:8080**. Es erscheint die Seite **Tessera einrichten**.
7. Holen Sie den Einrichtungscode, wie unter [Einrichtungscode finden](#einrichtungscode-finden) beschrieben, und folgen Sie der [Ersteinrichtung](#d-ersteinrichtung).

## b) Auf dem Windows-PC

1. Öffnen Sie [docker.com](https://www.docker.com/products/docker-desktop/) und laden Sie **Docker Desktop** für Windows herunter.
2. Führen Sie das Installationsprogramm aus. Übernehmen Sie die vorgeschlagenen Einstellungen. Starten Sie Windows neu, falls das Programm danach fragt.
3. Starten Sie Docker Desktop über das Startmenü. Bestätigen Sie die Nutzungsbedingungen. Warten Sie, bis Docker Desktop meldet, dass es läuft.
4. Öffnen Sie **PowerShell** (Startmenü → „PowerShell“ eintippen → öffnen).
5. Kopieren Sie diesen Befehl, fügen Sie ihn ein (Rechtsklick) und drücken Sie die Eingabetaste:

   ```
   docker run -d --name tessera -p 8080:3000 -v tessera-data:/data --restart unless-stopped ghcr.io/pbaumfalk/tessera:latest
   ```

6. Öffnen Sie im Browser die Adresse **http://localhost:8080**. Es erscheint die Seite **Tessera einrichten**.
7. Holen Sie den Einrichtungscode und folgen Sie der [Ersteinrichtung](#d-ersteinrichtung).

### Was der Befehl bedeutet

| Teil | Bedeutung |
| --- | --- |
| `--name tessera` | Der Container heißt „tessera“. Unter diesem Namen finden Sie ihn in Docker Desktop. |
| `-p 8080:3000` | Tessera ist auf Ihrem Rechner unter Port 8080 erreichbar. |
| `-v tessera-data:/data` | Ihre Codes, Konten und Einstellungen liegen im Speicherbereich „tessera-data“. Er bleibt erhalten, auch wenn Sie den Container löschen oder aktualisieren. |
| `--restart unless-stopped` | Tessera startet automatisch wieder, sobald Docker Desktop läuft. |

Läuft auf Port 8080 schon ein anderes Programm, ersetzen Sie im Befehl `8080:3000` zum Beispiel durch `8081:3000` und öffnen dann http://localhost:8081.

### Einrichtungscode finden

Beim ersten Start schreibt Tessera einen Einrichtungscode in sein Protokoll. Die Zeile sieht so aus:

```
Ersteinrichtung: Einrichtungscode 1234-5678-9012 (nur gültig, bis das erste Konto angelegt ist).
```

**Mit Docker Desktop:**

1. Öffnen Sie Docker Desktop.
2. Öffnen Sie die Liste der Container.
3. Klicken Sie auf den Container **tessera**.
4. Öffnen Sie den Reiter **Logs**. Suchen Sie die Zeile mit „Einrichtungscode“.

**Im Terminal bzw. in PowerShell:**

```
docker logs tessera
```

## c) Auf einem Server (für IT)

Voraussetzung: ein Linux-Server mit Docker und Docker Compose.

**Mit Docker Compose:**

```bash
git clone https://github.com/PBaumfalk/Tessera.git && cd Tessera && cp .env.example .env
docker compose pull && docker compose up -d
docker compose logs tessera   # Einrichtungscode
```

Die mitgelieferte `docker-compose.yml` lädt das fertige Image `ghcr.io/pbaumfalk/tessera` und startet es gehärtet: schreibgeschütztes Dateisystem, keine Linux-Capabilities, `no-new-privileges`, Protokollrotation. Die Daten liegen im Volume `tessera-data` (Docker zeigt es mit dem Projektnamen davor an, also `tessera_tessera-data`). Tessera ist danach unter `http://SERVER:8080` erreichbar; den Port ändern Sie mit `TESSERA_PORT` in `.env`.

**Selbst bauen:** Statt das fertige Image zu laden, baut `docker compose up -d --build` das Image lokal aus dem Quellcode (die Datei enthält dafür `build: .`).

**Version festlegen:** Ohne weitere Angabe verwendet die Compose-Datei den Tag `latest`. Für den Produktivbetrieb empfiehlt sich ein fester Versions-Tag, zum Beispiel `TESSERA_VERSION=1.0.0` in `.env`. Dann bestimmen Sie selbst, wann ein Update kommt.

**Konfiguration:** Alle Umgebungsvariablen sind optional und in [../konfiguration.md](../konfiguration.md) beschrieben. Für ein Intranet mit Reverse Proxy setzen Sie mindestens `APP_URL` und `TRUST_PROXY`. Vor dem ersten dynamischen Code sollte die Kurzlink-Basisadresse feststehen (Kapitel [10](10-dynamische-codes.md) und [../betrieb.md](../betrieb.md)).

**Bekannte Grenzen:** Das Image gibt es für `linux/amd64` und `linux/arm64`. Betrieben und getestet wurde es auf Docker Desktop (ARM64), ein Lauf auf einem x86-64-Host wurde nicht durchgeführt. Tessera nutzt SQLite und ist für genau eine Instanz ausgelegt; mehrere Container auf derselben Datenbank sind nicht vorgesehen.

## d) Ersteinrichtung

Solange es noch kein Konto gibt, zeigt Tessera die Seite **Tessera einrichten**.

1. Tragen Sie unter **Einrichtungscode** den Code aus dem Protokoll ein (Format `1234-5678-9012`).
2. Tragen Sie unter **Name** Ihren Namen und unter **E-Mail** Ihre E-Mail-Adresse ein.
3. Wählen Sie ein **Passwort** mit mindestens 10 Zeichen.
4. Klicken Sie auf **Konto anlegen und starten**.

Dieses erste Konto hat die Rolle **Administration**. Weitere Konten legen Sie danach an (Kapitel [12](12-benutzer-und-anmeldung.md)). Der Einrichtungscode gilt nur, bis das erste Konto existiert. Ist er falsch, meldet Tessera: „Der Einrichtungscode stimmt nicht. Du findest ihn im Protokoll des Containers.“

**Alternative für IT:** Setzen Sie vor dem ersten Start `ADMIN_EMAIL` und `ADMIN_PASSWORD` (mindestens 10 Zeichen) in `.env`. Tessera legt das Administratorkonto dann selbst an, ein Einrichtungscode entfällt. Ist nur OIDC aktiv (`AUTH_LOCAL=false`), gibt es keinen Einrichtungscode; Konten entstehen bei der ersten Anmeldung über den Anbieter. Die Rolle **Administration** erhält dabei nur, wer einer Gruppe aus `OIDC_ADMIN_GROUPS` angehört.

## e) Updates

Ihre Daten liegen im Volume `tessera-data` und überstehen jedes Update. Datenbankänderungen spielt Tessera beim Start selbst ein und legt vorher eine Sicherung an (Kapitel [14](14-sicherung-und-betrieb.md)).

**Einzelcontainer (Mac, Windows, `docker run`):** Ein Neustart allein genügt nicht, der Container läuft sonst mit dem alten Stand weiter. Führen Sie nacheinander aus:

```
docker pull ghcr.io/pbaumfalk/tessera:latest
docker rm -f tessera
docker run -d --name tessera -p 8080:3000 -v tessera-data:/data --restart unless-stopped ghcr.io/pbaumfalk/tessera:latest
```

Der letzte Befehl ist derselbe wie bei der Installation. Löschen Sie das Volume `tessera-data` nicht.

**Docker Compose mit fertigem Image (für IT):**

```bash
git pull && docker compose pull && docker compose up -d
```

`git pull` holt eine geänderte `docker-compose.yml`. Haben Sie in `.env` einen festen `TESSERA_VERSION` gesetzt, tragen Sie dort vorher die neue Version ein.

**Docker Compose mit lokalem Build (für IT):**

```bash
git pull && docker compose up -d --build
```

## f) HTTPS

Über `http://localhost` funktioniert alles. Im Netzwerk über reines HTTP gibt es zwei Einschränkungen:

- Die **Kamera** im Scanner funktioniert nur über HTTPS oder `localhost`. Das ist eine Vorgabe der Browser. Über HTTP können Sie nur Bilder hochladen (Kapitel [11](11-scanner.md)).
- Anmelde-Cookies werden nur über HTTPS als `Secure` gesetzt.

Für den Betrieb im Team stellen Sie Tessera deshalb hinter einen Reverse Proxy mit TLS (Caddy, nginx oder Traefik). Beispiele und Einstellungen stehen in [../betrieb.md](../betrieb.md).

---

← [1 — Was ist Tessera?](01-was-ist-tessera.md) | [Inhalt](README.md) | [3 — Der erste Code](03-erster-code.md) →
