# Tests und Ergebnisse

Stand: 19.10.2026, Image `tessera:1.0.0`, Node 24. Lokal auf Docker Desktop (ARM64); zusätzlich läuft bei jedem Push die GitHub-Actions-Pipeline auf Ubuntu x86-64: Typprüfung, Unit-Tests, E2E gegen den Container, Decoder-Prüfung und Persistenz. Danach wird das Image für amd64 und arm64 gebaut.

## Befehle

```bash
npm test                                   # Unit- und Integrationstests (Vitest)
npm run typecheck                          # TypeScript

# End-to-End gegen einen frischen Container auf Port 8090
docker compose build
TESSERA_PORT=8090 docker compose -p tessera-e2e up -d
npx playwright test                        # E2E_URL/E2E_PROJECT überschreibbar
docker build -t tessera-decoders tests/decoders
node tests/e2e/verify-exports.mjs          # exportierte Dateien mit ZBar/OpenCV prüfen
tests/e2e/persistence.sh                   # Neustart und Neuerstellung des Containers
docker compose -p tessera-e2e down -v

# OIDC mit Testanbieter
docker compose -p tessera-oidc -f docker-compose.yml -f tests/oidc/docker-compose.oidc.yml up -d
node tests/oidc/oidc-login.mjs && node tests/oidc/oidc-takeover.mjs
```

## Ergebnisse des letzten Laufs

| Prüfung | Umfang | Ergebnis |
| --- | --- | --- |
| Unit- und Integrationstests | 157 Tests in 5 Dateien: Kodierung aller Typen nach Standard, Erkennung (Rückweg kodieren → erkennen → kodieren), Rendering aller Formen, Augen, Rahmen und Logos mit Dekodierung durch ZXing und jsQR, kuratierte Stile, Schutzmechanismen, API mit echter SQLite-Datenbank (Rechte, CSRF, Verschlüsselung, Weiterleitung, Statistik-Datenschutz, Exporte, Backup, Tokens, 400 Codes), Sicherheits-Regressionen | **157/157 bestanden** |
| End-to-End (Playwright, Chromium) | 18 Abläufe gegen den Docker-Container: Ersteinrichtung mit Einrichtungscode aus dem Protokoll, Anfänger-Ablauf, WLAN/vCard/GiroCode/Termin über die Formulare, Gestalten → Speichern → Neu laden → Bearbeiten → Rückgängig, Warnung bei ungespeicherten Änderungen, unlesbares Design blockiert den Export und wird per Vorschlag repariert, dynamischer Code mit Zieländerung (echte 302-Weiterleitung), Bibliothek, Serie aus 26 Zeilen mit Fehlerzeile → ZIP und Bibliothek, Scanner, Smartphone-Ansicht, 8 Regressionstests aus dem explorativen Test | **18/18 bestanden** |
| Unabhängige Decoder | 57 über die Oberfläche exportierte Dateien (PNG, SVG über librsvg, PDF über Poppler, 50 Dateien aus dem Serien-ZIP) | **ZBar 57/57 korrekt.** OpenCV 54/57; es scheitert an stilisierten Augen und an einem WLAN-Code mit Umlauten (siehe Einschränkungen) |
| Persistenz | Neustart und Neuerstellung des Containers mit demselben Volume | Codes, Sitzung und Weiterleitung erhalten |
| Backup/Restore | CLI-Sicherung im Betrieb, Code löschen, Wiederherstellen bei gestopptem Dienst, Integritätsprüfung | Zustand vor der Löschung wiederhergestellt, `integrity_check: ok` |
| OIDC | Vollständiger Browser-Ablauf mit `navikt/mock-oauth2-server` (PKCE, State, Nonce), Gruppe → Administratorrolle; Übernahme eines lokalen Admin-Kontos über gleiche E-Mail | Anmeldung erfolgreich; Übernahme abgewiesen |
| Barrierefreiheit (axe-core, WCAG 2.1 AA) | 8 Seiten in hell und dunkel | **0 Verstöße** |
| Responsive Layout | 5 Seiten bei 390, 768, 1024 und 1440 px, automatische Prüfung auf horizontalen Überstand und Sichtprüfung | Kein Überstand |
| Weitere Browser | WebKit (Safari-Engine): Anmeldung, Schnelleingabe, Editor, Rahmen, Bibliothek | Ohne Fehler. **Firefox ließ sich in der Testumgebung nicht starten und ist ungetestet.** |
| Sicherheitsprüfung | Code-Review und praktische Angriffe auf eine Testinstanz | 9 Befunde (3 hoch, 3 mittel, 3 niedrig), alle behoben, mit Regressionstests abgesichert (siehe unten) |

