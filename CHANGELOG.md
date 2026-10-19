# Änderungsprotokoll

Alle nennenswerten Änderungen an Tessera. Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [1.0.0] – 2026-10-19

Erste Veröffentlichung.

### Funktionen
- 18 Inhaltstypen, standardkonform kodiert: Website (mit UTM), vCard 3.0/4.0 und MECARD, WLAN (inkl. WPA2-Enterprise), Anruf, E-Mail, SMS, WhatsApp, Standort, Termin (iCalendar mit Zeitzone), Terminbuchung, Social Media, App-Links, Dokumente, GiroCode (EPC069-12), PayPal.Me, Bitcoin (BIP 21), Text, eigene Daten
- Schnelleingabe mit automatischer Erkennung des Inhaltstyps
- Designstudio: Formen, Ecken, Farben und Verläufe, Symbole und eigene Logos, Rahmen mit Beschriftung, Stile, Vorlagen, Rückgängig/Wiederholen
- Lesbarkeitsprüfung bei jeder Änderung: Regelprüfung plus Testscans mit ZXing-C++ und jsQR unter fünf simulierten Bedingungen; Export-Sperre für voraussichtlich unlesbare Codes
- Export als PNG (mit DPI), SVG (in mm) und PDF (Vektor, optional mit Beschnitt und Schnittmarken)
- Bibliothek mit Ordnern, Schlagwörtern, Favoriten, Suche, Sammelaktionen und Papierkorb
- Serien aus CSV, Excel oder eingefügten Tabellen, als ZIP, Etikettenbogen oder in die Bibliothek
- Dynamische Codes mit eigener Weiterleitung, Ablaufdatum, Ersatzziel, Verlauf und anonymer Statistik (standardmäßig aus)
- Scanner für vorhandene Codes aus Bildern oder per Kamera
- Lokale Konten mit Rollen, OIDC (z. B. authentik), API-Tokens und REST-Schnittstelle
- Docker-Image für amd64 und arm64, Healthcheck, Backup und Restore per Oberfläche oder Kommandozeile
