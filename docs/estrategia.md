# Estrategia de pruebas — Arquitectura con caché

**Asignatura:** Aseguramiento de la Calidad del Software
**Tema:** Pruebas de una arquitectura con caché (integración entre aplicación, caché y base de datos)
**Integrantes:** Integrante A · Integrante B · Integrante C

> La estrategia se define **antes** de ejecutar las pruebas (F2). Las secciones 11 a 13 se completan después de F5 y F6.

| # | Elemento | Responsable | Estado |
|---|---|---|---|
| 1 | Objetivo de las pruebas | A | Borrador |
| 2 | Componentes incluidos | A | Borrador |
| 3 | Alcance y exclusiones | A | Borrador |
| 4 | Puntos de integración | B | Borrador |
| 5 | Riesgos identificados | B | Borrador |
| 6 | Ambiente necesario | B | Borrador |
| 7 | Dependencias reales y simuladas | B | Borrador |
| 8 | Herramientas seleccionadas | C | Pendiente |
| 9 | Datos de prueba | C | Pendiente |
| 10 | Criterios de aprobación y fallo | C | Pendiente |

---

## 1. Objetivo de las pruebas

Verificar que la API de productos se integra correctamente con su caché (Redis) y su base de datos (PostgreSQL) bajo el patrón *cache-aside*. Para eso se comprueban los cuatro comportamientos que exige el enunciado:

1. **Consulta.** La primera lectura de un producto es un *cache miss* resuelto desde PostgreSQL y la siguiente es un *cache hit* resuelto desde Redis, con **el mismo contenido** en ambas respuestas.
2. **Actualización e invalidación.** Al modificar un producto por la API se borra su llave en Redis, y la siguiente lectura refleja el valor nuevo.
3. **Falla de la caché.** Si Redis no está disponible, la API sigue respondiendo desde PostgreSQL (`X-Cache: BYPASS`), sin errores 500 y sin quedarse bloqueada.
4. **Datos desactualizados.** Cuando un dato se modifica directamente en la BD sin pasar por la API, se detecta la inconsistencia y se muestra cómo la mitigan el TTL y la invalidación.

Las pruebas buscan evidencia verificable del **origen** de cada respuesta. Por eso la API expone el header `X-Cache: HIT | MISS | BYPASS` y registra en su log el método, la ruta, el estado, el valor de `X-Cache` y el tiempo de cada petición.

## 2. Componentes incluidos

| Componente | Tecnología | Responsabilidad en la arquitectura |
|---|---|---|
| API REST | Node.js 24 LTS, Express 5, TypeScript | Expone `/productos` y `/health`, valida la entrada, aplica cache-aside, invalida tras escribir y degrada a la BD si falla la caché. |
| Caché | Redis 7.4 (cliente oficial `redis`) | Guarda cada producto bajo la llave `producto:{id}` con un TTL configurable (`CACHE_TTL_SECONDS`). No persiste en disco, tiene memoria acotada (64 MB) y desaloja con `allkeys-lru`. |
| Base de datos | PostgreSQL 17 (cliente `pg`) | Es la fuente de verdad. Contiene la tabla `productos`, con restricciones `CHECK` sobre nombre, precio y stock. |
| Cliente / suite de pruebas | Jest + Supertest, `curl` | Ejercitan la API por HTTP y verifican códigos, cuerpo y `X-Cache`. |

Redis y PostgreSQL corren en contenedores definidos en `compose.yaml`; la API corre en el equipo local.

## 3. Alcance y exclusiones

**Dentro del alcance**

- El contrato HTTP de `GET /productos/:id`, `POST /productos`, `PUT /productos/:id` y `GET /health`: códigos 200, 201, 400, 404 y el header `X-Cache`.
- La integración API ↔ Redis: lectura, escritura con TTL, invalidación y tratamiento de errores.
- La integración API ↔ PostgreSQL: consultas parametrizadas y normalización de tipos (`NUMERIC` → número) antes de cachear.
- La coherencia entre Redis y PostgreSQL, observada a través de la API.
- La degradación controlada y la recuperación cuando Redis cae y vuelve.
- La validación de entrada: datos inválidos no llegan a la BD ni a la caché, y las respuestas de error no se cachean.

**Fuera del alcance**

