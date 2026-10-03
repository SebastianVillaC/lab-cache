#!/usr/bin/env bash
# Provoca un dato desactualizado (CP-06): actualiza el precio en PostgreSQL sin pasar
# por la API, así que nadie invalida la llave en Redis.
# Uso: scripts/bd-escritura-directa.sh [id] [precio]   (por defecto: 1 y un precio aleatorio)
source "$(dirname "$0")/_comun.sh"

ID="${1:-1}"
PRECIO="${2:-$((RANDOM % 900000 + 100000)).00}"
[[ "$ID" =~ ^[0-9]+$ ]] || { echo "id inválido: $ID" >&2; exit 1; }
[[ "$PRECIO" =~ ^[0-9]+(\.[0-9]{1,2})?$ ]] || { echo "precio inválido: $PRECIO" >&2; exit 1; }

marca "Valor en caché ANTES (producto:$ID):"
redis_cli GET "producto:$ID"
marca "Escritura directa en la BD: precio = $PRECIO"
psql_lab -v ON_ERROR_STOP=1 -c \
  "UPDATE productos SET precio = $PRECIO, actualizado_en = now() WHERE id = $ID RETURNING id, nombre, precio, actualizado_en;"
marca "Valor en caché DESPUÉS (sigue igual hasta que venza el TTL):"
redis_cli GET "producto:$ID"
marca "TTL restante: $(redis_cli TTL "producto:$ID") s  (-2 = la llave no existe)"
