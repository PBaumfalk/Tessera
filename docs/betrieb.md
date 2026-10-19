# Betrieb

## Starten, Stoppen, Protokoll

```bash
docker compose pull && docker compose up -d   # starten mit fertigem Image (oder: up -d --build)
docker compose ps                  # Status inkl. Healthcheck
docker compose logs -f tessera     # Protokoll
docker compose down                # stoppen (Daten bleiben im Volume tessera-data)
```

Der Container läuft als unprivilegierter Benutzer mit schreibgeschütztem Dateisystem, ohne Linux-Capabilities und mit `no-new-privileges`. Geschrieben wird nur ins Volume `/data`. Der Healthcheck fragt `GET /healthz` ab und prüft dabei auch die Datenbank.

Das Protokoll enthält pro Anfrage nur Methode, Pfad ohne Query-String, Status und Dauer. Nicht protokolliert werden Anfrageinhalte, Cookies, Authorization-Header, IP-Adressen und Query-Strings, also auch keine Inhalte aus der API.

## Updates

```bash
docker compose pull && docker compose up -d     # fertiges Image von ghcr.io
# oder bei selbst gebautem Image:
git pull && docker compose up -d --build
```
Eine feste Version statt `latest` wählen Sie mit `TESSERA_VERSION=1.0.0` in `.env`.

Datenbankmigrationen laufen beim Start automatisch und transaktional. Vor jeder Migration einer bestehenden Datenbank legt Tessera unter `/data/backups/vor-migration-*.db` eine Sicherung an. Schlägt eine Migration fehl, wird sie zurückgerollt und der Start abgebrochen.

## Reverse Proxy

Setze `TRUST_PROXY` auf die IP bzw. das Netz des Proxys und `APP_URL` auf die externe Adresse. Der Proxy muss den ursprünglichen `Host`-Header weitergeben (Standard bei Caddy und Traefik, bei nginx `proxy_set_header Host $host`). Soll Tessera nicht direkt erreichbar sein, binde den Port nur an localhost: `ports: ["127.0.0.1:8080:3000"]`.

**Caddy**
```
qr.intranet.firma.de {
  reverse_proxy tessera:3000
}
```

**nginx**
```nginx
server {
  server_name qr.intranet.firma.de;
  client_max_body_size 30m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

**Traefik (Labels in docker-compose.yml)**
```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.tessera.rule=Host(`qr.intranet.firma.de`)
      - traefik.http.services.tessera.loadbalancer.server.port=3000
```

## Dynamische Codes: intern oder öffentlich?

Ein dynamischer Code enthält einen Kurzlink, z. B. `https://go.firma.de/r/k3Fq9xA`. **Das scannende Smartphone muss diese Adresse erreichen.** Tessera setzt nicht voraus, dass der Server aus dem Internet erreichbar ist, und zeigt in Editor und Einstellungen an, ob eine Basisadresse nur intern funktioniert.

- **Nur intern** (z. B. Aushänge in Büroräumen, Geräte im WLAN): Basisadresse = interne Adresse, z. B. `https://qr.intranet.firma.de`. Funktioniert nur für Geräte im Firmennetz oder per VPN.
- **Öffentlich** (Flyer, Visitenkarten, Verpackungen): Eine öffentliche Domain (z. B. `go.firma.de`) zeigt per Reverse Proxy auf Tessera, **aber nur für den Pfad `/r/`**. Setze `PUBLIC_BASE_URL=https://go.firma.de` und `APP_URL` auf die interne Adresse. Tessera liefert auf `go.firma.de` dann ausschließlich Weiterleitungen aus, die Oberfläche bleibt intern.

Beispiel nginx für die öffentliche Domain:
```nginx
server {
  server_name go.firma.de;
  location /r/ { proxy_pass http://intern-tessera:8080; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
  location / { return 404; }
}
```

**Wichtig:** Lege die Basisadresse fest, bevor du dynamische Codes druckst. Ändert sie sich später, funktionieren bereits gedruckte Codes nur weiter, wenn die alte Adresse ebenfalls auf Tessera zeigt. Tessera warnt vor einer solchen Änderung.

Statische Codes enthalten ihren Inhalt vollständig und funktionieren ohne Tessera, solange das Ziel (z. B. eine Website) erreichbar ist.

## authentik einrichten (OIDC)

1. In authentik unter *Anwendungen → Provider* einen **OAuth2/OpenID-Provider** anlegen:
   - Client-Typ: *Confidential*
   - Redirect-URI: `https://qr.intranet.firma.de/api/auth/oidc/callback`
   - Scopes: `openid`, `profile`, `email` (die Standard-Zuordnung „profile“ liefert in authentik auch `groups`)
