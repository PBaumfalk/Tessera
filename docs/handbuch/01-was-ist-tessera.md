# 1 — Was ist Tessera?

Tessera ist ein QR-Code-Studio, das auf Ihrem eigenen Rechner oder auf dem
Server Ihrer Firma läuft. Sie bedienen es im Browser. Sie erstellen damit
QR-Codes, gestalten sie, prüfen ihre Lesbarkeit und verwalten sie an einem
Ort. Kein Code und keine Eingabe verlässt dabei Ihr Netz.

*Tessera* heißt das einzelne Steinchen eines Mosaiks. Ein QR-Code ist genau
das: ein Mosaik aus kleinen Quadraten.

Dieses Kapitel erklärt die wichtigsten Begriffe. Sie brauchen sie, um die
Hinweise in Tessera zu verstehen.

## Was Sie mit Tessera tun können

| Aufgabe | Beispiel | Kapitel |
| --- | --- | --- |
| Einen Code erstellen | Link zur Kanzlei-Website, WLAN-Zugang für Gäste, Visitenkarte, Überweisung per GiroCode | [3](03-erster-code.md), [4](04-inhaltstypen.md) |
| Den Code gestalten | Hausfarbe, Logo in der Mitte, Rahmen mit Beschriftung | [5](05-gestalten.md) |
| Die Lesbarkeit prüfen | Tessera testet jeden Code automatisch und schlägt Verbesserungen vor | [6](06-lesbarkeit.md) |
| Exportieren und drucken | PNG für Word und E-Mail, PDF oder SVG für die Druckerei | [7](07-exportieren-drucken.md) |
| Codes verwalten | Ordner, Schlagwörter, Suche, Papierkorb | [8](08-bibliothek.md) |
| Viele Codes auf einmal | Inventaretiketten aus einer Excel-Tabelle | [9](09-serien.md) |
| Ziel nachträglich ändern | Flyer ist gedruckt, die Zielseite ändert sich | [10](10-dynamische-codes.md) |
| Vorhandene Codes lesen | Code aus einem Foto oder Screenshot übernehmen | [11](11-scanner.md) |

## Grundbegriffe

### QR-Code

Ein QR-Code speichert Text in einem Muster aus hellen und dunklen
Quadraten. Eine Smartphone-Kamera liest dieses Muster und zeigt den Inhalt
an: Sie öffnet eine Website, speichert einen Kontakt oder verbindet sich mit
einem WLAN. Ein QR-Code ist nur ein Behälter. Was er tut, hängt vom Inhalt
ab. Deshalb wählen Sie in Tessera zuerst einen **Inhaltstyp**
([Kapitel 4](04-inhaltstypen.md)).

### Modul

Ein **Modul** ist ein einzelnes Quadrat im Code, das kleinste Steinchen des
Mosaiks. Je mehr Inhalt ein Code trägt, desto mehr Module braucht er. Tessera
zeigt die Größe als „Module × Module“ an, zum Beispiel „33 × 33 Module“.

Wichtig für den Druck: Ein Modul sollte mindestens **0,5 mm** groß sein.
Darunter warnt Tessera. Viele Module auf kleiner Fläche ergeben winzige
Module, und die Kamera erkennt sie schlechter.

### Augen

Die drei großen Quadrate in den Ecken heißen **Augen**. An ihnen erkennt die
Kamera, dass es sich um einen QR-Code handelt und wie er liegt. Tessera
erlaubt verschiedene Augenformen. Klassische, quadratische Augen lesen alle
Geräte am zuverlässigsten.

### Ruhezone

Die **Ruhezone** ist der leere, helle Rand um den Code. Die Kamera braucht
ihn, um den Code vom Hintergrund zu trennen. Der Standard verlangt einen Rand
von **4 Modulen**. Tessera stellt ihn standardmäßig so ein und warnt, wenn
Sie ihn verkleinern. Schneiden Sie diesen Rand beim Drucken nicht ab und
setzen Sie keinen Text oder Rahmen direkt an den Code.

### Fehlerkorrektur

Ein QR-Code enthält Reserven. Ist ein Teil verdeckt oder verschmutzt, kann
die Kamera den Inhalt trotzdem rekonstruieren. Wie viel Reserve der Code hat,
bestimmt die **Fehlerkorrektur**:

| Stufe | Gleicht ungefähr aus | Typischer Einsatz |
| --- | --- | --- |
| L | 7 % | Sehr viel Inhalt, ungestalteter Code, sauberer Untergrund |
| M | 15 % | Klassischer, schwarz-weißer Code |
| Q | 25 % | Gestaltete Formen (runde Module, Punkte) |
| H | 30 % | Code mit Logo in der Mitte |

