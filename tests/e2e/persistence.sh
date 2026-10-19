#!/bin/bash
# Prüft Persistenz über Neustart und Neuerstellung des Containers (Volume bleibt).
set -e
P=${E2E_PROJECT:-tessera-e2e}; URL=${E2E_URL:-http://localhost:8090}
C=$(node -e "const s=require('./test-results/state.json');console.log(s.cookies.map(c=>c.name+'='+c.value).join('; '))")
count() { curl -sf "$URL/api/codes?limit=1" -H "cookie: $C" | node -pe "JSON.parse(require('fs').readFileSync(0)).total"; }
wait_up() { for i in $(seq 1 60); do curl -sf "$URL/healthz" >/dev/null && return 0; sleep 1; done; echo "nicht gestartet"; exit 1; }
SLUG=$(curl -sf "$URL/api/codes?kind=dynamic&limit=1" -H "cookie: $C" | node -pe "JSON.parse(require('fs').readFileSync(0)).items[0].slug")
before=$(count); echo "Codes vorher: $before (dynamisch: /r/$SLUG)"
docker compose -p $P restart tessera >/dev/null 2>&1; wait_up
echo "Nach Neustart: $(count)"; [ "$(count)" = "$before" ]
docker compose -p $P down >/dev/null 2>&1; TESSERA_PORT=8090 docker compose -p $P up -d >/dev/null 2>&1; wait_up
after=$(count); echo "Nach Neuerstellung des Containers: $after"; [ "$after" = "$before" ]
loc=$(curl -s -o /dev/null -w "%{redirect_url}" "$URL/r/$SLUG"); echo "Weiterleitung /r/$SLUG -> $loc"; [ -n "$loc" ]
echo "Sitzung gültig nach Neustart: $(curl -s -o /dev/null -w '%{http_code}' "$URL/api/codes?limit=1" -H "cookie: $C")"
pw=$(curl -sf "$URL/api/codes?type=wifi&limit=1" -H "cookie: $C" | node -pe "JSON.parse(require('fs').readFileSync(0)).items[0]?.id ?? ''")
[ -n "$pw" ] && echo "WLAN-Passwort nach Neustart entschlüsselbar: $(curl -sf "$URL/api/codes/$pw" -H "cookie: $C" | node -pe "JSON.parse(require('fs').readFileSync(0)).content.password ? 'ja' : 'nein'")" || true
echo "PERSISTENZ OK"
