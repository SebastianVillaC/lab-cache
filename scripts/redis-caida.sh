#!/usr/bin/env bash
# Provoca la falla de la caché (CP-05): detiene el contenedor de Redis.
# La API debe seguir respondiendo 200 desde PostgreSQL con X-Cache: BYPASS.
source "$(dirname "$0")/_comun.sh"

marca "Deteniendo Redis..."
mostrar "docker stop lab-cache-redis"
docker stop lab-cache-redis >/dev/null
marca "Redis detenido. Estado del contenedor: $(docker inspect -f '{{.State.Status}}' lab-cache-redis)"