## Simulierte Scan-Situationen

Die Lesbarkeitsprüfung in der App und die Tests lesen jeden Code unter fünf Bedingungen, jeweils in drei Maßstäben: ideal, kleine Darstellung (rund 2 bis 3 Pixel pro Modul), Unschärfe (Box-Blur), schwaches und ungleichmäßiges Licht (Kontrast gestaucht, Verlauf, Rauschen) sowie schräg gehalten (Drehung bis 22° und Scherung). Ein Decoder gilt als erfolgreich, wenn er die Mehrheit der Maßstäbe liest. Bei nur einer Auflösung schwankten die Ergebnisse von jsQR zufällig; das hat der Test aufgedeckt.

## Befunde aus der Bewertung und ihre Behebung

**Eigene Tests:** Die Bildschirmmaskierung von WLAN-Passwörtern versagte bei Sonderzeichen. „Sicher scannbar“ erschien kurz vor der eigentlichen Prüfung. Der Scanner wurde durch die CSP blockiert (fehlendes `wasm-unsafe-eval`). Enter in der Schnelleingabe kam der Erkennung zuvor. Beschriftungen wurden wegen „NaN“-Koordinaten aus opentype.js abgeschnitten. Leere JSON-Bodys wurden abgelehnt. Kuratierte Stile wurden falsch bewertet, weil nur eine Auflösung geprüft wurde. Die Oberfläche hat sich ohne `APP_URL` selbst ausgesperrt; dieser Fehler entstand durch die erste Sicherheitskorrektur und wurde vom eigenen Test gefunden.

**Sicherheitsprüfung:**
- Der Schutz des öffentlichen Hosts ließ sich umgehen. Jetzt gilt eine Allowlist mit normalisiertem Host.
- Der Server war per Rechenlast lahmzulegen. Jetzt gibt es Warteschlange, Pixelbudget, Pausen für die Event-Loop und Abbruch bei getrennter Verbindung.
- Konten ließen sich per OIDC über die E-Mail übernehmen. Jetzt ist das nur per Opt-in mit `email_verified` möglich, nie für Konten mit Passwort oder Administratorrolle.
- Die Basisadresse ließ sich über einen gefälschten Host-Header festschreiben. Das darf jetzt nur die Administration.
- Das Login-Limit ließ sich per X-Forwarded-For umgehen. Jetzt gibt es zusätzlich ein Limit pro Konto und eine korrigierte Empfehlung in der Dokumentation.
- Ohne Anmeldung war DNS-Rebinding möglich. Jetzt gilt eine Host-Allowlist.
- Backup-Kopien blieben bei Abbruch liegen. Jetzt werden sie entfernt, und der Schlüssel kann wahlweise weggelassen werden.
- Symbolnamen wie `constructor` lösten einen Fehler 500 aus.
- Das Secure-Cookie fehlte hinter einem Proxy.

**Explorativer Test:**
- Mehrdeutige Beträge wurden um den Faktor 1000 falsch übernommen.
- `+49 (0) 30` wurde falsch gewandelt.
- Eingaben gingen durch eine Race Condition beim Laden verloren.
- Rückgängig/Wiederholen lag außerhalb des Bildschirms.
- ⌘Z und ⌘A wurden in Textfeldern abgefangen.
- Der Export ignorierte die gewählte Druckbreite.
- Zu viele Daten wurden nicht verständlich gemeldet.
- Ein Ablaufdatum in der Vergangenheit und ein ungültiges Ersatzziel wurden nicht am Feld gemeldet.
- Der Scanner las keine SVG-Dateien.
- Die Befehlspalette hielt den Fokus nicht.
- Auf dem Tablet war das Layout zu breit, die Seite Serien bei 390 px.
- Vorlagen waren per Tastatur nicht erreichbar.
- Leere Formulare zeigten sofort rote Fehlermeldungen.
- Der aktive Stil war nicht erkennbar.
- Serien ließen sich doppelt speichern, Duplikate und unbekannte Platzhalter wurden nicht gemeldet.
- Ordnernamen konnten doppelt vergeben werden.
- Token wurden ohne Rückfrage widerrufen.
- Druckvorschauen waren im dunklen Modus unsichtbar.
- Es fehlte ein Sprunglink zum Inhalt, und Tastenkürzel wurden auf Windows mit „⌘“ beschriftet.
- Ein unbekanntes API-Preset wurde still ignoriert.

Bewusst nicht umgesetzt: natürliche Sortierung von Namen („Laptop 2“ vor „Laptop 10“), Datumsfelder im Gebietsschema des Browsers (Browservorgabe), Warnung bei Hostnamen ohne Domain-Endung (im Intranet legitim, deshalb nur ein Hinweis).
