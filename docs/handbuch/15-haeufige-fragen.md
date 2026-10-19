# 15 — Häufige Fragen

Hier finden Sie kurze Antworten auf Fragen, die beim Arbeiten mit Tessera
oft auftauchen. Die Links führen zu den ausführlichen Kapiteln.

## Scannen und Lesbarkeit

### Mein Code lässt sich nicht scannen. Was kann ich tun?

Gehen Sie diese Liste von oben nach unten durch:

1. **Ampel ansehen.** Öffnen Sie den Code im Editor. Steht dort nicht
   **Sicher scannbar**, zeigt Tessera die Ursache und einen Vorschlag.
   Übernehmen Sie den Vorschlag mit einem Klick
   ([Kapitel 6](06-lesbarkeit.md)).
2. **Kontrast prüfen.** Dunkle Module auf hellem Grund lesen alle Geräte.
   Helle Module auf dunklem Grund lesen nicht alle Kameras. Blasse Farben,
   Pastelltöne und Verläufe mit hellen Stellen sind häufige Ursachen.
3. **Rand frei lassen.** Um den Code muss ein heller Rand von 4 Modulen
   bleiben, die Ruhezone. Prüfen Sie, ob die Druckerei oder Ihr Layout den
   Rand abgeschnitten oder mit Text überdeckt hat.
4. **Größer drucken.** Ein Modul sollte mindestens 0,5 mm groß sein. Als
   Faustregel gilt: Code-Breite = Scan-Entfernung ÷ 10, mindestens 2 cm.
   Wer aus 1 m Entfernung scannt, braucht also mindestens 10 cm
   ([Kapitel 7](07-exportieren-drucken.md)).
5. **Logo verkleinern.** Ein großes Logo verdeckt Daten. Tessera warnt, wenn
   das Logo mehr verdeckt, als die Fehlerkorrektur ausgleichen kann.
6. **Klassische Augen wählen.** Manche Industrie- und Handscanner lesen
   stilisierte Augen (Kreis, Blatt, Facette) schlechter. Smartphones lesen
   sie in der Regel. Für maximale Kompatibilität wählen Sie den Stil
   **Klassisch** oder **Druck s/w**.
7. **Untergrund prüfen.** Glänzende Folie, unruhige Fotos oder farbiges
   Papier stören. Testen Sie den Untergrund vorher auf der Bühne im Editor.
8. **Bei dynamischen Codes: Netz prüfen.** Das scannende Smartphone muss
   Tessera erreichen. Ist Tessera nur im Firmennetz erreichbar, funktioniert
   der Code für Gäste im Mobilfunknetz nicht ([Kapitel 10](10-dynamische-codes.md)).

Tessera wurde mit vier Software-Decodern und simulierten Situationen
getestet, aber nicht mit echten Smartphones und gedruckten Exemplaren. Testen
Sie deshalb einen Probedruck mit zwei, drei verschiedenen Telefonen, bevor
Sie eine große Auflage drucken.

### Warum ist mein Code so dicht?

Je mehr Zeichen ein Code trägt, desto mehr Module braucht er. Typische
Ursachen:

- **Langer Inhalt**, zum Beispiel eine Website-Adresse mit vielen
  Parametern oder eine Visitenkarte mit vielen Feldern.
- **Logo in der Mitte.** Die Automatik wählt dann die höchste
  Fehlerkorrektur H. Das macht den Code dichter.
- **Hohe Fehlerkorrektur von Hand eingestellt.**

Abhilfe: Kürzen Sie den Inhalt, lassen Sie leere Felder weg oder machen Sie
einen **dynamischen** Code daraus. Dann enthält der Code nur einen kurzen
Link. Visitenkarten und Termine zeigt Tessera als dynamischer Code auf einer
kleinen Seite an, der Code selbst bleibt klein.

### Umlaute werden auf einem Gerät falsch angezeigt. Warum?

