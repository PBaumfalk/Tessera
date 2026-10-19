# Tessera – QR-Code-Studio

Tessera ist ein selbst gehostetes Studio für QR-Codes: gestalten, auf Lesbarkeit prüfen, verwalten, in Serie erzeugen und als dynamische Kurzlinks betreiben. Es läuft vollständig auf dem eigenen Server und braucht keinen Cloud-Dienst und kein Abo. Telemetrie gibt es keine.

*Tessera* heißt das einzelne Steinchen eines Mosaiks. Ein QR-Code ist genau das: ein Mosaik aus Modulen.

## Schnellstart

```bash
cp .env.example .env          # optional anpassen
docker compose up -d --build
docker compose logs tessera   # Einrichtungscode für das erste Konto
```

Danach ist Tessera unter **http://SERVER:8080** erreichbar. Beim ersten Aufruf legst du mit dem Einrichtungscode aus dem Protokoll das Administratorkonto an. Alternativ setzt du `ADMIN_EMAIL` und `ADMIN_PASSWORD` in `.env`.

## Was Tessera kann

- **18 Inhaltstypen, standardkonform kodiert:** Website (mit UTM), vCard 3.0/4.0 und MECARD, WLAN (inkl. WPA2-Enterprise), Anruf, E-Mail (RFC 6068 / MATMSG), SMS, WhatsApp, Standort (Koordinaten oder Adresse; Google, Apple, OSM, geo:), Termin (iCalendar mit korrekter Zeitzonenumrechnung), Terminbuchung, Social Media (16 Plattformen), App-Store-Links, Dokumente (Link oder Datei-Upload), GiroCode (EPC069-12 mit IBAN- und RF-Prüfung), PayPal.Me, Bitcoin (BIP 21), Text, eigene Rohdaten (mit Escape-Sequenzen für GS1/Lager).
- **Schnelleingabe:** Einen Link, eine IBAN, einen WLAN-String, eine vCard, einen Kartenlink oder eine Telefonnummer einfügen. Tessera erkennt den Typ und füllt die Felder aus.
- **Designstudio:** 9 Modulformen, 5 × 5 Augenformen, Farben und Verläufe (linear, radial), eigene Augenfarben, 48 Symbole und eigene Logos (PNG, JPG, WebP, SVG), 7 Rahmen mit Beschriftung in 4 Schriften, kuratierte Stile, „Überrasch mich“, eigene Vorlagen, Rückgängig und Wiederholen.
- **Lesbarkeitsprüfung:** Jede Änderung wird geprüft. Sofortregeln bewerten Kontrast, Ruhezone, Logoabdeckung gegen die Fehlerkorrektur, Dichte und Druckgröße. Zusätzlich wird der Code exakt wie beim Export gerendert und unter fünf simulierten Bedingungen (ideal, klein, unscharf, schwaches Licht, schräg; jeweils in mehreren Maßstäben) mit **zwei unabhängigen Decodern** (ZXing-C++, jsQR) gelesen. Für jedes Problem gibt es einen Lösungsvorschlag per Klick. Unlesbare Codes blockieren den Export, bis man ausdrücklich bestätigt.
- **Andruck-Vorschau:** Der Code erscheint auf einem Andruckbogen mit Maßangabe und lässt sich auf verschiedenen Untergründen testen (Papier, dunkel, Karton, unruhiges Foto, Transparenz).
- **Export:** PNG mit DPI-Angabe (bis 8000 px), SVG mit Millimetermaßen, PDF als echter Vektor, optional mit 3 mm Beschnitt und Schnittmarken. Beschriftungen sind Vektorpfade, Druckereien brauchen also keine Schriften. Dazu: als Bild kopieren, Teilen auf Mobilgeräten und ein Rechner für die Druckgröße nach Scan-Entfernung.
- **Bibliothek:** Ordner, Schlagwörter, Favoriten, Volltextsuche, Filter, Sortierung, Raster- und Listenansicht, Mehrfachauswahl (auch mit Shift), Sammelaktionen, Papierkorb mit Wiederherstellen. Getestet mit über 400 Codes.
- **Serien:** CSV, Excel (.xlsx), TSV, JSON oder aus Excel eingefügte Tabellen. Automatische Spaltenzuordnung, Vorlagen wie `https://firma.de/{{Raum}}`, Prüfung jeder Zeile vor dem Erzeugen, Beschriftung je Code. Ausgabe als ZIP (PNG/SVG/PDF und CSV-Übersicht), als Etikettenbogen (A4/A3/Letter) oder direkt in die Bibliothek.
- **Dynamische Codes:** Kurzlinks über eine eigene Weiterleitung (`/r/…`). Ziel jederzeit änderbar, eigene Kurzadresse, Pausieren, Ablaufdatum, Ersatzziel und Änderungsverlauf. Visitenkarten und Termine werden als kleine Seite mit „Kontakt speichern“ bzw. „In den Kalender eintragen“ gehostet, dadurch bleibt der Code klein. App-Links erkennen das Gerät und öffnen den passenden Store. Dateien (z. B. Anleitungen) lassen sich direkt in Tessera ablegen.
- **Datenschutz:** Statistik ist standardmäßig aus. Wenn erlaubt, zählt Tessera nur Scans pro Tag und den Gerätetyp. Keine IP-Adressen, keine Cookies, keine Browserkennungen; Bots, Linkvorschauen, „Do Not Track“ und GPC werden nicht gezählt. WLAN-Passwörter und IBANs werden mit AES-256-GCM verschlüsselt oder auf Wunsch gar nicht gespeichert.
- **Intranet-tauglich:** Lokale Konten mit Rollen (Administration, Bearbeiten, Nur ansehen), OIDC (z. B. authentik) mit Gruppen-zu-Rollen-Zuordnung, API-Tokens und eine REST-Schnittstelle für andere Anwendungen. Auf der öffentlichen Kurzlink-Domain liefert Tessera nur Weiterleitungen aus.
- **Scanner:** Vorhandene Codes aus Fotos, Screenshots (⌘V) oder per Kamera lesen und im Studio neu gestalten.
- **Komfort:** Befehlspalette (⌘K), Tastenkürzel (⌘S speichern, ⌘E exportieren, ⌘Z rückgängig, N neuer Code, / suchen), heller und dunkler Modus, Smartphone- und Tablet-Layout.

## Dokumentation

| Thema | Datei |
| --- | --- |
| Konfiguration (alle Umgebungsvariablen) | [docs/konfiguration.md](docs/konfiguration.md) |
| Betrieb: Reverse Proxy, öffentliche Kurzlinks, authentik, Backup/Restore, Updates | [docs/betrieb.md](docs/betrieb.md) |
| Architektur und Entscheidungen | [docs/architektur.md](docs/architektur.md) |
| Tests und Ergebnisse | [docs/tests.md](docs/tests.md) |
| Bekannte Einschränkungen | [docs/einschraenkungen.md](docs/einschraenkungen.md) |

## Entwicklung

```bash
npm install
npm run dev:server     # API auf :3111 (DATA_DIR=./data)
npm run dev:client     # Oberfläche auf :5173 mit Proxy zur API
npm test               # Unit- und Integrationstests (Vitest)
npm run typecheck
```

End-to-End-Tests und die unabhängige Decoder-Prüfung sind in [docs/tests.md](docs/tests.md) beschrieben.
