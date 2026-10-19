# Konfiguration

Alle Einstellungen erfolgen über Umgebungsvariablen, am einfachsten in einer `.env` neben `docker-compose.yml` (Vorlage: `.env.example`). Alle Variablen sind optional.

## Grundlagen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `TESSERA_PORT` | `8080` | Port auf dem Docker-Host (nur in Compose) |
| `APP_URL` | – | Adresse der Oberfläche, z. B. `https://qr.intranet.firma.de`. Nötig für OIDC; bestimmt außerdem, ob Cookies als `Secure` gesetzt werden. |
| `PUBLIC_BASE_URL` | – | Basisadresse der Kurzlinks dynamischer Codes, z. B. `https://go.firma.de`. Hat Vorrang vor der Einstellung in der Oberfläche. Ohne Angabe gilt die Einstellung in der Oberfläche, dann `APP_URL`. Ist beides nicht gesetzt, schreibt der erste dynamische Code, den die Administration anlegt, die aktuelle Adresse fest. |
| `PUBLIC_HOST_REDIRECT_ONLY` | `true` | Auf dem Host von `PUBLIC_BASE_URL` werden nur `/r/…` und `/healthz` ausgeliefert, sofern er sich vom Host von `APP_URL` unterscheidet. |
| `TRUST_PROXY` | `false` | Hinter einem Reverse Proxy auf die **IP oder das Netz des Proxys** setzen (z. B. `172.18.0.0/16`), damit Protokoll und Client-IP korrekt erkannt werden. `true` vertraut jedem `X-Forwarded-For` und ist nur sinnvoll, wenn Tessera ausschließlich über den Proxy erreichbar ist. |
| `ALLOWED_HOSTS` | – | Weitere Hostnamen der Oberfläche neben dem aus `APP_URL`, kommagetrennt (z. B. `qr,10.0.0.12`). Ist eine öffentliche Kurzlink-Domain eingerichtet, bekommt jeder andere Host nur Weiterleitungen. |
| `SECRET_KEY` | – | Mindestens 32 Zeichen. Schlüssel für verschlüsselte Felder (WLAN-Passwörter, IBAN). Ohne Angabe wird `/data/secret.key` erzeugt. **Nach dem ersten Start nicht mehr ändern**, sonst sind gespeicherte Passwörter nicht mehr lesbar. |
| `DATA_DIR` | `/data` | Datenverzeichnis (Datenbank, Dateien, Sicherungen, Schlüssel) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `MAX_UPLOAD_MB` | `25` | Maximale Größe hochgeladener Dateien |
| `SESSION_TTL_HOURS` | `168` | Gültigkeit einer Anmeldung |
| `COOKIE_SECURE` | automatisch | `true`, wenn `APP_URL` mit `https://` beginnt |

## Anmeldung

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `AUTH_LOCAL` | `true` | Anmeldung mit E-Mail und Passwort |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | – | Legt beim ersten Start das Administratorkonto an. Ohne diese Angaben erscheint ein Einrichtungscode im Protokoll (`docker compose logs tessera`). |
| `AUTH_DISABLED` | `false` | **Nur in vertrauenswürdigen Netzen:** Tessera ohne Anmeldung, alle Besucher haben Administratorrechte. Die API antwortet dann nur auf Hosts aus `APP_URL`/`ALLOWED_HOSTS` (ohne diese: nur IP-Adressen, `localhost` und einteilige Namen), als Schutz vor DNS-Rebinding. |
| `OIDC_ISSUER` | – | Issuer-URL, bei authentik `https://auth.firma.de/application/o/<slug>/` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | – | Zugangsdaten des OIDC-Clients |
| `OIDC_SCOPES` | `openid profile email groups` | Angeforderte Scopes |
| `OIDC_BUTTON_LABEL` | `Mit Firmenkonto anmelden` | Beschriftung des Anmeldeknopfs |
| `OIDC_ADMIN_GROUPS` | – | Kommagetrennte Gruppen, deren Mitglieder Administratorrechte erhalten. Die Rolle wird bei jeder Anmeldung abgeglichen. |
| `OIDC_ALLOWED_GROUPS` | – | Wenn gesetzt, dürfen sich nur Mitglieder dieser Gruppen anmelden |
| `OIDC_DEFAULT_ROLE` | `editor` | Rolle neuer OIDC-Konten ohne Admin-Gruppe (`admin`, `editor`, `viewer`) |
| `OIDC_LINK_BY_EMAIL` | `false` | Erlaubt, dass sich ein OIDC-Konto mit einem bestehenden lokalen Konto gleicher E-Mail verbindet. Gilt nur bei `email_verified=true` und nie für Konten mit Passwort oder Administratorrolle. Sonst wird die Anmeldung abgelehnt (Schutz vor Kontoübernahme). |
| `OIDC_AUTO_REDIRECT` | `false` | Direkt zum Anbieter weiterleiten, wenn die lokale Anmeldung abgeschaltet ist |
| `OIDC_ALLOW_INSECURE` | `false` | Erlaubt einen Anbieter ohne HTTPS (nur für Tests) |

Die Redirect-URI für den OIDC-Client lautet `APP_URL/api/auth/oidc/callback`.

## Rollen

| Rolle | Darf |
| --- | --- |
| Administration | alles, dazu Benutzer, Basisadresse, Statistik-Erlaubnis, Standardvorlage, Backup |
| Bearbeiten | Codes, Ordner, Vorlagen und Serien anlegen, ändern und löschen |
| Nur ansehen | Codes ansehen, suchen und exportieren |

## Schutzmechanismen und Grenzen

- **Rechenintensive Aufträge** (Export, Serien, Scan-Prüfung) laufen höchstens zu zweit gleichzeitig, weitere warten in einer Schlange (max. 20). Pro Person läuft höchstens ein Serienexport.
- **Serien:** höchstens 5000 Zeilen, Etikettenbögen bis 2000 Codes, PNG in Serien bis 2048 px, Gesamtbudget 2,6 Milliarden Pixel pro Auftrag. Bricht der Browser den Download ab, stoppt die Erzeugung.
- **Anfragen pro Minute:** Anmeldung 10 je IP und höchstens 10 Fehlversuche je Konto in 15 Minuten; Export 60 und Scan-Prüfung 120 je IP.
- **Kurzlink-Basisadresse:** Wird nur von der Administration festgelegt. Ohne Festlegung können Bearbeiter keine dynamischen Codes speichern.
