#!/usr/bin/env bash
# Hallazgo H-01: compara la configuración por defecto del cliente de Redis con la del laboratorio
# en dos fallas de la caché. Redis se restaura al terminar, aunque la medición falle.
#   detenido  → docker stop  (conexión rechazada)
#   congelado → docker pause (la conexión sigue abierta pero Redis no responde: caché lenta)
# Uso: scripts/medir-cliente-redis.sh [detenido|congelado|ambos]   (por defecto: ambos)
source "$(dirname "$0")/_comun.sh"

ESCENARIO="${1:-ambos}"

restaurar() {
  docker unpause lab-cache-redis >/dev/null 2>&1 || true
  docker start lab-cache-redis >/dev/null 2>&1 || true
}
trap restaurar EXIT

medir() {
  node --env-file-if-exists=.env scripts/medir-cliente-redis.ts "$1"
}

if [[ "$ESCENARIO" == "detenido" || "$ESCENARIO" == "ambos" ]]; then
  marca "Escenario detenido: deteniendo Redis"
  docker stop lab-cache-redis >/dev/null
  medir detenido
  restaurar
fi

if [[ "$ESCENARIO" == "congelado" || "$ESCENARIO" == "ambos" ]]; then
  # Se espera a que Redis acepte conexiones para que ambos clientes conecten antes de congelarlo.
  until [[ "$(redis_cli PING 2>/dev/null)" == "PONG" ]]; do sleep 0.5; done
  marca "Escenario congelado: Redis acepta conexiones, se congelará al medir"
  # El congelamiento se aplica 1 s después de arrancar, cuando los clientes ya están conectados.
  ( sleep 1; docker pause lab-cache-redis >/dev/null ) &
  medir congelado
fi
