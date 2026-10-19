# 13 — Schnittstelle (IT)

Andere Anwendungen im Intranet können über eine REST-Schnittstelle QR-Codes bei Tessera erzeugen und gespeicherte Codes exportieren. Typische Fälle: ein Ticketsystem druckt Codes auf Belege, eine Inventarverwaltung erzeugt Etiketten. Dieses Kapitel richtet sich an die IT.

## Zugang mit Token

1. Erstellen Sie ein Token unter **Optionen** → **Schnittstelle** → **Token erstellen** (Kapitel [12](12-benutzer-und-anmeldung.md#api-tokens)).
2. Senden Sie es bei jeder Anfrage im Header mit:

   ```
   Authorization: Bearer tsr_…
   ```

Ein Token hat dieselben Rechte wie das Konto, das es erstellt hat. Für eine Anwendung, die nur Codes erzeugt, genügt ein Konto mit der Rolle **Nur ansehen**. Tessera speichert Tokens nur als Hash. Tokens lassen sich nur in der Oberfläche erstellen, nicht per Token. Ein ungültiges oder widerrufenes Token sowie ein deaktiviertes Konto führen zu Status 401 („Bitte melde dich an.“), eine zu niedrige Rolle zu Status 403.

Schreibende Aufrufe (alles außer `GET`, `HEAD`, `OPTIONS`) mit Sitzungs-Cookie, also aus dem Browser, brauchen den Header `X-Tessera: 1` (CSRF-Schutz). Anfragen mit Bearer-Token sind davon ausgenommen.

## Einen Code erzeugen: `GET /api/v1/qr`

Der einfachste Weg. Tessera speichert dabei nichts, sondern liefert die Datei direkt zurück.

| Parameter | Bedeutung |
| --- | --- |
| `data` | Rohinhalt, der unverändert in den Code kommt |
| `type` | statt `data`: ein Inhaltstyp, dazu dessen Feldnamen als weitere Parameter |
| `format` | `svg` (Standard), `png` oder `pdf` |
| `size` | Kantenlänge in Pixeln für PNG, 64 bis 8000 (Standard 1024) |
| `dpi` | DPI-Angabe in der PNG-Datei, 72 bis 2400 (Standard 300) |
| `mm` | Druckbreite in Millimetern für SVG und PDF, 10 bis 1000 (Standard 50) |
| `template` | ID einer gespeicherten Vorlage (hat Vorrang vor `preset`) |
| `preset` | Stil statt Vorlage: `klassisch`, `kobalt`, `tinte`, `abendrot`, `tiefsee`, `wald`, `nacht`, `facette`, `druck` |

Inhaltstypen für `type`: `url`, `vcard`, `wifi`, `text`, `phone`, `email`, `sms`, `whatsapp`, `geo`, `event`, `booking`, `social`, `appstore`, `document`, `epc`, `paypal`, `bitcoin`, `raw`. Die Feldnamen stehen in `src/shared/content.ts` (z. B. `url` für `type=url`; `ssid`, `security`, `password` für `type=wifi`; `name`, `iban`, `amount`, `remittance` für `type=epc`). Tessera prüft den Inhalt wie in der Oberfläche und wählt die Fehlerkorrektur passend zum Typ. Ohne `template` und `preset` verwendet Tessera das Standarddesign, nicht die Standardvorlage aus den Einstellungen.

**Beispiele:**

```bash
# Website als SVG
curl -H "Authorization: Bearer $TOKEN" \
  "https://qr.intranet.firma.de/api/v1/qr?type=url&url=https://firma.de&format=svg"

# Beliebiger Inhalt als PNG mit Stilvorlage
curl -H "Authorization: Bearer $TOKEN" -o code.png \
  "https://qr.intranet.firma.de/api/v1/qr?data=INV-000123&format=png&size=1024&preset=kobalt"
```

Werte in der URL müssen URL-kodiert sein, vor allem `&`, `#`, `+` und Leerzeichen. `curl` hilft mit `-G --data-urlencode "data=…"`. WLAN-Passwörter in Abfrageparametern landen nicht im Tessera-Protokoll (es protokolliert keine Query-Strings), können aber in Protokollen eines vorgeschalteten Proxys auftauchen.

## Gespeicherte Codes exportieren

```bash
# Gespeicherter Code als druckfertiges PDF (50 mm)
curl -H "Authorization: Bearer $TOKEN" -o code.pdf \
  "https://qr.intranet.firma.de/api/codes/<id>/export?format=pdf&mm=50"
```

`GET /api/codes/<id>/export` versteht `format` (`png` Standard, `svg`, `pdf`), `size`, `dpi`, `mm` sowie `crop=1` für 3 mm Beschnitt mit Schnittmarken und `inline=1` für die Anzeige statt des Downloads. Die ID eines Codes steht in der Adresse des Editors.

Mehrere Codes auf einmal: `POST /api/codes/export` mit JSON-Body. `ids` nimmt höchstens 2000 IDs, `formats` ist eine Auswahl aus `png` (Standard), `svg` und `pdf`, `size` gilt für PNG und liegt hier bei 64 bis 2048 (Standard 1024).

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -o codes.zip \
  -d '{"ids":["<id1>","<id2>"],"formats":["png","pdf"],"size":1024}' \
  "https://qr.intranet.firma.de/api/codes/export"
```

Ohne `sheet` entsteht ein ZIP. Mit `"sheet": {"paper":"A4","cols":4,"rows":6,"labels":true,"marginMm":10}` entsteht ein Etikettenbogen als PDF (`A4`, `A3` oder `LETTER`; 1 bis 10 Spalten, 1 bis 14 Zeilen, Rand 0 bis 30 mm, höchstens 2000 Codes). Die gezeigten Werte sind zugleich die Standardwerte. Codes ohne vollständigen Inhalt werden übersprungen und im Antwort-Header `X-Tessera-Skipped` genannt.

## Weitere Endpunkte

Die Oberfläche nutzt dieselbe Schnittstelle. Die wichtigsten Endpunkte für Anwendungen:

| Methode und Pfad | Rolle | Zweck |
| --- | --- | --- |
| `GET /api/codes` | Nur ansehen | Codes auflisten. Parameter: `q` (Suche), `type`, `kind` (`static`/`dynamic`), `folder` (ID oder `none`), `tag`, `fav=1`, `trash=1`, `sort` (`updated`, `created`, `name`, `scans`, `type`), `dir` (`asc`/`desc`), `limit` (Standard 60, bis 500), `offset` |
| `GET /api/codes/<id>` | Nur ansehen | Einzelnen Code mit Inhalt und Design lesen |
| `GET /api/codes/<id>/preview.svg` | Nur ansehen | Vorschau als SVG |
| `GET /api/codes/<id>/stats` | Nur ansehen | Scan-Statistik eines dynamischen Codes |
| `POST /api/codes` | Bearbeiten | Code anlegen (`name`, `type`, `content`, `design`, `kind` u. a.) |
| `PATCH /api/codes/<id>` | Bearbeiten | Code ändern, z. B. das Ziel eines dynamischen Codes |
| `DELETE /api/codes/<id>` | Bearbeiten | Code in den Papierkorb legen; mit `?permanent=1` einen Code aus dem Papierkorb endgültig löschen |
| `POST /api/codes/<id>/restore` | Bearbeiten | Code aus dem Papierkorb holen |
| `GET /api/folders`, `GET /api/templates` | Nur ansehen | Ordner und Vorlagen mit ihren IDs |

Fehler beantwortet Tessera mit einem HTTP-Statuscode und JSON:

```json
{ "error": { "message": "Unbekannter Typ „xyz“.", "field": "type" } }
```

## Grenzen

- Rechenintensive Aufträge (Export, Serien, Prüfung) laufen höchstens zu zweit gleichzeitig. Weitere warten in einer Schlange mit höchstens 20 Plätzen.
- Ist die Schlange voll, antwortet Tessera mit Status 503 („Tessera ist gerade ausgelastet. …“). Wiederholen Sie die Anfrage dann später. Pro Konto läuft höchstens ein Serien- bzw. Mehrfachexport gleichzeitig (sonst Status 429).
- Ein großer PNG-Export (8000 px, etwa 2 bis 3 Sekunden) verzögert andere Anfragen in dieser Zeit spürbar. Fordern Sie nur die Größe an, die Sie brauchen.
- Inhalte mit mehr als 4296 Zeichen oder Inhalte, die mit der nötigen Fehlerkorrektur nicht in einen QR-Code passen, lehnt Tessera mit Status 400 ab („Zu viele Daten für einen QR-Code.“).
- Unbekannte Werte für `preset` werden mit Status 400 und einer Liste der gültigen Stile abgelehnt, nicht still ignoriert.

Weitere Grenzwerte stehen in [../konfiguration.md](../konfiguration.md#schutzmechanismen-und-grenzen).

---

← [12 — Benutzer und Anmeldung](12-benutzer-und-anmeldung.md) | [Inhalt](README.md) | [14 — Sicherung und Betrieb (IT)](14-sicherung-und-betrieb.md) →
