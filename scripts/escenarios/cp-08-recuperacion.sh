#!/usr/bin/env bash
# CP-08 · Sistema · Falla técnica — Redis cae y vuelve: la API pasa de BYPASS a MISS y luego a HIT
# sin reiniciarse. Riesgo R3 · PI-1, PI-3.
source "$(dirname "$0")/../_comun.sh"
ID=1; LLAVE="producto:$ID"
encabezado "CP-08 · Recuperación de la caché tras una caída de Redis (producto $ID)"
trap 'docker start lab-cache-redis >/dev/null 2>&1; rm -rf "$_TMP"' EXIT
DESDE="$(lineas_log)"

paso "Precondición: producto en caché"
peticion GET "/productos/$ID"
peticion GET "/productos/$ID"; verificar "lectura inicial: HIT" igual "$XCACHE" HIT

paso "Redis cae"
"$(dirname "$0")/../redis-caida.sh" | sed 's/^/  /'
peticion GET "/productos/$ID"
verificar "con Redis caído: 200 con BYPASS" igual "$ESTADO/$XCACHE" 200/BYPASS

paso "Redis vuelve (sin reiniciar la API)"
"$(dirname "$0")/../redis-recuperar.sh" | sed 's/^/  /'
verificar "Redis vuelve vacío (sin persistencia en disco)" igual "$(redis_cli DBSIZE)" 0
verificar "la API reconecta: /health reporta redis = up" esperar_api_con_redis

paso "La caché se reconstruye desde la BD"
peticion GET "/productos/$ID"; verificar "primera lectura: MISS" igual "$XCACHE" MISS
PRIMERA="$CUERPO"
peticion GET "/productos/$ID"; verificar "segunda lectura: HIT" igual "$XCACHE" HIT
verificar "HIT y MISS devuelven el mismo cuerpo" igual "$CUERPO" "$PRIMERA"
verificar "la llave $LLAVE tiene TTL" bash -c "(( $(redis_cli TTL "$LLAVE") > 0 ))"
peticion GET /health; verificar "/health: status = ok" igual "$(campo status)" ok

resultado CP-08 "$DESDE"