Tessera speichert Umlaute im üblichen Format UTF-8, wie praktisch alle
Generatoren. Aktuelle Smartphones lesen das korrekt. Sehr alte Scanner
zeigen eventuell falsche Zeichen.

## Inhalt und Lebensdauer

### Funktioniert der Code für immer?

Das hängt von der Art des Codes ab.

| Art | Funktioniert, solange … |
| --- | --- |
| **Statisch** | … das Ziel existiert. Ein WLAN-Code funktioniert, solange WLAN-Name und Passwort gleich bleiben. Ein Website-Code funktioniert, solange die Website erreichbar ist. Tessera selbst wird dafür nicht gebraucht. |
| **Dynamisch** | … Tessera läuft, unter der Kurzlink-Adresse erreichbar ist und der Code weder pausiert noch abgelaufen ist. |

### Kann ich den Inhalt nach dem Druck ändern?

Nur bei einem **dynamischen** Code. Dort ändern Sie das Ziel im Editor und
speichern. Der gedruckte Code führt danach sofort zum neuen Ziel
([Kapitel 10](10-dynamische-codes.md)).

Bei einem **statischen** Code steht der Inhalt fest im Muster. Ändert sich
der Inhalt, brauchen Sie einen neuen Code und einen neuen Druck.

Entscheiden Sie deshalb vor dem Druck, welche Art Sie brauchen. Eine
Entscheidungshilfe finden Sie in [Kapitel 1](01-was-ist-tessera.md).

### Warum kann ich „Dynamisch“ nicht auswählen?

Dafür gibt es zwei Gründe:

- **Der Inhaltstyp erlaubt es nicht.** WLAN, Text, Anruf, E-Mail, SMS,
  GiroCode, Bitcoin und Eigene Daten müssen ihren Inhalt direkt enthalten.
- **Die Basisadresse fehlt.** Ist weder in den Einstellungen noch über
  `PUBLIC_BASE_URL` oder `APP_URL` eine Adresse für Kurzlinks festgelegt,
  muss die Administration sie zuerst festlegen. Bis dahin lässt sich ein
  Code mit der Rolle **Bearbeiten** nicht als dynamischer Code speichern.

### Was sehen Scannende, wenn ein dynamischer Code pausiert oder abgelaufen ist?

Tessera zeigt eine kurze Seite: „Dieser Code ist pausiert“ bzw. „Dieser Code
ist abgelaufen“. Haben Sie ein **Ersatzziel** hinterlegt, leitet Tessera
stattdessen dorthin weiter.

### Was passiert, wenn der Server aus ist?

- **Statische Codes** funktionieren weiter. Sie brauchen Tessera nicht.
- **Dynamische Codes** funktionieren nicht. Das Smartphone erreicht die
  Weiterleitung nicht und zeigt eine Fehlermeldung des Browsers. Auch ein
  Ersatzziel hilft dann nicht, denn es wird ebenfalls von Tessera
  ausgeliefert.
- Die Oberfläche ist nicht erreichbar. Ihre Daten bleiben erhalten und sind
  nach dem Neustart wieder da.

Wenn Sie Tessera auf dem eigenen Mac oder PC betreiben, ist der Rechner der
Server. Für dynamische Codes auf Flyern oder Plakaten eignet sich deshalb nur
ein Server, der dauerhaft läuft.

## Sicherheit und Datenschutz

### Sind WLAN-Passwörter sicher?

In Tessera ja. Tessera speichert WLAN-Passwörter und IBANs mit AES-256
verschlüsselt. Sie erscheinen nie in Protokollen, Übersichten oder den
CSV-Übersichten von Serien. Mit dem Schalter **Vertrauliche Felder
speichern** legen Sie fest, ob Tessera das Passwort überhaupt speichert.
Schalten Sie ihn aus, müssen Sie das Passwort beim nächsten Öffnen erneut
eingeben.

