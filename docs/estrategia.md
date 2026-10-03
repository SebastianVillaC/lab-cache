# Estrategia de pruebas — Arquitectura con caché

**Tema:** Pruebas de una arquitectura con caché (tema 14)
**Enfoque:** Integración entre aplicación, caché y base de datos

Documento organizado según los diez elementos de la sección 7 de la guía. Cada sección indica su responsable.

---

## 1. Objetivo de las pruebas

> Pendiente — Integrante A.

## 2. Componentes incluidos

> Pendiente — Integrante A.

## 3. Puntos de integración

*Responsable: Integrante B.*

```
Cliente / Tests ──HTTP──▶ API REST (Node + Express) ──▶ Redis (caché)
                                     │
                                     └──────────────▶ PostgreSQL (BD)
```

La API aplica el patrón **cache-aside**: en una lectura consulta Redis y, si la llave no está, lee de PostgreSQL y guarda el resultado con TTL; en una escritura actualiza PostgreSQL y luego borra la llave. Cada respuesta indica el origen del dato con el header `X-Cache: HIT | MISS | BYPASS`.

| ID | Punto | Qué se valida | Cómo se observa |
|---|---|---|---|
| PI-1 | API ↔ Redis | Lectura, escritura y borrado de llaves `producto:{id}`; que toda llave tenga TTL; que un fallo de Redis no se propague a la API | Header `X-Cache`, `scripts/redis-inspeccionar.sh` (llaves y TTL) |
| PI-2 | API ↔ PostgreSQL | Consultas, inserciones y actualizaciones parametrizadas; tipos devueltos (`NUMERIC`) | Respuesta HTTP, consulta con `psql` |
| PI-3 | Cliente ↔ API | Contrato HTTP: rutas, códigos de estado, cuerpo y header `X-Cache` | Respuesta HTTP en Supertest |
| PI-4 | Coherencia Redis ↔ PostgreSQL | Que la caché no sirva un dato distinto al de la BD, o que la diferencia quede acotada por el TTL | Se compara la respuesta de la API con `psql` después de una escritura |

PI-4 no es una conexión directa (Redis y PostgreSQL no se comunican entre sí): es una propiedad del sistema que se verifica a través de la API.

## 4. Riesgos identificados

*Responsable: Integrante B.*

| ID | Riesgo | Impacto | Punto | Mitigación en el laboratorio | Casos |
|---|---|---|---|---|---|
| R1 | Dato no invalidado tras una actualización | El cliente ve el valor viejo después de modificarlo por la API | PI-1, PI-4 | `DEL producto:{id}` después de cada escritura en la BD | CP-02 |
| R2 | Dato desactualizado por escrituras que no pasan por la API | La caché sirve un valor distinto al de la BD hasta que la llave expire | PI-4 | TTL en todas las llaves (`CACHE_TTL_SECONDS`, 60 s); el riesgo se acepta y se acota, no se elimina | CP-06 |
| R3 | Caída o lentitud de Redis bloquea o tumba la API | Peticiones colgadas o errores 500 aunque la BD esté disponible | PI-1 | Cola fuera de línea desactivada, timeout por comando (`REDIS_COMMAND_TIMEOUT_MS`, 500 ms) y un módulo de caché que no lanza excepciones: la API responde desde la BD con `BYPASS` | CP-05, CP-08 |
| R4 | Se cachean datos inválidos o respuestas de error | Un 404 o un dato rechazado queda guardado y se sirve en lecturas posteriores | PI-1, PI-3 | Solo se escribe en la caché un producto leído correctamente de la BD | CP-03, CP-04 |
| R5 | Respuesta distinta entre HIT y MISS por serialización | `pg` devuelve `NUMERIC` como string; si se normaliza en un solo camino, el cliente recibe tipos distintos según el origen | PI-1, PI-2 | Normalización de tipos en un solo punto, antes de cachear y antes de responder | CP-01 |
| R6 | TTL ausente o mal configurado | Llaves que nunca expiran: R2 se vuelve permanente y la memoria se llena | PI-1 | `SET` con `EX` en la misma operación (nunca queda una llave sin TTL); `maxmemory 64mb` con desalojo `allkeys-lru` | CP-06 |
| R7 | Entrada corrupta en la caché (JSON inválido) | Error al deserializar y fallo de la petición | PI-1 | El módulo trata la entrada como MISS, la borra y la siguiente lectura la regenera | — |

