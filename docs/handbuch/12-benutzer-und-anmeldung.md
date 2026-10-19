# 12 — Benutzer und Anmeldung

Jede Person meldet sich mit einem eigenen Konto an. Die Rolle des Kontos bestimmt, was sie darf. Dieses Kapitel zeigt die Rollen, das Anlegen von Konten, das Passwort und die Anmeldung über ein Firmenkonto (OIDC). Konten verwaltet nur die Administration.

Alle Einstellungen dieses Kapitels finden Sie in der linken Leiste unter **Optionen**. Die Seite heißt **Einstellungen**.

## Rollen

| Rolle | Darf |
| --- | --- |
| **Administration** | alles, dazu Benutzer verwalten, Kurzlink-Basisadresse festlegen, Scan-Statistik erlauben, Standardvorlage wählen, Sicherung herunterladen |
| **Bearbeiten** | Codes, Ordner, Vorlagen und Serien anlegen, ändern und löschen |
| **Nur ansehen** | Codes ansehen, suchen und exportieren, den Scanner nutzen, eigene API-Tokens erstellen |

Es muss immer mindestens ein aktives Administratorkonto geben. Ihr eigenes Konto können Sie weder deaktivieren noch löschen, und Sie können Ihre eigene Rolle in der Liste nicht ändern.

## Anmelden und abmelden

1. Öffnen Sie die Adresse von Tessera. Es erscheint **Anmelden**.
2. Geben Sie **E-Mail** und **Passwort** ein.
3. Klicken Sie auf **Anmelden**.

Ist ein Firmen-Login eingerichtet, sehen Sie zusätzlich einen Knopf wie **Mit Firmenkonto anmelden** (die Beschriftung legt die IT fest). Ist die Anmeldung mit Passwort zusätzlich erlaubt, steht darunter „oder mit Passwort“.

Eine Anmeldung gilt standardmäßig sieben Tage (168 Stunden, einstellbar über `SESSION_TTL_HOURS`). Zum Abmelden klicken Sie in der linken Leiste unten auf das Symbol **Abmelden**. In der schmalen Ansicht auf dem Smartphone gibt es dieses Symbol nicht.

Nach zehn Fehlversuchen innerhalb von 15 Minuten sperrt Tessera weitere Versuche für dieses Konto vorübergehend („Zu viele Fehlversuche für dieses Konto. Bitte warte 15 Minuten.“). Zusätzlich sind je IP-Adresse höchstens zehn Anmeldeversuche pro Minute möglich.

## Eigenes Passwort ändern

1. Klicken Sie auf **Optionen** und wählen Sie den Bereich **Konto**.
2. Tragen Sie **Aktuelles Passwort** und **Neues Passwort** ein. Das neue Passwort braucht mindestens 10 und höchstens 200 Zeichen.
3. Klicken Sie auf **Passwort ändern**. Ihre Anmeldungen in anderen Browsern werden dabei beendet.

Wer sich über das Firmenkonto anmeldet, hat in Tessera kein Passwort. Der Bereich zum Ändern erscheint dann nicht.

Im Bereich **Konto** wählen Sie außerdem unter **Darstellung** → **Farbschema** zwischen **Wie System**, **Hell** und **Dunkel**. Die Wahl gilt nur für den jeweiligen Browser.

## Konten verwalten (Administration)

### Konto anlegen

1. Klicken Sie auf **Optionen** und wählen Sie den Bereich **Benutzer**.
2. Klicken Sie auf **Konto anlegen**.
3. Füllen Sie **E-Mail**, **Name**, **Rolle** und **Startpasswort** aus. Das Startpasswort braucht mindestens 10 Zeichen.
4. Klicken Sie auf **Anlegen**.
5. Teilen Sie der Person das Startpasswort auf sicherem Weg mit. Sie kann es danach selbst ändern.

Jede E-Mail-Adresse kann nur ein Konto haben.

### Konto ändern

In der Liste unter **Benutzer** sehen Sie je Konto Name, E-Mail und die letzte Anmeldung. Konten aus dem Firmen-Login tragen die Marke **SSO**.

| Aufgabe | So geht es |
| --- | --- |
| Rolle ändern | Rolle in der Auswahlliste neben dem Konto wählen. Die Änderung gilt sofort. |
| Konto sperren | Schalter **Aktiv** ausschalten. Das Konto erhält die Marke **Deaktiviert**, laufende Anmeldungen dieses Kontos enden sofort. |
| Passwort neu setzen | Schlüsselsymbol **Passwort setzen** anklicken, **Neues Passwort** eintragen (mindestens 10 Zeichen) und mit **Passwort setzen** bestätigen. Alle Anmeldungen dieses Kontos enden. Nicht bei SSO-Konten. |
| Konto löschen | Papierkorbsymbol **Konto löschen** anklicken und mit **Konto löschen** bestätigen. Die Codes dieses Kontos bleiben erhalten. |

Auswahlliste und Schalter **Aktiv** sind in der schmalen Ansicht auf dem Smartphone ausgeblendet.

### Passwort der Administration vergessen (für IT)

Gibt es keinen anderen Administrator mehr, setzen Sie das Passwort auf dem Server zurück:

```bash
# Docker Compose
docker compose exec -e TESSERA_NEW_PASSWORD='mindestens-10-Zeichen' tessera node dist/cli.js reset-password admin@firma.de

# Einzelcontainer
docker exec -e TESSERA_NEW_PASSWORD='mindestens-10-Zeichen' tessera node dist/cli.js reset-password admin@firma.de
```

