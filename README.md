<img src="assets/favicon.svg" width="72" alt="Tessera">

# Tessera

[![Tests, Image & Release](https://github.com/PBaumfalk/Tessera/actions/workflows/docker.yml/badge.svg)](https://github.com/PBaumfalk/Tessera/actions/workflows/docker.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)
[![Docker-Image](https://img.shields.io/badge/ghcr.io-pbaumfalk%2Ftessera-blue?logo=docker)](https://ghcr.io/pbaumfalk/tessera)

**QR-Codes gestalten, prüfen, drucken und verwalten, auf dem eigenen Server.**
Tessera ist ein kostenloses QR-Code-Studio für Kanzleien, Unternehmen und Teams.
Sie fügen einen Link, eine IBAN, WLAN-Daten oder eine Visitenkarte ein und
erhalten sofort einen fertigen Code. Bei Bedarf gestalten Sie ihn mit Farben,
Logo und Rahmen. Tessera prüft bei jeder Änderung, ob der Code noch zuverlässig
scannbar ist, und warnt, bevor ein unlesbarer Code in den Druck geht.

Tessera braucht keine Cloud, kein Abo und sendet keine Daten an Dritte. Die
Statistik für dynamische Codes ist standardmäßig ausgeschaltet.

*Tessera* heißt das einzelne Steinchen eines Mosaiks. Ein QR-Code ist genau das:
ein Mosaik aus Modulen.

> **English abstract:** Self-hosted QR code studio. It offers 18 standards-compliant
> content types (vCard, Wi-Fi, SEPA/EPC GiroCode, iCalendar, …), a design editor
> with live scannability verification (two independent decoders under simulated
> blur, low light, small size and tilt), vector export (SVG, PDF with crop marks),
> PNG with DPI, a library, batch generation from CSV/Excel and dynamic codes with
> an own redirect service and privacy-first optional statistics. It supports
> local accounts, OIDC (e.g. authentik), API tokens and a single Docker container
> with SQLite. The UI and documentation are in German.

![Editor mit Andruck-Vorschau und Lesbarkeitsprüfung](docs/screenshots/editor.png)

## 📖 Handbuch

Die vollständige Anleitung steht im **[Handbuch](docs/handbuch/README.md)**. Sie
ist verständlich für Mitarbeitende ohne IT-Kenntnisse und hat eigene Abschnitte
für die IT. Sie reicht von den
[Grundbegriffen](docs/handbuch/01-was-ist-tessera.md) über den
[ersten Code in 30 Sekunden](docs/handbuch/03-erster-code.md) und das
[Gestalten](docs/handbuch/05-gestalten.md) bis zu
[dynamischen Codes](docs/handbuch/10-dynamische-codes.md) und
[Sicherung & Betrieb](docs/handbuch/14-sicherung-und-betrieb.md).

## Installation

Tessera läuft als Docker-Container. Auf dem eigenen Rechner reicht dafür
**Docker Desktop**, ein kostenloses Programm. Für das ganze Team eignet sich ein
Server im Firmennetz.

<details>
<summary><strong>🍎 Auf dem Mac</strong> (ohne IT-Kenntnisse)</summary>

1. [Docker Desktop für Mac](https://www.docker.com/products/docker-desktop/)
   herunterladen, installieren und einmal starten (Wal-Symbol in der Menüleiste).
2. Das Programm **Terminal** öffnen (über die Spotlight-Suche) und diese Zeile
   einfügen, dann Enter drücken:
   ```
   docker run -d --name tessera -p 8080:3000 -v tessera-data:/data --restart unless-stopped ghcr.io/pbaumfalk/tessera:latest
   ```
3. Im Browser **http://localhost:8080** öffnen.
4. Beim ersten Start fragt Tessera nach einem **Einrichtungscode**. Sie finden
   ihn in Docker Desktop unter **Containers → tessera → Logs** in der Zeile
   „Einrichtungscode …“. Danach legen Sie Ihr Konto an, fertig.

Ausführlich mit Bildern: [Handbuch, Kapitel 2](docs/handbuch/02-installation.md).
</details>

<details>
<summary><strong>🪟 Auf dem Windows-PC</strong> (ohne IT-Kenntnisse)</summary>

1. [Docker Desktop für Windows](https://www.docker.com/products/docker-desktop/)
   herunterladen, installieren (Standardeinstellungen übernehmen), den Rechner
   bei Aufforderung neu starten und Docker Desktop öffnen.
2. Die **Eingabeaufforderung** oder **PowerShell** öffnen (Startmenü, „cmd“
   eintippen) und diese Zeile einfügen, dann Enter drücken:
   ```
   docker run -d --name tessera -p 8080:3000 -v tessera-data:/data --restart unless-stopped ghcr.io/pbaumfalk/tessera:latest
   ```
3. Im Browser **http://localhost:8080** öffnen.
4. Den **Einrichtungscode** finden Sie in Docker Desktop unter
   **Containers → tessera → Logs**. Danach legen Sie Ihr Konto an.

Ausführlich: [Handbuch, Kapitel 2](docs/handbuch/02-installation.md).
</details>

<details>
<summary><strong>🖥️ Auf einem Server</strong> (für IT: Docker Compose, eine Adresse für das ganze Team)</summary>

```
git clone https://github.com/PBaumfalk/Tessera.git
cd Tessera
cp .env.example .env        # APP_URL, optional PUBLIC_BASE_URL, OIDC …
docker compose pull && docker compose up -d
docker compose logs tessera # Einrichtungscode für das erste Konto
```

Lokal bauen statt das fertige Image zu laden: `docker compose up -d --build`.

Das Image gibt es für `linux/amd64` und `linux/arm64`. Der Container läuft ohne
Root-Rechte mit schreibgeschütztem Dateisystem. Daten liegen im Volume
`tessera-data`. Reverse Proxy, HTTPS, öffentliche Kurzlinks, authentik,
Backup und Updates beschreiben [Kapitel 14](docs/handbuch/14-sicherung-und-betrieb.md)
und [docs/betrieb.md](docs/betrieb.md). Alle Einstellungen stehen in
[docs/konfiguration.md](docs/konfiguration.md).
</details>

## Funktionen im Überblick

| Start: einfügen und fertig | Bibliothek |
| --- | --- |
| ![Startseite mit Schnelleingabe](docs/screenshots/start.png) | ![Bibliothek mit Ordnern](docs/screenshots/bibliothek.png) |

- **18 Inhaltstypen, standardkonform:** Website, Visitenkarte (vCard/MECARD),
  WLAN, Anruf, E-Mail, SMS, WhatsApp, Standort, Termin, Terminbuchung,
  Social Media, App-Links, Dokument, GiroCode (SEPA), PayPal, Bitcoin, Text und
  eigene Daten ([Kapitel 4](docs/handbuch/04-inhaltstypen.md))
- **Schnelleingabe:** Sie fügen etwas ein, Tessera erkennt den Typ und füllt
  die Felder aus ([Kapitel 3](docs/handbuch/03-erster-code.md))
- **Designstudio:** Formen, Ecken, Farben und Verläufe, Logos und Symbole,
  Rahmen mit Beschriftung, Stile und eigene Firmenvorlagen
  ([Kapitel 5](docs/handbuch/05-gestalten.md))
- **Lesbarkeitsprüfung:** Jeder Code wird wie beim Export gerendert und unter
  fünf simulierten Bedingungen (klein, unscharf, schwaches Licht, schräg) von
  zwei unabhängigen Decodern gelesen. Probleme behebt ein Klick auf den
  Vorschlag ([Kapitel 6](docs/handbuch/06-lesbarkeit.md))
- **Export für Web und Druck:** PNG mit DPI, SVG in Millimetern, PDF als Vektor
  mit Schnittmarken, Rechner für die Druckgröße, „Als Bild kopieren“
  ([Kapitel 7](docs/handbuch/07-exportieren-drucken.md))
- **Bibliothek:** Ordner, Schlagwörter, Favoriten, Suche, Mehrfachauswahl,
  Papierkorb ([Kapitel 8](docs/handbuch/08-bibliothek.md))
- **Serien:** Hunderte Codes aus Excel oder CSV, z. B. Inventaretiketten, als
  ZIP oder fertiger Etikettenbogen ([Kapitel 9](docs/handbuch/09-serien.md))
- **Dynamische Codes:** Das Ziel ist nach dem Druck änderbar, dazu Pausieren,
  Ablaufdatum, Ersatzziel und Verlauf. Visitenkarten und Termine bekommen eine
  eigene kleine Seite. Es gibt eine anonyme Statistik, die standardmäßig aus
  ist ([Kapitel 10](docs/handbuch/10-dynamische-codes.md))
- **Scanner:** Vorhandene Codes aus Fotos oder Screenshots lesen und neu
  gestalten ([Kapitel 11](docs/handbuch/11-scanner.md))
- **Für das Team:** Rollen, Anmeldung über authentik (OIDC), Schnittstelle für
  andere Programme ([Kapitel 12](docs/handbuch/12-benutzer-und-anmeldung.md),
  [13](docs/handbuch/13-schnittstelle.md))
- **Hell und dunkel, Smartphone und Tablet**, Tastenkürzel und eine
  Befehlspalette (⌘K bzw. Strg+K)

| Serien aus Tabellen | Dunkler Modus |
| --- | --- |
| ![Serien-Assistent](docs/screenshots/serien.png) | ![Editor im dunklen Modus](docs/screenshots/editor-dunkel.png) |

## Datenschutz und Sicherheit

- Keine Telemetrie und keine externen Dienste. Schriften und Programmteile
  liefert Tessera selbst aus.
- WLAN-Passwörter und IBANs werden verschlüsselt gespeichert (AES-256-GCM) oder
  auf Wunsch gar nicht. Sie erscheinen nie im Protokoll.
- Die Statistik dynamischer Codes zählt höchstens Scans pro Tag und den
  Gerätetyp. Keine IP-Adressen, keine Cookies.
- Die Weiterleitung für öffentliche Kurzlinks lässt sich vom Rest trennen: Auf
  der öffentlichen Domain liefert Tessera nur Weiterleitungen aus, die
  Oberfläche bleibt im Firmennetz.

## Für Entwickler

TypeScript durchgehend. Aufbau und Verzeichnisse beschreibt
[docs/architektur.md](docs/architektur.md).
- Server: Node 24 und Fastify
- Datenbank: SQLite über `node:sqlite`
- Oberfläche: React mit Vite
- Rendering: eigener SVG-Renderer, PNG über resvg, PDF über pdfkit
- Prüfung: ZXing-C++ (WASM) und jsQR

```
npm install
npm run dev:server     # API auf :3111
npm run dev:client     # Oberfläche auf :5173
npm test               # Unit- und Integrationstests
npm run typecheck
```

Die End-to-End-Tests laufen gegen den echten Container. Danach werden die
exportierten Dateien mit ZBar und OpenCV geprüft, also unabhängig von Tessera
([docs/tests.md](docs/tests.md)). Bekannte Grenzen stehen in
[docs/einschraenkungen.md](docs/einschraenkungen.md), Änderungen im
[Änderungsprotokoll](CHANGELOG.md).

## Lizenz

[MIT](LICENSE), © 2026 Patrick Baumfalk.

Mitgelieferte Bestandteile:
- Schriften Bricolage Grotesque, Instrument Sans, Fraunces und JetBrains Mono
  (SIL Open Font License 1.1, siehe [assets/fonts](assets/fonts/README.md))
- Markenzeichen-Symbole aus [Simple Icons](https://simpleicons.org) (CC0)
- Allgemeine Symbole aus [Lucide](https://lucide.dev) (ISC)
- Decoder [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) über zxing-wasm
  (Apache 2.0) und [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0)

Markennamen und -logos gehören ihren Inhabern und dürfen nur im Rahmen der
jeweiligen Markenrichtlinien verwendet werden.

## Haftungsausschluss

Tessera unterstützt beim Erstellen und Prüfen von QR-Codes. Die
Lesbarkeitsprüfung simuliert Scanbedingungen mit Software-Decodern und ersetzt
keinen Test mit echten Geräten und gedruckten Exemplaren. Vor großen
Druckauflagen sollten Sie einen Probedruck mit mehreren Smartphones scannen. Für
die Richtigkeit erzeugter Zahlungsdaten und für Folgen unlesbarer Codes wird
keine Gewähr übernommen.