R7 se agregó durante la implementación del módulo de caché. Su comportamiento se verificó manualmente, pero todavía no tiene un caso de prueba formal.

## 5. Alcance y exclusiones

> Pendiente — Integrante A.

## 6. Ambiente necesario

*Responsable: Integrante B.*

Todo el laboratorio corre en local y con herramientas gratuitas. No se usa ningún servicio en la nube.

| Elemento | Versión / valor | Notas |
|---|---|---|
| Node.js | 24 LTS (`.nvmrc`, `engines: >=24 <25`) | Ejecuta los `.ts` directamente; `engine-strict=true` impide instalar con otra versión |
| Motor de contenedores | Docker con Compose, o Podman con `podman-compose` | `compose.yaml` usa nombres de imagen completos (`docker.io/library/...`) para que Podman las resuelva |
| PostgreSQL | `postgres:17-alpine` · puerto del host **5433** | Volumen `pgdata`; esquema y datos semilla en `db/init.sql` |
| Redis | `redis:7.4-alpine` · puerto del host **6380** | Sin persistencia (`--save ""`, `--appendonly no`), `maxmemory 64mb`, `allkeys-lru` |
| API | puerto **3000** | Configuración en `.env` (copiar desde `.env.example`) |

Se usan los puertos 5433 y 6380 del host, en lugar de los estándar, para no chocar con instancias locales de PostgreSQL o Redis.

**Configuración que afecta a las pruebas** (`.env`):

| Variable | Valor | Para qué sirve |
|---|---|---|
| `CACHE_TTL_SECONDS` | 60 | Tiempo de vida de cada llave. Acota cuánto tiempo puede servirse un dato desactualizado (R2) |
| `REDIS_COMMAND_TIMEOUT_MS` | 500 | Tope de espera de cada comando a Redis antes de responder con `BYPASS` (R3) |

**Estado inicial de cada prueba:** Redis vacío (`FLUSHDB`) y la tabla `productos` con los cuatro registros semilla de `db/init.sql`. Para volver al estado inicial completo se usa `npm run infra:reset`.

**Por qué Redis no persiste en disco:** es una caché, no la fuente de verdad. Si se reinicia, debe volver vacía y reconstruirse desde PostgreSQL. Esto es justamente lo que valida CP-08.

## 7. Datos de prueba

> Pendiente — Integrante C.

## 8. Dependencias reales y simuladas

*Responsable: Integrante B.*

| Dependencia | Tipo | Justificación |
|---|---|---|
| PostgreSQL | **Real** (contenedor) | Es la fuente de verdad. Simularla ocultaría los riesgos de PI-2, como el tipo de `NUMERIC` (R5) |
| Redis | **Real** (contenedor) | El objetivo del tema es probar la integración con la caché; un mock no reproduciría el TTL, el desalojo ni los errores de conexión |
| Falla de Redis (caído) | **Provocada** sobre el contenedor real | `docker stop` produce una conexión rechazada real, sin cambiar el código de la API |
| Lentitud de Redis | **Provocada** sobre el contenedor real | `docker pause` congela el proceso: la conexión TCP sigue abierta pero no hay respuesta. Es el caso que solo cubre el timeout por comando |
| Escritura externa en la BD | **Simulada** con un script | `psql` actualiza la tabla sin pasar por la API, como lo haría otro sistema o un administrador (R2) |

No se usan mocks de Redis ni de PostgreSQL: todas las fallas se provocan sobre los componentes reales.

### Scripts de falla (`scripts/`)