2. Eine **Anwendung** mit Slug `tessera` anlegen und den Provider zuweisen.
3. In `.env` eintragen:
   ```
   APP_URL=https://qr.intranet.firma.de
   OIDC_ISSUER=https://auth.firma.de/application/o/tessera/
   OIDC_CLIENT_ID=…
   OIDC_CLIENT_SECRET=…
   OIDC_BUTTON_LABEL=Mit authentik anmelden
   OIDC_ADMIN_GROUPS=tessera-admins
   # optional nur SSO: AUTH_LOCAL=false und OIDC_AUTO_REDIRECT=true
   ```
4. `docker compose up -d`. Konten entstehen bei der ersten Anmeldung. Besteht schon ein lokales Konto mit derselben E-Mail-Adresse, wird die Anmeldung zum Schutz vor Kontoübernahme abgelehnt. Lösche das lokale Konto oder setze `OIDC_LINK_BY_EMAIL=true`; das verknüpft nur Konten ohne Passwort und ohne Administratorrolle und nur bei bestätigter E-Mail.

Getestet wurde der vollständige Ablauf (PKCE, State, Nonce, Gruppenzuordnung) mit dem OIDC-Testanbieter `navikt/mock-oauth2-server`, siehe `tests/oidc/`. Gegen eine echte authentik-Instanz wurde Tessera **nicht** getestet.

## Backup und Restore

Alles Wichtige liegt im Volume `/data`:

| Pfad | Inhalt |
| --- | --- |
| `tessera.db` | SQLite-Datenbank (Codes, Konten, Einstellungen, Statistik) |
| `files/` | Hochgeladene Dateien für dynamische Dokument-Codes |
| `secret.key` | Schlüssel für verschlüsselte Felder (entfällt, wenn `SECRET_KEY` gesetzt ist) |
| `backups/` | Automatische Sicherungen vor Migrationen und CLI-Sicherungen |

**Sicherung im laufenden Betrieb** (konsistent über `VACUUM INTO`):
```bash
docker compose exec tessera node dist/cli.js backup /data/backups/tessera-$(date +%F).db
docker compose cp tessera:/data/backups ./tessera-backups        # aus dem Container holen
```
Oder in der Oberfläche unter *Einstellungen → System → Sicherung herunterladen*. Das ZIP enthält Datenbank, Dateien, Schlüssel und Manifest. Bewahre es geschützt auf, es enthält den Schlüssel für vertrauliche Felder.

Für eine regelmäßige Sicherung eignet sich ein Cronjob auf dem Host:
```cron
15 2 * * * cd /opt/tessera && docker compose exec -T tessera node dist/cli.js backup /data/backups/nacht-$(date +\%u).db
```

**Wiederherstellen:**
```bash
docker compose stop tessera
docker compose run --rm --no-deps tessera node dist/cli.js restore /data/backups/tessera-2026-10-19.db
docker compose start tessera
```
`restore` prüft die Integrität der Sicherung, bewahrt die bisherige Datenbank als `tessera.db.vor-restore-…` auf und führt nötige Migrationen aus. Für Dateien und Schlüssel die Ordner `files/` und `secret.key` zurückkopieren, z. B. aus dem Backup-ZIP mit `docker compose cp`.

**Weitere Befehle**
```bash
docker compose exec tessera node dist/cli.js check                         # Integrität prüfen
docker compose exec -e TESSERA_NEW_PASSWORD='…' tessera node dist/cli.js reset-password admin@firma.de
```

## API für andere Anwendungen

Unter *Einstellungen → Schnittstelle* erzeugst du ein Token. Beispiele:
```bash
curl -H "Authorization: Bearer $TOKEN" "https://qr.intranet.firma.de/api/v1/qr?type=url&url=https://firma.de&format=svg"
curl -H "Authorization: Bearer $TOKEN" -o code.png "https://qr.intranet.firma.de/api/v1/qr?data=INV-000123&format=png&size=1024&preset=kobalt"
curl -H "Authorization: Bearer $TOKEN" -o code.pdf "https://qr.intranet.firma.de/api/codes/<id>/export?format=pdf&mm=50"
```
`/api/v1/qr` versteht `data` (Rohinhalt) oder `type` plus Feldnamen des Typs (z. B. `type=wifi&ssid=…&password=…`), dazu `format` (`svg`, `png`, `pdf`), `size`, `mm`, `dpi` sowie `template` (ID einer Vorlage) oder `preset` (`klassisch`, `kobalt`, `tinte`, `abendrot`, `tiefsee`, `wald`, `nacht`, `facette`, `druck`).
