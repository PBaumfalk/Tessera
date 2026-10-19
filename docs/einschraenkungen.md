# Bekannte Einschränkungen

Ehrlich festgehalten, was nicht oder nur eingeschränkt getestet ist bzw. bewusst nicht umgesetzt wurde.

## Nicht mit echter Infrastruktur getestet

- **authentik:** Der OIDC-Ablauf wurde vollständig gegen den Testanbieter `navikt/mock-oauth2-server` geprüft (PKCE, State, Nonce, Benutzerkonto anlegen, Gruppe → Administratorrolle). Gegen eine echte authentik-Instanz wurde Tessera nicht getestet. Abweichungen kann es vor allem beim Namen des Gruppen-Claims geben. Tessera erwartet `groups` als Liste.
- **Öffentlich erreichbare Kurzlinks:** Weiterleitung, die Sperre der Oberfläche auf dem öffentlichen Host und die Basisadresse wurden mit simulierten Host-Headern getestet. Ein echter Reverse Proxy mit TLS und öffentlicher Domain stand nicht zur Verfügung.
- **Echte Smartphones:** Gelesen wurde mit vier unabhängigen Software-Decodern (ZXing-C++, jsQR, ZBar, OpenCV), dazu in simulierten Situationen (unscharf, klein, schwaches Licht, schräg). Mit physischen iPhone- oder Android-Kameras und gedruckten Exemplaren wurde nicht getestet. Die Kamera-Funktion des Scanners ist mangels Kamera in der Testumgebung ungetestet; das Lesen aus Bilddateien (PNG und SVG) ist getestet.
- **Firefox:** Ließ sich in der Testumgebung nicht starten und ist ungetestet. Chromium und WebKit (Safari-Engine) sind getestet.
- **Linux-Server mit x86-64:** Gebaut und betrieben wurde das Image auf Docker Desktop (ARM64). Alle nativen Abhängigkeiten (resvg) haben vorgefertigte Pakete für linux-x64. Ein Lauf auf einem x86-64-Host wurde aber nicht durchgeführt.

## Bewusste Grenzen

- **OpenCV** liest Codes mit stilisierten Augen (abgerundet, rund, Blatt, Facette) und manche WLAN-Codes mit Umlauten nicht. ZXing, jsQR und ZBar lesen dieselben Dateien. Smartphone-Kameras nutzen ZXing- bzw. ML-Kit- oder Apple-Vision-Erkennung, nicht OpenCV. Wer maximale Kompatibilität mit Industriescannern braucht, wählt quadratische Augen (Stil „Klassisch“ oder „Druck s/w“).
- **UTF-8 ohne ECI:** Wie praktisch alle Generatoren kodiert Tessera Umlaute als UTF-8 im Byte-Modus ohne ECI-Kennung. Aktuelle Smartphones lesen das korrekt, sehr alte Scanner zeigen eventuell falsche Zeichen.
- **Farbraum:** PDF-Exporte verwenden RGB. Für Offsetdruck mit exakten CMYK- oder Sonderfarben sollte die Druckerei die Datei konvertieren. Ein EPS-Export ist nicht enthalten, PDF und SVG decken Vektor-Workflows ab.
- **SVG-Logos im PDF** werden mit 1600 px gerastert eingebettet. Code, Formen und Beschriftung bleiben Vektor.
- **Statistik** ist absichtlich minimal (Tageszahl, Gerätetyp). Standort, Uhrzeit oder Referrer werden aus Datenschutzgründen nicht erfasst.
- **Rendering im Hauptprozess:** Exporte und Prüfungen laufen nicht in eigenen Threads, sondern über eine Warteschlange mit Pausen zwischen den Einzelschritten. Ein einzelner sehr großer PNG-Export (8000 px, ca. 2–3 s) verzögert andere Anfragen in dieser Zeit spürbar.
- **Sortierung nach Name** ist alphabetisch, nicht natürlich („Laptop 10“ vor „Laptop 2“).
- **Mehrere Instanzen:** SQLite ist für eine Instanz ausgelegt. Horizontal skalieren mit mehreren Containern auf derselben Datenbank ist nicht vorgesehen.
- **Kamera im Scanner** braucht HTTPS oder `localhost` (Browservorgabe). Über reines HTTP im Intranet funktioniert nur das Hochladen von Bildern.