| Comando | Script | Efecto | Casos |
|---|---|---|---|
| `npm run falla:redis-caida` | `redis-caida.sh` | Detiene el contenedor de Redis | CP-05 |
| `npm run falla:redis-recuperar` | `redis-recuperar.sh` | Levanta Redis y espera a que responda `PING`; vuelve vacío | CP-08 |
| `npm run falla:bd-directa -- [id] [precio]` | `bd-escritura-directa.sh` | Hace `UPDATE` del precio en la BD sin pasar por la API y muestra la caché antes y después | CP-06 |
| `npm run redis:inspeccionar` | `redis-inspeccionar.sh` | Lista las llaves `producto:*` con su TTL y su valor | CP-01, CP-02, CP-04, CP-06 |
| `npm run hallazgo:cliente-redis` | `medir-cliente-redis.sh` | Compara la configuración del cliente de Redis en los escenarios detenido y congelado | Hallazgo H-01 |

Los scripts usan los nombres fijos de los contenedores (`lab-cache-redis`, `lab-cache-postgres`), así que funcionan igual con Docker y con Podman.

### Mecanismo de falla para la suite automatizada

> Pendiente — acuerdo B ↔ C (sección 7 de `estructura-trabajo.md`). Opciones: detener el contenedor desde la prueba, apuntar el cliente a un puerto inexistente o usar Testcontainers.

## 9. Herramientas seleccionadas

> Pendiente — Integrante C.

## 10. Criterios de aprobación y fallo

> Pendiente — Integrante C.

---

## Hallazgos

### H-01. Configuración del cliente de Redis ante una falla de la caché

*Responsable: Integrante B. Evidencia: `docs/evidencias/HALLAZGO-01_cliente-redis-por-defecto-vs-laboratorio.txt`.*

Se midió el tiempo de un `GET` a Redis con dos configuraciones del cliente `redis` (node-redis):

- **Por defecto:** `createClient({ url })`. Cola fuera de línea activa y sin timeout por comando.
- **Laboratorio:** `api/src/cache.ts`. `disableOfflineQueue: true`, timeout de 500 ms por comando y ninguna excepción hacia la API.

| Escenario | Por defecto | Laboratorio |
|---|---|---|
| Redis detenido (`docker stop`) | ~5 000 ms y luego lanza `TimeoutError` | ~1 ms → `ERROR` → `BYPASS` |
| Redis congelado (`docker pause`) | No responde (se cortó la medición a los 10 000 ms) | ~500 ms → `ERROR` → `BYPASS` |

**Interpretación:**

- Con la configuración por defecto, el comando entra a la cola fuera de línea y espera a que el cliente se conecte. Con Redis detenido, la petición queda bloqueada 5 s (el `connectTimeout` por defecto) y después lanza una excepción: sin manejo explícito, eso sería un error 500 aunque la BD esté disponible. Con Redis congelado, la espera no tiene límite.
- Desactivar la cola fuera de línea resuelve el caso **detenido**, porque el comando falla de inmediato. **No** resuelve el caso **congelado**: la conexión sigue abierta, así que el cliente cree estar conectado y espera la respuesta. Ese caso solo lo cubre el timeout por comando.
- Las dos medidas son necesarias. Con ambas, el peor caso de una lectura con Redis caído o lento queda acotado a `REDIS_COMMAND_TIMEOUT_MS`, por debajo del objetivo de 1 s.

## Referencias

> Cada integrante agrega las fuentes de su parte.

- Redis. *Key eviction* (`maxmemory`, `allkeys-lru`). https://redis.io/docs/latest/develop/reference/eviction/
- Redis. *Redis persistence* (RDB y AOF). https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Redis. *EXPIRE / TTL*. https://redis.io/docs/latest/commands/expire/
- node-redis. *Client configuration* (`disableOfflineQueue`, `socket.connectTimeout`, `reconnectStrategy`). https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
- Microsoft. *Cache-Aside pattern*. https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
