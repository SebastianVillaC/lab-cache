# Funciones compartidas por los scripts de falla. Se carga con `source`, no se ejecuta.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# Mismos valores por defecto que compose.yaml; .env los sobrescribe si existe.
if [[ -f .env ]]; then set -a; source .env; set +a; fi
POSTGRES_USER="${POSTGRES_USER:-lab}"
POSTGRES_DB="${POSTGRES_DB:-labcache}"

# Se usa el nombre fijo del contenedor (container_name en compose.yaml) para que los
# scripts funcionen igual con Docker y con Podman.
redis_cli() { docker exec lab-cache-redis redis-cli "$@"; }
psql_lab() { docker exec -i lab-cache-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }

marca() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# --- Escenarios de prueba (scripts/escenarios/) ---------------------------------------------

API_URL="${API_URL:-http://localhost:${PORT:-3000}}"
_TMP="$(mktemp -d)"
trap 'rm -rf "$_TMP"' EXIT

# peticion MÉTODO RUTA [CUERPO_JSON]
# Deja el resultado en ESTADO, XCACHE, MS y CUERPO, e imprime una línea resumen.
peticion() {
  local metodo="$1" ruta="$2" cuerpo="${3:-}" args=()
  [[ -n "$cuerpo" ]] && args=(-H 'Content-Type: application/json' --data "$cuerpo")
  local salida
  salida="$(curl -s -o "$_TMP/cuerpo" -D "$_TMP/headers" -w '%{http_code} %{time_total}' \
    -X "$metodo" "${args[@]}" "$API_URL$ruta")" || { ESTADO=000; XCACHE=-; MS=0; CUERPO=''; }
  if [[ -n "${salida:-}" ]]; then
    ESTADO="${salida%% *}"
    MS="$(awk -v t="${salida##* }" 'BEGIN { printf "%d", t * 1000 }')"
    XCACHE="$(grep -i '^x-cache:' "$_TMP/headers" | tr -d '\r' | awk '{print $2}' || true)"
    XCACHE="${XCACHE:--}"
    CUERPO="$(cat "$_TMP/cuerpo")"
  fi
  printf '  → %-4s %-16s %s  X-Cache=%-6s %4d ms  %s\n' "$metodo" "$ruta" "$ESTADO" "$XCACHE" "$MS" "$CUERPO"
}

FALLOS=0
# verificar "descripción" comando...   Registra si la condición se cumple.
verificar() {
  local desc="$1"; shift
  if "$@"; then
    printf '  ✔ %s\n' "$desc"
  else
    printf '  ✘ %s\n' "$desc"
    FALLOS=$((FALLOS + 1))
  fi
}

paso() { printf '\n'; marca "$*"; }

precio_bd() { psql_lab -tAc "SELECT precio::float8 FROM productos WHERE id = $1"; }
campo() { jq -r ".$1" <<<"$CUERPO"; }
igual() { [[ "$1" == "$2" ]]; }
distinto() { [[ "$1" != "$2" ]]; }
num_igual() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 == b + 0) }'; }
menor() { (( $1 < $2 )); }

esperar_api_con_redis() {
  # El cliente de la API reintenta la conexión con backoff de hasta 2 s.
  for _ in $(seq 1 20); do
    [[ "$(curl -s "$API_URL/health" | jq -r .redis)" == "up" ]] && return 0
    sleep 0.5
  done
  return 1
}

# Imprime el resultado final y, si se definió API_LOG, las líneas que la API registró durante el caso.
resultado() {
  local caso="$1" desde="${2:-}"
  if [[ -n "${API_LOG:-}" && -n "$desde" ]]; then
    printf '\nLog de la API durante el caso:\n'
    tail -n +"$((desde + 1))" "$API_LOG" | sed 's/^/  /'
  fi
  printf '\n'
  if (( FALLOS == 0 )); then
    marca "$caso: APROBADO"
  else
    marca "$caso: FALLIDO ($FALLOS verificaciones no se cumplieron)"
    exit 1
  fi
}

lineas_log() { [[ -n "${API_LOG:-}" ]] && wc -l <"$API_LOG" || echo 0; }

encabezado() {
  printf '%s\n' "================================================================"
  printf '%s\n' "$1"
  printf 'Fecha: %s · API: %s · TTL: %s s · Timeout Redis: %s ms\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$API_URL" "${CACHE_TTL_SECONDS:-60}" "${REDIS_COMMAND_TIMEOUT_MS:-500}"
  printf '%s\n' "================================================================"
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/health")" != "200" ]]; then
    echo "La API no responde en $API_URL. Arránquela con: npm start" >&2
    exit 2
  fi
  # Precondición común: la API conectada a Redis. Tras una caída, el cliente tarda hasta 2 s en
  # reconectar; sin esta espera un caso puede empezar en BYPASS por culpa del caso anterior.
  if ! esperar_api_con_redis; then
    echo "La API no está conectada a Redis. Levántelo con: npm run falla:redis-recuperar" >&2
    exit 2
  fi
}