Beachten Sie aber: **Der QR-Code selbst enthält das Passwort lesbar.** Wer
den Code scannt oder fotografiert, kennt das Passwort. Hängen Sie WLAN-Codes
deshalb nur dort aus, wo alle Betrachtenden das Netz nutzen dürfen, zum
Beispiel für ein Gäste-WLAN.

### Zählt Tessera, wer meinen Code scannt?

Nein. Die Statistik ist standardmäßig ausgeschaltet. Wenn die
Administration sie erlaubt und Sie **Scans zählen** einschalten, zählt
Tessera nur die Zahl der Scans pro Tag, den Gerätetyp (Smartphone oder
Computer) und den Zeitpunkt des letzten Scans. IP-Adressen, Cookies,
vollständige Browserkennungen und Standorte speichert Tessera nie. Bots,
Linkvorschauen sowie Geräte mit „Do Not Track“ oder GPC zählt Tessera nicht
mit ([Kapitel 10](10-dynamische-codes.md)).

### Sendet Tessera Daten ins Internet?

Nein. Tessera hat keine Telemetrie und lädt keine Schriften oder Programme
von fremden Servern. Ins Internet gelangt nur, was Sie selbst veröffentlichen,
zum Beispiel eine öffentliche Kurzlink-Adresse, die Ihre IT einrichtet.

## Bedienung

### Ich habe einen Code versehentlich gelöscht.

Gelöschte Codes landen im **Papierkorb** der Bibliothek. Dort stellen Sie
sie wieder her ([Kapitel 8](08-bibliothek.md)). Der Papierkorb leert sich
nicht von selbst.

Solange ein dynamischer Code im Papierkorb liegt, zeigen gedruckte
Exemplare die Seite „Diesen Code gibt es nicht“. Ein Ersatzziel greift
dann nicht. Stellen Sie den Code wieder her, funktioniert er wieder.

### Welches Dateiformat brauche ich?

| Zweck | Format |
| --- | --- |
| Word, PowerPoint, E-Mail, Website | **PNG** |
| Druckerei, Grafikprogramm, beliebig vergrößern | **PDF** oder **SVG** |
| Schnell in ein anderes Programm einfügen | **Als Bild kopieren** |

PDF-Exporte verwenden RGB-Farben. Braucht die Druckerei CMYK oder
Sonderfarben, konvertiert sie die Datei. Details in
[Kapitel 7](07-exportieren-drucken.md).

### Die Kamera im Scanner startet nicht.

Browser erlauben die Kamera nur über eine sichere Verbindung (HTTPS) oder
unter `localhost`. Läuft Tessera im Firmennetz über reines HTTP, laden Sie
stattdessen ein Foto oder einen Screenshot hoch
([Kapitel 11](11-scanner.md)). Für HTTPS wenden Sie sich an Ihre IT.

### Ich habe mein Passwort vergessen.

Wenden Sie sich an die Administration. Sie kann Ihr Passwort zurücksetzen
([Kapitel 12](12-benutzer-und-anmeldung.md#konten-verwalten-administration)).
Melden Sie sich über das Firmenkonto an, ist Ihre IT zuständig.

### Wo finde ich die Tastenkürzel?

| Kürzel | Wirkung |
| --- | --- |
| ⌘K bzw. Strg+K | Befehlspalette öffnen |
| ⌘S bzw. Strg+S | Speichern (im Editor) |
| ⌘E bzw. Strg+E | Exportieren (im Editor) |
| ⌘Z bzw. Strg+Z | Rückgängig (im Editor) |
| ⇧⌘Z bzw. Umschalt+Strg+Z | Wiederholen (im Editor) |
| N | Neuer Code (nicht mit der Rolle **Nur ansehen**) |
| / | Suchfeld der Bibliothek |
| ⌘A bzw. Strg+A | Alle Codes der Bibliothek auswählen |
| Esc | Auswahl in der Bibliothek aufheben |

---

← [14 — Sicherung und Betrieb (IT)](14-sicherung-und-betrieb.md) | [Inhalt](README.md)
