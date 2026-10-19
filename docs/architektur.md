# Architektur und Entscheidungen

## Überblick

```
Browser (React)                         Server (Node 24, Fastify)                 Volume /data
┌──────────────────────────┐   JSON    ┌──────────────────────────────────┐     ┌──────────────┐
│ Editor, Bibliothek, …    │──────────▶│ API, Auth (lokal/OIDC/Token)     │────▶│ tessera.db   │
│ src/shared: Kodierung,   │           │ src/shared: dieselbe Kodierung   │     │ files/       │
│ Renderer (SVG), Regeln   │◀──────────│ resvg (PNG), pdfkit (PDF)        │     │ secret.key   │
└──────────────────────────┘  Dateien  │ ZXing-WASM + jsQR (Scan-Prüfung) │     │ backups/     │
          ▲                             │ /r/:slug Weiterleitung           │     └──────────────┘
          │ scannt                      └──────────────────────────────────┘
      Smartphone ──────────── /r/abc123 ───────────────▲
```

Ein Container, eine Datenbankdatei, keine externen Dienste.

## Entscheidungen

| Thema | Entscheidung | Begründung |
| --- | --- | --- |
| Sprache | TypeScript durchgehend | Kodierung, Prüfung und Renderer laufen identisch im Browser (Live-Vorschau) und auf dem Server (Export, Serien, Weiterleitung). Es gibt keine zweite Implementierung, die abweichen könnte. |
| Server | Fastify 5 | Schnell, ausgereift, gute Plugins für Cookies, Header (Helmet), Rate-Limit und Uploads; pino-Logging mit Redaktion |
| Datenbank | SQLite über `node:sqlite` (WAL) | Für ein Intranet-Werkzeug mit Hunderten bis Tausenden Codes ideal: kein zweiter Container, Backup als eine Datei, keine nativen Build-Abhängigkeiten. Migrationen versioniert und transaktional in `src/server/db.ts`. |
| QR-Matrix | `qrcode` (nur der Kern) | Bewährte Kodierung inkl. Modusoptimierung und Masken. Gestaltung übernimmt ein eigener Renderer. |
| Renderer | Eigener SVG-Renderer (`src/shared/render.ts`) | Volle Kontrolle über Formen, Augen, Logos, Rahmen und nahtlose Pfade. Eine einzige SVG-Quelle für Vorschau, SVG, PNG (resvg) und PDF (svg-to-pdfkit). |
| Beschriftung | Text wird mit opentype.js in Vektorpfade umgewandelt | Exporte sehen ohne installierte Schriften überall gleich aus |
| PNG | resvg (Rust, native Binärdatei für arm64/x64) | Präzise, schnell, keine Systemschriften nötig |
| Scan-Prüfung | ZXing-C++ (WASM) und jsQR, 5 Situationen × 3 Maßstäbe | Zwei unabhängige Decoder. jsQR ist bewusst strenger und nähert schwächere Scanner an. Mehrere Maßstäbe verhindern Zufallsergebnisse, die bei nur einer Auflösung auftraten. |
| Oberfläche | React 19, React Router, TanStack Query, Zustand, Radix-Primitives, eigenes CSS | Zugängliche Grundbausteine (Dialoge, Menüs, Schieberegler) ohne fremde Optik. Das eigene Gestaltungssystem liegt in `src/client/styles/app.css`. |
| Auth | Sitzungs-Cookie (HttpOnly, SameSite=Lax, gehashte Token in der DB), scrypt-Passwörter, OIDC über `openid-client` (PKCE, State, Nonce), API-Tokens (gehasht) | Sichere Standards ohne externe Abhängigkeit; OIDC optional |
| CSRF | Schreibende API-Aufrufe brauchen den Header `X-Tessera: 1` und eine passende `Origin` | Browser senden fremde Header nicht ohne CORS-Freigabe, und die ist nicht vorhanden |
| Vertrauliches | AES-256-GCM für WLAN-Passwort und IBAN; optional gar nicht speichern; nie in Zusammenfassungen, Protokollen oder ZIP-Übersichten | Anforderung „nicht unnötig speichern oder protokollieren“ |
| Weiterleitung | `302` statt `301` | Browser speichern 301 dauerhaft, dann würden Zieländerungen bei bereits gescannten Codes nicht wirken |
| Statistik | Nur Tageszähler und Gerätetyp, standardmäßig aus | Datenschutz von Anfang an; keine IP, keine Cookies, kein User-Agent gespeichert |

## Verzeichnisse

| Pfad | Inhalt |
| --- | --- |
| `src/shared/content.ts` | Inhaltstypen: Felder, Prüfung, standardkonforme Kodierung |
| `src/shared/detect.ts` | Erkennung eingefügter oder gescannter Inhalte |
| `src/shared/design.ts` | Designmodell, Bereinigung, Stilvorlagen, Fehlerkorrektur-Automatik |
| `src/shared/render.ts` | SVG-Renderer |
| `src/shared/analyze.ts` | Regelprüfung der Lesbarkeit mit Lösungsvorschlägen |
| `src/server/verify.ts` | Dekodierprüfung unter simulierten Bedingungen |
| `src/server/exporter.ts` | PNG, SVG, PDF, ZIP, Etikettenbogen |
| `src/server/public.ts` | Öffentliche Weiterleitungen und gehostete Seiten |
| `src/server/auth.ts` | Anmeldung, Sitzungen, OIDC, Rollen |
| `src/client/` | Oberfläche |
| `tests/unit/` | Vitest: Standards, Rendering + Dekodierung, API-Integration |
| `tests/e2e/` | Playwright gegen den Docker-Container, Prüfung exportierter Dateien mit unabhängigen Decodern |
| `tests/decoders/` | Container mit ZBar, OpenCV, Poppler und librsvg |
| `tests/oidc/` | OIDC-Testumgebung |

## Gestaltung

Die visuelle Idee ist die Werkstatt einer Druckerei: kühle, ruhige Arbeitsflächen, Kobaltblau als einzige Akzentfarbe, Bricolage Grotesque für Überschriften und Instrument Sans für die Oberfläche. Das wiedererkennbare Element ist die Bühne im Editor. Dort liegt der Code wie ein Andruck auf dem Tisch, mit Passermarken, CMYK-Kontrollstreifen und Maßangabe in Millimetern. Sie lässt sich auf verschiedenen Untergründen testen. Alle Schriften werden lokal ausgeliefert, es gibt keine Abrufe von Google Fonts oder CDNs.
