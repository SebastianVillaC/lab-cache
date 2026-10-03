#!/usr/bin/env bash
# CP-05 · Integración · Falla técnica — Con Redis caído la API responde 200 desde la BD con
# X-Cache: BYPASS en menos de 1 s. Riesgo R3 · PI-1. Al terminar vuelve a levantar Redis.
source "$(dirname "$0")/../_comun.sh"
ID=3; LIMITE_MS=1000
encabezado "CP-05 · Degradación controlada con Redis caído (producto $ID)"
trap 'docker start lab-cache-redis >/dev/null 2>&1; rm -rf "$_TMP"' EXIT
DESDE="$(lineas_log)"

paso "Precondición: Redis disponible y el producto en caché"
peticion GET "/productos/$ID"
peticion GET "/productos/$ID"; verificar "lectura con Redis arriba: HIT" igual "$XCACHE" HIT

paso "Se provoca la falla: Redis detenido"
"$(dirname "$0")/../redis-caida.sh" | sed 's/^/  /'

paso "Lecturas con Redis caído"
for i in 1 2 3; do
  peticion GET "/productos/$ID"
  verificar "lectura $i: 200" igual "$ESTADO" 200
  verificar "lectura $i: X-Cache = BYPASS" igual "$XCACHE" BYPASS
  verificar "lectura $i: responde en menos de $LIMITE_MS ms ($MS ms)" menor "$MS" "$LIMITE_MS"
done
verificar "el precio coincide con la BD" num_igual "$(campo precio)" "$(precio_bd $ID)"

paso "Errores funcionales con Redis caído: se mantienen los códigos del contrato"
peticion GET "/productos/999999"; verificar "producto inexistente: 404 (no 500)" igual "$ESTADO" 404
peticion GET "/productos/abc"; verificar "id inválido: 400 (no 500)" igual "$ESTADO" 400

paso "Estado reportado por /health"
peticion GET /health
verificar "status = degraded" igual "$(campo status)" degraded
verificar "redis = down y postgres = up" igual "$(campo redis)/$(campo postgres)" down/up

resultado CP-05 "$DESDE"
