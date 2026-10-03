#!/usr/bin/env bash
# Recupera la caché (CP-08): levanta Redis y espera a que responda PING.
# Como Redis no persiste en disco, vuelve vacío: la primera lectura debe ser MISS y la segunda HIT.
source "$(dirname "$0")/_comun.sh"

marca "Levantando Redis..."
docker start lab-cache-redis >/dev/null
for _ in $(seq 1 30); do
  if [[ "$(redis_cli PING 2>/dev/null)" == "PONG" ]]; then
    marca "Redis disponible. Llaves en caché: $(redis_cli DBSIZE)"
    exit 0
  fi
  sleep 0.5
done
marca "Redis no respondió en 15 s" >&2
exit 1
