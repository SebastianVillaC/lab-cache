#!/usr/bin/env bash
# CP-06 · Integración · Falla de integración — Una escritura directa en la BD (sin pasar por la API)
# deja la caché desactualizada hasta que vence el TTL. Riesgos R2 y R6 · PI-4.
# Dura hasta CACHE_TTL_SECONDS (60 s por defecto). Al final restaura el precio original.
# Con --paso-a-paso (npm run demo:cp-06) espera Enter antes de cada paso y usa el TTL de .env.demo
# (20 s); la API debe estar arrancada con el mismo TTL: npm run demo:api.
source "$(dirname "$0")/../_comun.sh"
ID=4; LLAVE="producto:$ID"
TTL_CONFIG="${CACHE_TTL_SECONDS:-60}"
encabezado "CP-06 · Dato desactualizado por escritura fuera de la API (producto $ID)"
DESDE="$(lineas_log)"
# La limpieza va en un trap para que el precio se restaure aunque el caso falle a mitad.
PRECIO_ORIGINAL=''
limpiar() {
  [[ -n "$PRECIO_ORIGINAL" ]] && psql_lab -tAc "UPDATE productos SET precio = $PRECIO_ORIGINAL WHERE id = $ID" >/dev/null
  redis_cli DEL "$LLAVE" >/dev/null 2>&1
  rm -rf "$_TMP"
}
trap limpiar EXIT

paso "Precondición: el producto entra a la caché"
redis_cli DEL "$LLAVE" >/dev/null
peticion GET "/productos/$ID"; verificar "primera lectura: MISS" igual "$XCACHE" MISS
PRECIO_ORIGINAL="$(campo precio)"
mostrar "redis-cli TTL $LLAVE"
TTL="$(redis_cli TTL "$LLAVE")"
printf '  %s\n' "$TTL"
verificar "la llave tiene TTL (0 < $TTL ≤ $TTL_CONFIG)" bash -c "(( $TTL > 0 && $TTL <= $TTL_CONFIG ))"

paso "Escritura directa en la BD (otro sistema o un administrador)"
PRECIO_NUEVO="$(awk -v p="$PRECIO_ORIGINAL" 'BEGIN { printf "%.2f", p + 5000 }')"
mostrar "psql -c \"UPDATE productos SET precio = $PRECIO_NUEVO, actualizado_en = now() WHERE id = $ID\""
psql_lab -tAc "UPDATE productos SET precio = $PRECIO_NUEVO, actualizado_en = now() WHERE id = $ID" | sed 's/^/  /'
verificar "precio en la BD = $PRECIO_NUEVO" num_igual "$(precio_bd $ID)" "$PRECIO_NUEVO"

paso "Detección: la API sirve desde la caché un precio distinto al de la BD"
peticion GET "/productos/$ID"
mostrar "psql -c \"SELECT precio FROM productos WHERE id = $ID\""
printf '  %s\n' "$(precio_bd $ID)"
verificar "X-Cache = HIT" igual "$XCACHE" HIT
verificar "la API responde el precio viejo ($PRECIO_ORIGINAL)" num_igual "$(campo precio)" "$PRECIO_ORIGINAL"
verificar "inconsistencia: API ($(campo precio)) ≠ BD ($(precio_bd $ID))" \
  bash -c "! awk -v a='$(campo precio)' -v b='$(precio_bd $ID)' 'BEGIN { exit !(a + 0 == b + 0) }'"

paso "Mitigación por TTL: se espera a que la llave expire"
while true; do
  mostrar "redis-cli TTL $LLAVE"
  TTL="$(redis_cli TTL "$LLAVE")"
  printf '  %s\n' "$TTL"
  (( TTL < 0 )) && break
  sleep "$(( TTL > 10 ? 10 : TTL + 1 ))"
done
marca "La llave expiró (TTL = $TTL)"

paso "Tras vencer el TTL la API vuelve a ser coherente con la BD"
peticion GET "/productos/$ID"
verificar "X-Cache = MISS" igual "$XCACHE" MISS
verificar "precio en la respuesta = precio en la BD ($PRECIO_NUEVO)" num_igual "$(campo precio)" "$PRECIO_NUEVO"

marca "Limpieza: al salir se restaura el precio original ($PRECIO_ORIGINAL)"
resultado CP-06 "$DESDE"