- Pruebas de carga, estrés y rendimiento sostenido. Solo se miden tiempos individuales de HIT, MISS y BYPASS como apoyo al análisis.
- Seguridad: autenticación, autorización y pruebas de penetración.
- Alta disponibilidad de Redis o PostgreSQL (Sentinel, Cluster, réplicas) y caída de PostgreSQL como escenario principal. Si cae la BD, la API responde 500 sin bloquearse, pero ese caso no forma parte de los casos de prueba.
- Operaciones fuera del contrato: `DELETE`, listados, paginación y búsqueda.
- Interfaz de usuario. El laboratorio solo expone una API.
- Pruebas unitarias aisladas. El foco de la actividad son las pruebas de integración y de sistema.

## 4. Puntos de integración

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

## 5. Riesgos identificados

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

## 6. Ambiente necesario

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

## 7. Dependencias reales y simuladas

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

### Escenarios de B (`scripts/escenarios/`)

Cada escenario ejecuta un caso completo sobre la API en marcha (`npm start`) y el stack real. Verifica cada paso, restaura los datos que modifica (aunque el caso falle a mitad) y termina con `APROBADO` o `FALLIDO` y el código de salida correspondiente. Si se define `API_LOG` con la ruta del log de la API (`npm start > api.log`), el escenario anexa las líneas que la API registró durante el caso. Estos scripts son también el guion de la demostración.

| Comando | Caso | Duración | Evidencia |
|---|---|---|---|
| `npm run escenario:cp-02` | CP-02 · Invalidación tras PUT | ~1 s | `docs/evidencias/CP-02_invalidacion-tras-put.txt` |
| `npm run escenario:cp-05` | CP-05 · Redis caído → BYPASS | ~1 s | `docs/evidencias/CP-05_redis-caido-bypass.txt` |
| `npm run escenario:cp-06` | CP-06 · Dato desactualizado hasta que vence el TTL | ≈ `CACHE_TTL_SECONDS` | `docs/evidencias/CP-06_dato-desactualizado-ttl.txt` |
| `npm run escenario:cp-08` | CP-08 · Recuperación de Redis | ~2 s | `docs/evidencias/CP-08_recuperacion-redis.txt` |

Precondición común: todos los casos esperan a que `/health` reporte `redis = up` antes de empezar. Al ejecutarlos seguidos, el cliente de la API tarda hasta 2 s en reconectarse después de que el caso anterior vuelve a levantar Redis. Sin esa espera, el caso siguiente empezaba en `BYPASS`: un falso fallo causado por la preparación de la prueba y no por el sistema.

### Mecanismo de falla para la suite automatizada

> Pendiente — acuerdo B ↔ C (sección 7 de `estructura-trabajo.md`).

**Propuesta de B:** detener y levantar el contenedor real desde la prueba (`docker stop` / `docker start lab-cache-redis` con `child_process`), y antes de cada caso esperar a que `/health` reporte `redis = up`. Es el mismo mecanismo de los escenarios, ya validado. Comparado con las otras opciones:

- **Apuntar el cliente a un puerto inexistente:** solo reproduce el caso de conexión rechazada desde el arranque. No reproduce una caída en caliente ni la recuperación (CP-08), y obliga a crear el cliente de otra forma en las pruebas.
- **Testcontainers:** aísla mejor, pero agrega una dependencia y su integración con Podman requiere configuración adicional (socket de Podman).

## 8. Herramientas seleccionadas

> Pendiente (C).

## 9. Datos de prueba

> Pendiente (C). Base: registros semilla de `db/init.sql`.

## 10. Criterios de aprobación y fallo

> Pendiente (C).

---

## 11. Análisis de resultados

> Pendiente (C, con aportes de A y B) — F6.

### Hallazgo H-01. Configuración del cliente de Redis ante una falla de la caché

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

## 12. Conclusiones

> Pendiente (C, con aportes de A y B) — F6.

## 13. Referencias

> Cada integrante agrega las fuentes de su parte.

- Redis. *Key eviction* (`maxmemory`, `allkeys-lru`). https://redis.io/docs/latest/develop/reference/eviction/
- Redis. *Redis persistence* (RDB y AOF). https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Redis. *EXPIRE / TTL*. https://redis.io/docs/latest/commands/expire/
- node-redis. *Client configuration* (`disableOfflineQueue`, `socket.connectTimeout`, `reconnectStrategy`). https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
- Microsoft. *Cache-Aside pattern*. https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