Ohne `TESSERA_NEW_PASSWORD` erzeugt Tessera ein zufälliges Passwort und gibt es aus („Neues Passwort: …“). Der Befehl aktiviert das Konto wieder und beendet alle bestehenden Anmeldungen dieses Kontos.

## Anmeldung über das Firmenkonto: OIDC und authentik (für IT)

Tessera unterstützt OpenID Connect, etwa mit authentik. Kurzfassung:

1. Beim Anbieter einen OAuth2/OpenID-Client (Typ *Confidential*) anlegen. Redirect-URI: `APP_URL/api/auth/oidc/callback`.
2. In `.env` mindestens `APP_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID` und `OIDC_CLIENT_SECRET` setzen.
3. Optional: `OIDC_ADMIN_GROUPS` (Gruppen mit Administratorrechten), `OIDC_ALLOWED_GROUPS` (nur diese Gruppen dürfen sich anmelden), `OIDC_DEFAULT_ROLE` (Rolle neuer Konten, Standard `editor`), `OIDC_BUTTON_LABEL`.
4. Nur Firmen-Login: `AUTH_LOCAL=false` und `OIDC_AUTO_REDIRECT=true`.
5. `docker compose up -d`.

Konten entstehen bei der ersten Anmeldung. Ist `OIDC_ADMIN_GROUPS` gesetzt, gleicht Tessera die Rolle bei jeder Anmeldung ab: Mitglieder dieser Gruppen werden Administration, alle anderen erhalten `OIDC_DEFAULT_ROLE`. Eine von Hand in Tessera geänderte Rolle wird dabei überschrieben.

Gibt es schon ein lokales Konto mit derselben E-Mail-Adresse, lehnt Tessera die Anmeldung ab. Das schützt vor Kontoübernahme. Die Person sieht dann: „Für deine E-Mail-Adresse gibt es bereits ein lokales Konto. …“ Lösen Sie das, indem Sie das lokale Konto löschen oder `OIDC_LINK_BY_EMAIL=true` setzen. Diese Verknüpfung gilt nur bei bestätigter E-Mail (`email_verified`) und nie für Konten mit Passwort oder Administratorrolle.

Weitere Meldungen auf der Anmeldeseite:

| Meldung | Ursache |
| --- | --- |
| „Der Anmeldedienst ist gerade nicht erreichbar.“ | Tessera erreicht den OIDC-Anbieter nicht. |
| „Die Anmeldung über den Firmen-Login ist fehlgeschlagen.“ | Der Anbieter hat die Anmeldung nicht bestätigt, z. B. wegen falscher Client-Daten oder Redirect-URI. Details stehen im Protokoll des Containers. |
| „Die Anmeldung hat zu lange gedauert. Bitte versuche es erneut.“ | Der Anmeldevorgang ist abgelaufen. |
| „Dein Konto ist für Tessera nicht freigegeben. Wende dich an die Administration.“ | Die Person gehört keiner Gruppe aus `OIDC_ALLOWED_GROUPS` an. |
| „Dein Konto ist deaktiviert.“ | Das Konto ist in Tessera gesperrt. |

**Getestet:** Der vollständige Ablauf (PKCE, State, Nonce, Gruppe → Administratorrolle) wurde mit dem Testanbieter `navikt/mock-oauth2-server` geprüft, nicht gegen eine echte authentik-Instanz. Abweichungen sind vor allem beim Gruppen-Claim möglich: Tessera erwartet den Claim `groups` als Liste. Die ausführliche Anleitung steht in [../betrieb.md](../betrieb.md#authentik-einrichten-oidc), alle Variablen in [../konfiguration.md](../konfiguration.md#anmeldung).

## Ohne Anmeldung (für IT)

Mit `AUTH_DISABLED=true` ist Tessera ohne Anmeldung erreichbar, und alle Besucher haben Administratorrechte. Verwenden Sie das nur in vertrauenswürdigen Netzen. Die Oberfläche antwortet dann nur auf Hostnamen aus `APP_URL` bzw. `ALLOWED_HOSTS` (ohne diese Angaben nur auf IP-Adressen, `localhost` und einteilige Namen).

## API-Tokens

Mit einem Token können andere Anwendungen QR-Codes über Tessera erzeugen, zum Beispiel ein Ticketsystem. Ein Token hat dieselben Rechte wie das Konto, das es erstellt.

1. Klicken Sie auf **Optionen** und wählen Sie den Bereich **Schnittstelle**.
2. Tragen Sie einen Namen ein, z. B. den Namen der Anwendung.
3. Klicken Sie auf **Token erstellen**.
4. Kopieren Sie das Token mit **Kopieren**. Es wird nur dieses eine Mal angezeigt.

Die Liste zeigt Ihre eigenen Tokens, je Token den Namen, den Anfang (`tsr_…`), das Erstelldatum und die letzte Verwendung. Mit **Widerrufen** und der Bestätigung **Widerrufen** sperren Sie ein Token. Anwendungen, die es verwenden, verlieren sofort den Zugriff. Tokens lassen sich nur in der Oberfläche erstellen, nicht über die Schnittstelle selbst. Die Verwendung beschreibt Kapitel [13](13-schnittstelle.md).

---

← [11 — Scanner](11-scanner.md) | [Inhalt](README.md) | [13 — Schnittstelle (IT)](13-schnittstelle.md) →
