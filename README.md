# Laboratorio de API con caché Redis

API REST de productos con PostgreSQL como fuente de verdad y Redis como caché *cache-aside*. La suite comprueba el contrato HTTP, la coherencia de la caché y la degradación cuando Redis se detiene.

## Requisitos

- Node.js 24.x (ver `.nvmrc`).
- Docker Desktop iniciado y con Docker Compose disponible.
- PowerShell en Windows (o una terminal compatible).
- Puertos 3000, 5433 y 6380 disponibles.
- Solo para los escenarios manuales (`scripts/`): Bash, `curl` y [`jq`](https://jqlang.org/). En Windows, Git Bash o WSL; `jq` no viene incluido en Git Bash y se instala con `winget install jqlang.jq` (macOS: `brew install jq`; Linux: `apt install jq`).

La configuración local está en `.env.example`. Las pruebas usan los servicios reales de Compose y restauran la tabla `productos` a los cuatro registros semilla y vacían Redis antes y después de cada caso. Ejecútalas solo contra el entorno de laboratorio: el puerto Redis usa `FLUSHDB` y CP-05 detiene el contenedor `lab-cache-redis`.

## Instalación y arranque

En PowerShell, desde la carpeta del proyecto:

```powershell
Copy-Item .env.example .env
npm ci
npm run infra:up
npm run dev
```

La API queda disponible en <http://localhost:3000>. Verifica el estado con <http://localhost:3000/health>. Las rutas principales son `GET /productos/:id`, `POST /productos` y `PUT /productos/:id`.

Para iniciar la API sin modo de desarrollo usa `npm start`. Para detener los servicios de datos, desde otra terminal:

```powershell
npm run infra:down
```

Para recrear los datos semilla desde cero (elimina el volumen local de PostgreSQL):

```powershell
npm run infra:reset
```

## Pruebas automatizadas

Con PostgreSQL y Redis arriba, ejecuta:

```powershell
npm test
npm run typecheck
```

Jest se ejecuta secuencialmente, con Node cargando `.env`, y escribe el reporte de todas las suites en `docs/evidencias/reporte-jest.json`. Las pruebas de integración están en `tests/integration/`; las pruebas de sistema, que atraviesan la API junto con los contenedores reales, en `tests/system/`. Cada caso produce además una evidencia de texto `CP-XX_..._automatizado.txt` en `docs/evidencias/`.

CP-05 detiene y vuelve a iniciar el contenedor Redis mediante Docker. Se necesita Docker Desktop en ejecución y permiso para controlar el contenedor. Si la prueba falla, comprueba que `lab-cache-redis` volvió a quedar arriba con `docker start lab-cache-redis`.

## Casos y resultados

La matriz con los 12 campos exigidos y el vínculo con riesgos/puntos de integración está en [`docs/matriz-casos.xlsx`](docs/matriz-casos.xlsx). Los scripts de escenario mantienen evidencias manuales en `docs/evidencias/`.

| Caso | Comprobación | Tipo | Automatizado |
|---|---|---|---|
| CP-01 | Primera lectura MISS, segunda HIT y cuerpos iguales | Integración | Sí |
| CP-02 | PUT invalida la llave y el GET devuelve el cambio | Integración | Sí |
| CP-03 | POST/PUT inválidos responden 400 sin cambiar datos | Integración | Sí |
| CP-04 | Producto inexistente da 404 y no se cachea | Integración | Sí |
| CP-05 | Redis detenido: respuesta 200 con BYPASS en menos de 1 s | Integración | Sí |
| CP-06 | Escritura directa en BD queda obsoleta hasta vencer el TTL | Integración | No; escenario manual |
| CP-07 | Flujo crear, leer, actualizar y volver a leer | Sistema | Sí |
| CP-08 | Redis recuperado reconstruye la entrada MISS y luego HIT | Sistema | No; escenario manual |

## Escenarios manuales de falla

Los comandos `escenario:*`, `falla:*` y utilidades `.sh` se implementaron para Bash. En Windows, ejecútalos desde Git Bash o WSL, con la API iniciada (`npm start`) y Docker Compose arriba:

```bash
npm run escenario:cp-02
npm run escenario:cp-05
npm run escenario:cp-06
npm run escenario:cp-08
```

Cada escenario imprime con el prefijo `$` el comando real que provoca la falla (`docker stop lab-cache-redis`, el `UPDATE` directo con `psql`, `redis-cli TTL`).

### Modo demo (paso a paso)

Para la exposición, CP-06 y CP-08 tienen una variante que espera Enter antes de cada paso. Usa `.env.demo`, que baja el TTL a 20 s para que CP-06 no espere un minuto; por eso la API se arranca con el mismo TTL:

```bash
npm run demo:api     # terminal 1: API con TTL de 20 s (deja ver el log)
npm run demo:cp-08   # terminal 2: docker stop → BYPASS → docker start → MISS → HIT
npm run demo:cp-06   # terminal 2: UPDATE directo → dato viejo en caché → vence el TTL → MISS
```

Para ver llaves y TTL usa `npm run redis:inspeccionar`. Los datos directos de demostración pueden restaurarse reiniciando el entorno con `npm run infra:reset` desde PowerShell.

## Evidencias y análisis

- Reporte automático: `docs/evidencias/reporte-jest.json`.
- Evidencias por caso: `docs/evidencias/CP-XX_*`.
- Resultados observados, tiempos HIT/MISS/BYPASS, hallazgo del cliente Redis y conclusiones: `docs/estrategia.md`.
- Diagramas de arquitectura (componentes y secuencias): `docs/arquitectura/`.

Las duraciones de solicitudes automatizadas se registran en sus evidencias; la suite no interpreta las mediciones como una prueba de carga.
