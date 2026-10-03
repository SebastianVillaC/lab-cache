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
