# Tessera — Handbuch

Willkommen im Handbuch von **Tessera**, dem selbst gehosteten QR-Code-Studio.
Mit Tessera gestalten Sie QR-Codes, prüfen sie auf Lesbarkeit, verwalten sie
in einer Bibliothek, erzeugen sie in Serie und betreiben dynamische Kurzlinks.
Tessera läuft vollständig auf Ihrem eigenen Rechner oder Server. Es braucht
keinen Cloud-Dienst und kein Abo und sendet keine Telemetrie.

Dieses Handbuch richtet sich an alle, die QR-Codes erstellen: Mitarbeitende
in Kanzlei und Empfang, Marketing und Verwaltung. Technische Vorkenntnisse
sind nicht nötig. Abschnitte für Administratoren und IT sind mit **(für IT)**
gekennzeichnet.

## Inhalt

| Kapitel | Inhalt |
| --- | --- |
| [1 — Was ist Tessera?](01-was-ist-tessera.md) | Grundbegriffe einfach erklärt: Modul, Ruhezone, Fehlerkorrektur, statisch oder dynamisch, wo die Daten liegen. |
| [2 — Installation](02-installation.md) | Tessera auf dem Mac, auf dem Windows-PC oder auf einem Server einrichten, das erste Konto anlegen und aktualisieren. |
| [3 — Der erste Code](03-erster-code.md) | In 30 Sekunden vom eingefügten Link zum fertigen Code. |
| [4 — Inhaltstypen](04-inhaltstypen.md) | Alle 18 Inhaltstypen mit Pflichtfeldern, Tipps und Standards. |
| [5 — Gestalten](05-gestalten.md) | Das Designstudio Tab für Tab, Vorlagen, Rückgängig und Wiederholen. |
| [6 — Lesbarkeit](06-lesbarkeit.md) | Wie Tessera prüft, ob Ihr Code scannbar ist, und wie Sie Probleme mit einem Klick beheben. |
| [7 — Exportieren und drucken](07-exportieren-drucken.md) | PNG, SVG und PDF, Druckgröße, Schnittmarken und Tipps für Druckereien. |
| [8 — Bibliothek](08-bibliothek.md) | Codes suchen, filtern, in Ordnern und mit Schlagwörtern ordnen, mehrere auf einmal bearbeiten und aus dem Papierkorb wiederherstellen. |
| [9 — Serien](09-serien.md) | Viele Codes auf einmal aus einer Tabelle erzeugen, zum Beispiel Inventaretiketten. |
| [10 — Dynamische Codes](10-dynamische-codes.md) | Kurzlinks, deren Ziel Sie nach dem Druck noch ändern können, dazu Statistik und Datenschutz. |
| [11 — Scanner](11-scanner.md) | Vorhandene Codes aus Bildern, Screenshots oder per Kamera lesen und neu gestalten. |
| [12 — Benutzer und Anmeldung](12-benutzer-und-anmeldung.md) | Rollen, Konten, Passwörter, Firmenanmeldung (OIDC) und API-Tokens. |
| [13 — Schnittstelle (IT)](13-schnittstelle.md) | Die REST-Schnittstelle für andere Anwendungen mit Beispielen. |
| [14 — Sicherung und Betrieb (IT)](14-sicherung-und-betrieb.md) | Sicherung, Wiederherstellung, Updates, Protokolle, Datenschutz und Sicherheit. |
| [15 — Häufige Fragen](15-haeufige-fragen.md) | Antworten auf typische Fragen, zum Beispiel „Mein Code lässt sich nicht scannen“. |

## Für wen welches Kapitel

| Sie sind … | Lesen Sie zuerst |
| --- | --- |
| Neu bei QR-Codes | Kapitel [1](01-was-ist-tessera.md), [3](03-erster-code.md) und [15](15-haeufige-fragen.md) |
| Empfang, Sekretariat, Kanzleimitarbeitende | Kapitel [3](03-erster-code.md), [4](04-inhaltstypen.md) (WLAN, Visitenkarte, GiroCode), [7](07-exportieren-drucken.md) und [8](08-bibliothek.md) |
| Marketing | Kapitel [5](05-gestalten.md), [6](06-lesbarkeit.md), [7](07-exportieren-drucken.md) und [10](10-dynamische-codes.md) |
| Verantwortlich für Inventar oder Etiketten | Kapitel [9](09-serien.md) |
| Für Tessera auf dem eigenen Rechner zuständig | Kapitel [2](02-installation.md), Abschnitte a) oder b) und d) |
| IT und Administration | Kapitel [2](02-installation.md), [12](12-benutzer-und-anmeldung.md), [13](13-schnittstelle.md), [14](14-sicherung-und-betrieb.md) sowie die Projektdokumentation in [`docs/`](../) |

## Schnelleinstieg in fünf Schritten

1. Tessera im Browser öffnen, zum Beispiel unter http://localhost:8080
   ([Installation](02-installation.md)).
2. Auf der Startseite einen Link, eine IBAN oder eine Telefonnummer in das
   Eingabefeld einfügen. Tessera erkennt den Typ selbst.
3. Den Code im Designstudio gestalten oder den Vorschlag übernehmen
   ([Kapitel 5](05-gestalten.md)).
4. Auf die Lesbarkeitsanzeige achten. Grün heißt **Sicher scannbar**
   ([Kapitel 6](06-lesbarkeit.md)).
5. Mit ⌘S (Mac) bzw. Strg+S (Windows) speichern und den Code als PNG, SVG
   oder PDF exportieren ([Kapitel 7](07-exportieren-drucken.md)).

## Weitere Dokumentation (für IT)

| Thema | Datei |
| --- | --- |
| Alle Umgebungsvariablen | [konfiguration.md](../konfiguration.md) |
| Reverse Proxy, öffentliche Kurzlinks, authentik, Backup | [betrieb.md](../betrieb.md) |
| Architektur und Entscheidungen | [architektur.md](../architektur.md) |
| Tests und Ergebnisse | [tests.md](../tests.md) |
| Bekannte Einschränkungen | [einschraenkungen.md](../einschraenkungen.md) |

---

[Inhalt](README.md) | [1 — Was ist Tessera?](01-was-ist-tessera.md) →
