#!/usr/bin/env bash
# CP-02 · Integración · Exitoso — Un PUT invalida la llave y el GET siguiente devuelve el valor nuevo.
# Riesgo R1 · PI-1, PI-4. Al final restaura el producto a sus valores originales.
source "$(dirname "$0")/../_comun.sh"
ID=2; LLAVE="producto:$ID"
encabezado "CP-02 · Invalidación de la caché tras una actualización (producto $ID)"
DESDE="$(lineas_log)"
# La limpieza va en un trap para que el producto se restaure aunque el caso falle a mitad.
ORIGINAL=''
limpiar() {
  [[ -n "$ORIGINAL" ]] && curl -s -o /dev/null -X PUT -H 'Content-Type: application/json' \
    --data "$ORIGINAL" "$API_URL/productos/$ID"
  redis_cli DEL "$LLAVE" >/dev/null 2>&1
  rm -rf "$_TMP"
}
trap limpiar EXIT

paso "Precondición: la llave está vacía y el producto queda en caché tras dos lecturas"
redis_cli DEL "$LLAVE" >/dev/null
peticion GET "/productos/$ID"; verificar "primera lectura: MISS" igual "$XCACHE" MISS
ORIGINAL="$(jq -c '{nombre, precio, stock}' <<<"$CUERPO")"
PRECIO_ORIGINAL="$(campo precio)"
peticion GET "/productos/$ID"; verificar "segunda lectura: HIT" igual "$XCACHE" HIT
verificar "la llave $LLAVE existe en Redis" igual "$(redis_cli EXISTS "$LLAVE")" 1

paso "Se actualiza el precio por la API"
NUEVO="$(jq -c '.precio = (.precio + 1000)' <<<"$ORIGINAL")"
PRECIO_NUEVO="$(jq -r .precio <<<"$NUEVO")"
peticion PUT "/productos/$ID" "$NUEVO"
verificar "PUT responde 200" igual "$ESTADO" 200
verificar "la llave $LLAVE fue invalidada (EXISTS = 0)" igual "$(redis_cli EXISTS "$LLAVE")" 0

paso "La siguiente lectura refleja el valor nuevo"
peticion GET "/productos/$ID"
verificar "lectura tras el PUT: MISS (se lee de la BD)" igual "$XCACHE" MISS
verificar "precio en la respuesta = $PRECIO_NUEVO" num_igual "$(campo precio)" "$PRECIO_NUEVO"
peticion GET "/productos/$ID"
verificar "lectura siguiente: HIT con el valor nuevo" num_igual "$(campo precio)" "$PRECIO_NUEVO"
verificar "precio en la BD = $PRECIO_NUEVO" num_igual "$(precio_bd $ID)" "$PRECIO_NUEVO"
marca "Estado de la caché:"; "$(dirname "$0")/../redis-inspeccionar.sh" | tail -n +2

marca "Limpieza: al salir se restaura el producto (precio $PRECIO_ORIGINAL)"
resultado CP-02 "$DESDE"
