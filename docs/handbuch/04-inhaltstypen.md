# 4 — Inhaltstypen

Tessera kennt 18 Inhaltstypen. Jeder Typ hat ein eigenes Formular und wird
nach dem passenden Standard kodiert. Dieses Kapitel beschreibt für jeden Typ,
wofür er gedacht ist, welche Felder Pflicht sind und worauf Sie achten
sollten.

Den Typ wählen Sie auf der Startseite oder im Editor über das Typfeld oben
links (siehe [Kapitel 3](03-erster-code.md)). Selten benötigte Felder finden
Sie unter **Weitere Felder (…)**.

## Übersicht

| Gruppe | Typ | Wofür | Dynamisch möglich |
| --- | --- | --- | --- |
| Links | [Website](#website) | Webseite oder Link öffnen | ja |
| Links | [Social Media](#social-media) | Profil auf Instagram, LinkedIn & Co. | ja |
| Links | [App](#app) | App Store oder Google Play | ja, mit Geräteerkennung |
| Links | [Dokument](#dokument) | PDF, Anleitung, Speisekarte | ja, auch mit Datei-Upload |
| Kontakt | [Visitenkarte](#visitenkarte) | Kontakt ins Adressbuch | ja, als gehostete Seite |
| Kontakt | [Anruf](#anruf) | Telefonnummer wählen | nein |
| Kontakt | [E-Mail](#e-mail) | Vorbereitete E-Mail | nein |
| Kontakt | [SMS](#sms) | Vorbereitete Kurznachricht | nein |
| Kontakt | [WhatsApp](#whatsapp) | Chat mit vorbereitetem Text | ja |
| Ort & Termin | [Standort](#standort) | Ort auf der Karte | ja |
| Ort & Termin | [Termin](#termin) | Eintrag in den Kalender | ja, als gehostete Seite |
| Ort & Termin | [Terminbuchung](#terminbuchung) | Buchungsseite öffnen | ja |
| Netzwerk | [WLAN](#wlan) | Ins WLAN einloggen ohne Abtippen | nein |
| Zahlung | [GiroCode](#girocode) | SEPA-Überweisung per Banking-App | nein |
| Zahlung | [PayPal](#paypal) | PayPal.Me mit Betrag | ja |
| Zahlung | [Bitcoin](#bitcoin) | Zahlungsanforderung | nein |
| Text & Daten | [Text](#text) | Beliebigen Text anzeigen | nein |
| Text & Daten | [Eigene Daten](#eigene-daten) | Rohdaten, z. B. Inventarnummern | nein |

„Dynamisch möglich: nein“ heißt: Der Inhalt muss im Code selbst stehen.
Unter **Art des Codes** ist **Dynamisch** dann ausgegraut mit dem Hinweis
**Für diesen Typ nicht möglich.** Zu dynamischen Codes siehe
[Kapitel 10](10-dynamische-codes.md).

## Allgemeine Eingaberegeln

**Webadressen** dürfen Sie ohne `https://` eingeben. Aus `beispiel.de/seite`
wird `https://beispiel.de/seite`. Tessera warnt bei unverschlüsselten
Adressen (`http://`) und bei Namen ohne Domain-Endung, etwa `intranet`. Solche
Adressen funktionieren nur auf Geräten, die den Namen kennen.

**Telefonnummern** geben Sie am besten mit Ländervorwahl ein, also
`+49 30 1234567` statt `030 1234567`. Ohne Ländervorwahl gibt Tessera nur
einen Tipp, bei WhatsApp ist sie Pflicht. Leerzeichen, Klammern, Schrägstriche
und Bindestriche entfernt Tessera. Die „(0)“ in `+49 (0) 30 …` fällt
automatisch weg.

**Umlaute** kodiert Tessera als UTF-8. Aktuelle Smartphones lesen das korrekt.
Sehr alte Scanner zeigen eventuell falsche Zeichen (siehe
[Bekannte Einschränkungen](../einschraenkungen.md)).

**Vertrauliche Felder** (WLAN-Passwort, IBAN) werden verschlüsselt
gespeichert. Mit dem Schalter **Vertrauliche Felder speichern** unter dem
Formular können Sie das Speichern ganz abschalten. Dann müssen Sie den Wert
beim nächsten Öffnen erneut eingeben, bevor Sie exportieren.

---

## Links

### Website

Öffnet eine Webseite oder einen beliebigen Link.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Webadresse** | ja | z. B. `beispiel.de/angebot` |
| **Kampagnen-Quelle (utm_source)** | nein | unter Weitere Felder, z. B. `flyer` |
| **Medium (utm_medium)** | nein | unter Weitere Felder, z. B. `print` |
| **Kampagne (utm_campaign)** | nein | unter Weitere Felder, z. B. `herbst-2026` |

Tipp: Mit den UTM-Feldern erkennt Ihre Webanalyse, dass Besucher über den
gedruckten Code kamen. Tessera hängt die Werte an die Adresse an. Der Code
wird dadurch etwas dichter.

### Social Media

Führt zu einem Profil. Wählen Sie unter **Plattform** eine von 16 Plattformen:
Instagram, LinkedIn (Person), LinkedIn (Unternehmen), XING, Facebook,
X (Twitter), Threads, Bluesky, Mastodon, TikTok, YouTube, GitHub, Pinterest,
Twitch, Telegram, Snapchat.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Plattform** | ja | Auswahl |
| **Profil** | ja | Benutzername genügt. Ein kompletter Profil-Link funktioniert auch. |

Tipps:
- Ein führendes `@` entfernt Tessera.
- Benutzernamen enthalten keine Leerzeichen.
- Mastodon-Profile haben die Form `name@instanz.social`. Ohne Instanz nimmt
  Tessera `mastodon.social` an.

### App

Führt in den App Store oder zu Google Play.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **App Store (iPhone, iPad)** | mindestens ein Link | Link zu `apps.apple.com` |
| **Google Play (Android)** | | Link zu `play.google.com` |
| **Für alle anderen Geräte** | | z. B. die Website der App |
| **Statischer Code führt zu** | | **App Store**, **Google Play** oder **Website** |

Ein statischer Code kann nur ein Ziel haben. Als dynamischer Code erkennt
Tessera beim Scannen das Gerät und öffnet den passenden Store. Wer beide
Stores bedienen will, wählt also **Dynamisch**.

### Dokument

Verlinkt ein PDF, eine Anleitung oder eine Speisekarte.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Quelle** | ja | **Link zu einem Dokument** oder **Datei in Tessera ablegen (dynamischer Code)** |
| **Link zum Dokument** | bei Quelle Link | z. B. `intranet.firma.de/handbuch.pdf` |
| **Titel** | nein | z. B. „Bedienungsanleitung“ |

Bei **Datei in Tessera ablegen** ziehen Sie die Datei auf das Feld **Datei
ablegen oder auswählen** (PDF, Bilder, Office-Dokumente). Tessera richtet
beim Speichern automatisch einen dynamischen Code ein. Die erlaubte
Dateigröße legt die IT fest (Standard 25 MB). Details in
[Kapitel 10](10-dynamische-codes.md).

---

## Kontakt

### Visitenkarte

Speichert einen Kontakt direkt im Adressbuch des Smartphones.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Vorname**, **Nachname**, **Firma** | mindestens eines davon | |
| **Position**, **Mobil**, **Telefon geschäftlich**, **E-Mail**, **Website** | nein | |
| **Straße und Hausnummer**, **PLZ**, **Ort**, **Land** | nein | unter Weitere Felder |
| **Fax**, **Abteilung**, **Notiz** | nein | unter Weitere Felder |
| **Format** | nein | unter Weitere Felder, siehe unten |

| Format | Eigenschaft |
| --- | --- |
| **vCard 3.0 – beste Kompatibilität** | Standard, für die meisten Fälle richtig |
| **vCard 4.0 – aktueller Standard** | neuere Fassung (RFC 6350) |
| **MECARD – kompakt, weniger Felder** | kleinerer Code, aber ohne Position und Fax |

Tipp: Eine vollständige Visitenkarte ergibt einen dichten Code. Als
dynamischer Code hostet Tessera die Daten auf einer kleinen Seite mit
**Kontakt speichern**. Der gedruckte Code bleibt dann klein und gut lesbar.

### Anruf

Wählt eine Telefonnummer.

| Feld | Pflicht |
| --- | --- |
| **Telefonnummer** | ja |

Der Code enthält einen `tel:`-Link.

### E-Mail

Öffnet eine vorbereitete E-Mail.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Empfänger** | ja | z. B. `kontakt@firma.de` |
| **Betreff**, **Nachricht** | nein | |
| **Kopie an (CC)** | nein | unter Weitere Felder |
| **Format** | nein | unter Weitere Felder: **mailto: – Standard (RFC 6068)** oder **MATMSG – für ältere Scanner** |

Bleiben Sie beim Standard `mailto:`, wenn kein besonderer Grund dagegen
spricht.

### SMS

Bereitet eine Kurznachricht vor.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Empfänger** | ja | Telefonnummer |
| **Nachricht** | nein | Tessera zählt die Zeichen mit (Anzeige „…/160“, Länge einer SMS). Längere Texte lehnt Tessera nicht ab. |
| **Format** | nein | unter Weitere Felder: **SMSTO – breite Unterstützung** (Standard) oder **sms: – URI nach RFC 5724** |

### WhatsApp

Startet einen WhatsApp-Chat mit vorbereitetem Text.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Telefonnummer mit Ländervorwahl** | ja | z. B. `+49 171 1234567`. Ohne Ländervorwahl lehnt Tessera die Nummer ab. |
| **Vorbereitete Nachricht** | nein | |

Der Code enthält einen `wa.me`-Link.

---

## Ort & Termin

### Standort

Zeigt einen Ort auf der Karte.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Ort angeben als** | ja | **Koordinaten** oder **Adresse** |
| **Breitengrad**, **Längengrad** | bei Koordinaten | z. B. `52.5163` und `13.3777`; Komma oder Punkt |
| **Adresse** | bei Adresse | z. B. „Pariser Platz 1, 10117 Berlin“ |
| **Bezeichnung** | nein | z. B. „Haupteingang“ |
| **Öffnen mit** | nein | siehe unten |

| Öffnen mit | Wirkung |
| --- | --- |
| **Google Maps (alle Geräte)** | Standard, funktioniert auf iPhone und Android |
| **Apple Karten** | für Apple-Geräte |
| **OpenStreetMap** | freie Karte |
| **geo:-URI (Standard-Karten-App)** | öffnet die Karten-App des Geräts. Mit Adresse versteht das nicht jede App. |

Tipp: Fügen Sie einen Google-Maps- oder OpenStreetMap-Link in das Feld
**Breitengrad** ein. Tessera übernimmt die Koordinaten automatisch und meldet
„Koordinaten aus dem Link übernommen“.

### Termin

Trägt eine Veranstaltung in den Kalender ein (iCalendar-Format, RFC 5545).

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Titel** | ja | z. B. „Tag der offenen Tür“ |
| **Ganztägig** | nein | Schalter; dann nur Datum ohne Uhrzeit |
| **Beginn** | ja | |
| **Ende** | nein | ohne Angabe dauert der Termin eine Stunde. Das Ende darf nicht vor dem Beginn liegen. |
| **Ort** | nein | |
| **Beschreibung**, **Link zur Veranstaltung** | nein | unter Weitere Felder |
| **Zeitzone** | nein | unter Weitere Felder, Standard `Europe/Berlin` |

Die Uhrzeit geben Sie so ein, wie sie am Veranstaltungsort gilt. Tessera
rechnet sie mithilfe der **Zeitzone** in Weltzeit (UTC) um. Dadurch zeigt
jedes Gerät die richtige Uhrzeit, auch bei Gästen aus anderen Zeitzonen und
über die Sommerzeitumstellung hinweg. Die Zeitzone ist ein Name wie
`Europe/Berlin` oder `America/New_York`. Unbekannte Namen lehnt Tessera ab.

Tipp: Als dynamischer Code hostet Tessera den Termin auf einer kleinen Seite
mit **In den Kalender eintragen**. Der Code bleibt dann klein.

### Terminbuchung

Führt zu einer Buchungsseite, zum Beispiel für Sprechstunden.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Dienst** | nein | **Beliebige Buchungsseite**, **Calendly**, **Cal.com**, **Microsoft Bookings**, **Doctolib** |
| **Link zur Buchungsseite** | ja | z. B. `calendly.com/name/30min` |

Passt der Link nicht zum gewählten Dienst, fragt Tessera nach: „Stimmt der
Dienst?“

---

## Netzwerk

### WLAN

Verbindet Smartphones mit dem WLAN, ohne dass jemand das Passwort abtippt.
Typischer Einsatz: Aushang für das Gäste-WLAN am Empfang.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Netzwerkname (SSID)** | ja | höchstens 32 Zeichen, genau wie im Router |
| **Verschlüsselung** | ja | siehe unten |
| **Passwort** | bei WPA und WEP | WPA-Passwörter haben 8 bis 63 Zeichen |
| **EAP-Methode**, **Benutzername** | nur bei Enterprise | |
| **Verstecktes Netzwerk** | nein | unter Weitere Felder. Nur aktivieren, wenn die SSID nicht öffentlich sichtbar ist. |

| Verschlüsselung | Hinweis |
| --- | --- |
| **WPA2 / WPA3 (empfohlen)** | Standard für fast alle Router |
| **WEP (veraltet)** | Tessera warnt: WEP gilt als unsicher |
| **Offen, ohne Passwort** | kein Passwortfeld |
| **WPA2-Enterprise (802.1X)** | mit **EAP-Methode** (PEAP, TTLS, TLS, PWD) und **Benutzername** |

**Enterprise-WLAN:** Nur Android richtet ein Enterprise-WLAN zuverlässig per
QR-Code ein. Tessera weist darauf hin. Für Firmen-WLANs mit Anmeldung pro
Person ist ein QR-Code daher meist nicht der richtige Weg.

**Passwort:** Tessera speichert das WLAN-Passwort verschlüsselt (AES-256) und
schreibt es nie in Protokolle oder Übersichten. Mit **Vertrauliche Felder
speichern** schalten Sie das Speichern ab. Dann erscheint beim nächsten
Öffnen der Hinweis „Das Passwort wurde bei diesem Code nicht gespeichert. Gib
es erneut ein, um den Code zu exportieren.“

Beachten Sie: Im gedruckten Code steht das Passwort lesbar. Wer den Code
scannt, kennt das Passwort.

WLAN-Codes sind immer statisch.

---

## Zahlung

### GiroCode

SEPA-Überweisung für Banking-Apps. Tessera kodiert nach dem Standard
EPC069-12 (EPC-QR, Version 002). Geeignet für Rechnungen: Der Zahlende scannt
den Code in seiner Banking-App, Empfänger, IBAN, Betrag und Verwendungszweck
sind ausgefüllt.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Empfänger** | ja | höchstens 70 Zeichen |
| **IBAN** | ja | Tessera prüft Länderkennung, Länge und Prüfziffer |
| **Betrag in Euro** | nein | siehe unten. Ohne Betrag trägt der Zahlende ihn selbst ein. |
| **Verwendungszweck** | nein | höchstens 140 Zeichen, z. B. „Rechnung 2026-0815“ |
| **BIC** | nein | unter Weitere Felder. Innerhalb des EWR nicht erforderlich. 8 oder 11 Zeichen. |
| **Strukturierte Referenz (RF)** | nein | unter Weitere Felder. Ersetzt den Verwendungszweck. Tessera prüft die Prüfziffer. |
| **Zweckcode** | nein | unter Weitere Felder. Vier Buchstaben, z. B. `GDDS` |
| **Hinweis an Zahlende** | nein | unter Weitere Felder. Höchstens 70 Zeichen |

**Beträge eindeutig eingeben.** Das Komma ist das Dezimaltrennzeichen.

| Eingabe | Ergebnis |
| --- | --- |
| `49,90` | 49,90 € |
| `1.249,90` | 1.249,90 € |
| `1249,90` oder `1249` | 1.249,90 € bzw. 1.249,00 € |
| `1.000,00` | 1.000,00 € |
| `49.90` | 49,90 € (ein einzelner Punkt gilt als Dezimaltrennzeichen) |
| `12,345` | **abgelehnt**: mehr als zwei Nachkommastellen |
| `1.249` | **abgelehnt**: mehrdeutig. Schreiben Sie `1249` oder `1.249,00`. |

Tessera lehnt mehrdeutige Angaben bewusst ab, statt zu raten. Sonst könnte
aus „12,345“ unbemerkt ein Betrag von 12.345 € werden. Erlaubt sind Beträge
von 0,01 bis 999.999.999,99 €. Tausenderpunkte müssen in Dreiergruppen
stehen.

Weitere Hinweise:
- Die IBAN dürfen Sie mit oder ohne Leerzeichen eingeben. Tessera formatiert
  sie in Vierergruppen.
- Mit RF-Referenz wird der Verwendungszweck nicht übertragen. Tessera warnt,
  wenn beides ausgefüllt ist.
- Ein GiroCode darf höchstens 331 Byte enthalten. Ist er zu lang, kürzen Sie
  Verwendungszweck oder Hinweis.
- Tessera verwendet für GiroCodes mindestens die Fehlerkorrektur M, wie der
  Standard es verlangt.
- Die IBAN wird wie das WLAN-Passwort verschlüsselt gespeichert.

GiroCodes sind immer statisch.

### PayPal

Öffnet PayPal.Me mit einem vorbelegten Betrag.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **PayPal.Me-Name** | ja | bis zu 20 Buchstaben und Ziffern. Ein `paypal.me`-Link funktioniert auch. |
| **Betrag** | nein | höchstens zwei Nachkommastellen, z. B. `10` oder `9,50` |
| **Währung** | nein | **Euro**, **US-Dollar**, **Franken**, **Pfund** |

### Bitcoin

Zahlungsanforderung nach BIP 21.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Bitcoin-Adresse** | ja | Tessera prüft das Format (`bc1…`, `1…`, `3…`) |
| **Betrag in BTC** | nein | höchstens acht Nachkommastellen, z. B. `0.0015` |
| **Empfänger** | nein | |
| **Nachricht** | nein | unter Weitere Felder |

---

## Text & Daten

### Text

Zeigt einen beliebigen Text an. Das Smartphone zeigt den Text nach dem Scannen
nur an, es führt keine Aktion aus.

| Feld | Pflicht |
| --- | --- |
| **Text** | ja |

Tipp: Je länger der Text, desto dichter der Code. Für längere Inhalte ist ein
Dokument oder eine Website meist besser.

### Eigene Daten

Beliebiger Inhalt, exakt so kodiert, wie Sie ihn eingeben. Geeignet für
Inventarnummern, Seriennummern oder Codes für Lager- und Maschinensysteme.

| Feld | Pflicht | Hinweis |
| --- | --- | --- |
| **Inhalt** | ja | z. B. `INV-2026-000123` |
| **Escape-Sequenzen auswerten (\n, \t, \x1D)** | nein | unter Weitere Felder |

Mit dem Schalter **Escape-Sequenzen auswerten** wandelt Tessera `\n`
(Zeilenumbruch), `\r`, `\t` (Tabulator), `\\` und `\xHH` (Zeichen mit
Hex-Code, z. B. `\x1D` als Gruppentrenner) in Steuerzeichen um. Das brauchen
GS1-Daten, Lagerverwaltung und Maschinencodes, die Steuerzeichen erwarten.
Ohne den Schalter bleibt der Inhalt Zeichen für Zeichen, wie er ist.

Für viele Inventaretiketten auf einmal nutzen Sie die Serien
([Kapitel 9](09-serien.md)).

---

← [3 — Der erste Code](03-erster-code.md) | [Inhalt](README.md) | [5 — Gestalten](05-gestalten.md) →