Mehr Fehlerkorrektur macht den Code dichter, er braucht also mehr Module. In
Tessera steht die Fehlerkorrektur auf **Auto**. Die Automatik wählt H, wenn
Sie ein Logo einsetzen, Q für gestaltete Formen und M für klassische Codes.
Sie müssen daran in der Regel nichts ändern.

### Lesbarkeit

Tessera prüft jeden Code bei jeder Änderung. Eine Ampel zeigt das Ergebnis:
**Sicher scannbar**, **Scannbar, mit Einschränkungen** oder
**Wahrscheinlich nicht lesbar**. Zu jedem Problem gibt es einen Vorschlag,
den Sie mit einem Klick übernehmen. Mehr dazu in
[Kapitel 6](06-lesbarkeit.md).

## Statisch oder dynamisch?

Vor dem ersten Speichern entscheiden Sie im Editor unter **Art des Codes**,
wie der Code funktioniert.

- **Statisch:** Der Inhalt steht direkt im Code. Tessera beschreibt das so:
  „Inhalt steht im Code. Funktioniert für immer, ohne Server.“ Den Inhalt
  können Sie nach dem Druck nicht mehr ändern.
- **Dynamisch:** Der Code enthält nur einen kurzen Link zu Tessera, zum
  Beispiel `https://go.firma.de/r/k3Fq9xA`. Beim Scannen leitet Tessera
  zum eigentlichen Ziel weiter. Das Ziel können Sie jederzeit ändern, auch
  nach dem Druck. Dafür muss Tessera erreichbar sein, wenn jemand scannt.

### Entscheidungshilfe

| Ihre Situation | Empfehlung |
| --- | --- |
| WLAN-Zugang, Telefonnummer, E-Mail, SMS, GiroCode | **Statisch** (dynamisch ist für diese Typen nicht möglich) |
| Der Code soll ohne Ihren Server funktionieren, auch in zehn Jahren | **Statisch** |
| Gedruckte Flyer, Plakate oder Verpackungen, deren Ziel sich ändern könnte | **Dynamisch** |
| Der Inhalt ist lang und der Code wird zu dicht | **Dynamisch** (der Kurzlink hält den Code klein) |
| Sie möchten wissen, wie oft gescannt wird | **Dynamisch** mit **Scans zählen**, sofern die Administration das erlaubt |
| Visitenkarte oder Termin mit vielen Angaben | **Dynamisch**: Tessera zeigt beim Scannen eine kleine Seite mit „Kontakt speichern“ bzw. „In den Kalender eintragen“ |
| Die Scannenden sind außerhalb Ihres Firmennetzes, Tessera ist aber nur intern erreichbar | **Statisch**, oder die IT richtet eine öffentliche Kurzlink-Adresse ein ([Kapitel 10](10-dynamische-codes.md)) |

Dynamisch möglich sind: Website, Visitenkarte, WhatsApp, Standort, Termin,
Terminbuchung, Social Media, App, Dokument und PayPal. Alle anderen Typen
müssen ihren Inhalt direkt enthalten.

Ein einmal gespeicherter dynamischer Code bleibt dynamisch. So funktionieren
bereits gedruckte Exemplare weiter.

## Wo liegen die Daten?

Alle Daten liegen auf dem Rechner oder Server, auf dem Tessera läuft, in
einem einzigen Datenverzeichnis:

| Was | Wo |
| --- | --- |
| Codes, Ordner, Vorlagen, Konten, Einstellungen, Statistik | Datenbankdatei `tessera.db` |
| Hochgeladene Dateien für Dokument-Codes | Ordner `files/` |
| Schlüssel für vertrauliche Felder | Datei `secret.key` |
| Automatische Sicherungen | Ordner `backups/` |

Bei der Installation mit Docker heißt dieser Speicherort `tessera-data`.
Er bleibt erhalten, wenn Sie Tessera neu starten oder aktualisieren.

Weitere Grundsätze:

- Tessera ruft keine externen Dienste auf, auch keine Schriften aus dem
  Internet, und sendet keine Telemetrie.
- WLAN-Passwörter und IBANs speichert Tessera verschlüsselt. Mit dem
  Schalter **Vertrauliche Felder speichern** legen Sie fest, ob Tessera sie
  überhaupt speichert.
- Die Scan-Statistik ist standardmäßig ausgeschaltet. Ist sie erlaubt,
  zählt Tessera nur Scans pro Tag und den Gerätetyp, keine IP-Adressen und
  keine Cookies ([Kapitel 10](10-dynamische-codes.md)).
- Die Sicherung der Daten beschreibt [Kapitel 14](14-sicherung-und-betrieb.md).

---

← [Inhalt](README.md) | [2 — Installation](02-installation.md) →
