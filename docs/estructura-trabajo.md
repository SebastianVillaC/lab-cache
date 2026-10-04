# Estructuración del trabajo — Pruebas de una arquitectura con caché

**Asignatura:** Aseguramiento de la Calidad del Software
**Actividad:** Exposición y laboratorio — Estrategias de pruebas de integración y de sistema
**Tema asignado:** Pruebas de una arquitectura con caché
**Enfoque:** Integración entre aplicación, caché y base de datos
**Integrantes:** Integrante A · Integrante B · Integrante C

---

## 1. Qué se debe demostrar

El enunciado exige montar una API que use una caché y una base de datos, y demostrar cuatro comportamientos:

1. **Consulta.** El primer acceso a un recurso es un *cache miss* y se resuelve desde la base de datos; el siguiente es un *cache hit* y se resuelve desde la caché.
2. **Actualización e invalidación.** Al modificar un dato, la entrada en caché se invalida y la siguiente lectura refleja el cambio.
3. **Falla de la caché.** Si la caché no está disponible, la API sigue respondiendo desde la base de datos (degradación controlada) y no devuelve error 500 ni se queda bloqueada.
4. **Datos desactualizados.** Se provoca una inconsistencia entre caché y base de datos (escritura directa en la BD sin pasar por la API) y se muestra cómo se detecta y cómo se mitiga (TTL, invalidación).

Requisitos generales de la guía que aplican:

- Laboratorio pequeño y funcional, con 2 o 3 componentes principales, ejecutado en local con tecnologías gratuitas.
- Estrategia de pruebas definida **antes** de ejecutar las pruebas (sección 7).
- Mínimo 5 casos propios, con los 12 campos de la sección 9, cada uno clasificado como **integración** o **sistema**.
- Mínimo 3 casos automatizados: uno exitoso, uno de validación o error funcional y uno de falla técnica o de integración.
- Exposición de 20 minutos en la que participan los tres integrantes. El docente puede preguntar a cualquiera sobre cualquier parte del código, la configuración o los casos (secciones 3 y 15).

---

## 2. Arquitectura

```
Cliente / Tests ──HTTP──▶ API REST (Node + Express) ──▶ Redis (caché)
                                     │
                                     └──────────────▶ PostgreSQL (BD)
```

Patrón **cache-aside**:

- **Lectura:** la API consulta Redis. Si no encuentra la llave, lee de PostgreSQL, guarda el resultado en Redis con TTL y responde.
- **Escritura:** la API escribe en PostgreSQL y luego borra la llave en Redis.
- **Fallo de Redis:** la API captura el error y lee directamente de PostgreSQL.

Cada respuesta incluye el header `X-Cache: HIT | MISS | BYPASS` para que el origen del dato sea verificable en las pruebas y visible en la demo.

### Stack tentativo

| Pieza | Elección |
|---|---|
| API | Node 24 LTS + Express 5 + TypeScript 7 (Node ejecuta los `.ts` directamente; `tsc` solo revisa tipos) |
| Cliente de caché | `redis` (node-redis, cliente oficial) |
| Cliente de BD | `pg` |
| Pruebas | Jest + Supertest (TS mediante `@swc/jest`) |
| Infraestructura | `compose.yaml` con Redis 7 y PostgreSQL 17 |

### Contrato de la API (a confirmar en F2)

Se fija antes de programar para que A, B y C trabajen en paralelo.

| Método | Ruta | Respuestas esperadas |
|---|---|---|
| GET | `/productos/:id` | 200 con `X-Cache` · 404 si no existe · 400 si el id no es válido |
| POST | `/productos` | 201 · 400 si los datos son inválidos |
| PUT | `/productos/:id` | 200 e invalidación de la llave · 400 · 404 |
| GET | `/health` | 200 con el estado de Redis y de PostgreSQL |

Formato de llave en Redis: `producto:{id}`.

---

## 3. Fases del trabajo

| Fase | Contenido | Estado |
|---|---|---|
| F1. Definición | Tema, arquitectura, stack, reparto | Completa; diagramas en `docs/arquitectura/` |
| F2. Estrategia de pruebas | Documento con los 10 elementos de la sección 7 | Completa; verificación conjunta pendiente |
| F3. Diseño de casos | Matriz de 8 casos con 12 campos, trazados a riesgos | Completa en `docs/matriz-casos.xlsx` |
| F4. Laboratorio | Código de la API, compose, scripts y guía de inicio | Infraestructura lista; `README.md` agregado |
| F5. Automatización y ejecución | Al menos 3 casos automatizados, evidencias | Completa: 6 automatizados y 2 escenarios manuales |
| F6. Análisis | Resultados obtenidos, hallazgos, conclusiones | Completa en `docs/estrategia.md` |
| F7. Exposición | Diapositivas, video de respaldo, ensayo cronometrado | Pendiente |

Orden obligatorio: F2 y F3 antes que F5. F4 puede avanzar en paralelo con F3 una vez fijado el contrato de la API.

### Hitos

| Hito | Fecha | Condición de cierre |
|---|---|---|
| H1. Estrategia y matriz | — | F2 y F3 completadas por C; revisión de los tres pendiente |
| H2. Laboratorio funcionando | — | `docker compose up` + API responden a los 4 comportamientos |
| H3. Suite automatizada y evidencias | — | 6 pruebas automatizadas pasan; 8 casos tienen evidencia |
| H4. Documento y presentación | — | Estrategia, matriz y resultados completados; diapositivas y guiones de la exposición pendientes |
| H5. Ensayo y video de respaldo | — | Pendiente de grabación y ensayo por el equipo |

---

## 4. Trazabilidad: riesgo → punto de integración → caso

### Puntos de integración

| ID | Punto | Qué se valida |
|---|---|---|
| PI-1 | API ↔ Redis | Lectura, escritura, borrado y TTL de llaves |
| PI-2 | API ↔ PostgreSQL | Consultas, inserciones y actualizaciones |
| PI-3 | Cliente ↔ API | Contrato HTTP, códigos de estado y header `X-Cache` |
| PI-4 | Coherencia Redis ↔ PostgreSQL | Que la caché no sirva datos distintos a los de la BD (indirecta, a través de la API) |

### Riesgos

| ID | Riesgo | Punto | Casos |
|---|---|---|---|
| R1 | Dato no invalidado tras una actualización | PI-1, PI-4 | CP-02 |
| R2 | Dato desactualizado por escrituras fuera de la API | PI-4 | CP-06 |
| R3 | Caída o lentitud de Redis bloquea o tumba la API | PI-1 | CP-05, CP-08 |
| R4 | Se cachean datos inválidos o respuestas de error | PI-1, PI-3 | CP-03, CP-04 |
| R5 | Respuesta de un HIT distinta a la de un MISS por serialización (`pg` devuelve `NUMERIC` como string) | PI-1, PI-2 | CP-01 |
| R6 | TTL ausente o mal configurado (entradas que nunca expiran) | PI-1 | CP-06 |

### Casos candidatos

| ID | Escenario | Tipo | Categoría exigida | Automatizado |
|---|---|---|---|---|
| CP-01 | Primera consulta MISS, segunda HIT, con contenido idéntico | Integración | Exitoso | **Obligatorio** |
| CP-02 | PUT invalida la llave y el GET posterior devuelve el valor nuevo | Integración | Exitoso | Sí |
| CP-03 | Datos inválidos en POST/PUT devuelven 400 y la caché no cambia | Integración | Validación | **Obligatorio** |
| CP-04 | Producto inexistente devuelve 404 y no se guarda nada en caché | Integración | Error funcional | Sí |
| CP-05 | Redis caído: la API responde 200 desde la BD con `X-Cache: BYPASS` | Integración | Falla técnica | **Obligatorio** |
| CP-06 | Escritura directa en BD: la caché sirve el dato viejo hasta que vence el TTL | Integración | Falla de integración | Opcional |
| CP-07 | Flujo completo crear → consultar → actualizar → consultar sobre el stack levantado | Sistema | Exitoso | Sí |
| CP-08 | Recuperación: Redis vuelve, la siguiente lectura es MISS y luego HIT | Sistema | Falla técnica | Opcional |

### Formato de la matriz (sección 9)

Cada caso se registra con estos 12 campos: Identificador · Nombre · Tipo de prueba · Objetivo · Componentes involucrados · Precondiciones · Datos de entrada · Procedimiento · Resultado esperado · Resultado obtenido · Evidencia · Estado.

Los campos *Resultado obtenido*, *Evidencia* y *Estado* se llenan en F5, después de ejecutar.

---

## 5. Mapeo de entregables (sección 12)

| # | Entregable | Artefacto | Ubicación | Responsable | Fase |
|---|---|---|---|---|---|
| 1 | Presentación | Diapositivas | `docs/presentacion/` | Los tres | F7 |
| 2 | Diagrama de arquitectura | Componentes + secuencias | `docs/arquitectura/` | A | F1 |
| 3 | Estrategia de pruebas | Documento | `docs/estrategia.md` | Los tres (por secciones) | F2 |
| 4 | Matriz de casos | Tabla de 12 campos | `docs/matriz-casos.xlsx` | C | F3–F5 |
| 5 | Código fuente | API y pruebas | `api/`, `tests/` | A, B, C | F4–F5 |
| 6 | Scripts y configuración | Compose, env, scripts de falla | raíz, `scripts/` | B | F4 |
| 7 | Instrucciones | Guía de instalación y ejecución | `README.md` | C | F4 |
| 8 | Evidencias | Reportes, logs, capturas | `docs/evidencias/` | C (B aporta las de fallas) | F5 |
| 9 | Análisis y conclusiones | Sección del documento | `docs/estrategia.md` | C (aportes de A y B) | F6 |
| 10 | Referencias | Sección del documento | `docs/estrategia.md` | Los tres | Transversal |

### Estructura de la entrega

```
lab-cache/
├── README.md               ← entregable 7
├── compose.yaml            ← 6
├── .env.example
├── db/init.sql
├── api/                    ← 5
├── tests/
│   ├── integration/
│   └── system/
├── scripts/                ← escenarios de falla
└── docs/
    ├── arquitectura/       ← 2
    ├── estrategia.md       ← 3, 9, 10
    ├── matriz-casos.xlsx   ← 4
    ├── evidencias/         ← 8
    └── presentacion/       ← 1
```

Las pruebas se separan en `integration/` y `system/` para que la clasificación exigida en la sección 4 de la guía quede visible en el código.

---

## 6. Responsabilidades por integrante

### Integrante A — API y persistencia

**Estado de entregables (4 de octubre de 2026):** F1, F2 y F4 completadas.
- **F1:** diagrama de componentes y cuatro diagramas de secuencia en `docs/arquitectura/` (PNG exportados desde draw.io).
- **F2:** secciones 1 a 3 de `docs/estrategia.md` (objetivo, componentes, alcance y exclusiones) y referencias de la parte de A.
- **F4:** endpoints del contrato, acceso a datos parametrizado, validación, normalización de tipos, middleware de errores y log por petición (`api/src/`). CP-01, CP-03, CP-04 y CP-07 los verifican.
- **Pendiente:** revisión cruzada del código de B, diapositivas del segmento de A y ensayo.

**Rol:** dueño de la aplicación y de su integración con PostgreSQL (PI-2, PI-3).

**F1. Definición**
- Elaborar el diagrama de componentes (cliente/tests, API, Redis, PostgreSQL).
- Elaborar los diagramas de secuencia de cuatro flujos: lectura con MISS, lectura con HIT, escritura con invalidación, lectura con Redis caído.

**F2. Estrategia** — redactar:
- Objetivo de las pruebas.
- Componentes incluidos.
- Alcance y exclusiones.

**F4. Laboratorio**
- Implementar los endpoints del contrato (`GET`, `POST`, `PUT /productos`, `GET /health`).
- Implementar el acceso a datos con `pg`, usando consultas parametrizadas.
- Validar la entrada y responder 400 o 404 según corresponda.
- Normalizar los tipos (`NUMERIC` → número) en un solo punto, antes de cachear y antes de responder (mitiga R5).
- Implementar un middleware de errores y un log por petición que registre método, ruta, estado, `X-Cache` y tiempo.
- Consumir el módulo de caché de B únicamente a través de la interfaz acordada (ver sección 7).

**F5. Ejecución** — apoyar a C en CP-04 y CP-07.

**Exposición**
- Presentación del tema y la arquitectura (3 min).
- En la demo: flujo exitoso (CP-01 y CP-07).

**Debe poder explicar:**
- Diferencia entre cache-aside, write-through y write-behind, y por qué se eligió cache-aside.
- Por qué se invalida la llave en lugar de actualizarla en la escritura.
- Uso de consultas parametrizadas.
- Códigos HTTP usados y su significado.
- Flujo completo de una petición a través de los diagramas de secuencia.

**Terminado cuando:** los endpoints responden según el contrato, el HIT y el MISS devuelven JSON idéntico y los diagramas están en `docs/arquitectura/`.

---

### Integrante B — Caché y escenarios de falla

**Rol:** dueño de la integración con Redis (PI-1) y de la coherencia caché–BD (PI-4).

**F2. Estrategia** — redactar:
- Puntos de integración.
- Riesgos identificados.
- Ambiente necesario.
- Dependencias reales y simuladas.

**F4. Laboratorio**
- Implementar el módulo de caché con `redis` (node-redis):
  - Conexión configurada con `disableOfflineQueue: true`, timeout por comando y listener `client.on("error", ...)`.
  - Llaves `producto:{id}` con TTL leído de `CACHE_TTL_SECONDS`.
  - Invalidación (`DEL`) después de cada escritura.
  - Ninguna excepción hacia la API: ante un fallo de Redis, el módulo retorna un estado que la API traduce en `BYPASS`.
  - Una entrada corrupta (JSON inválido) se trata como MISS y se borra.
- Mantener `compose.yaml`, `.env.example` y `db/init.sql`.
- Crear los scripts de falla en `scripts/`:
  - Detener y levantar Redis.
  - Escritura directa en la BD.
  - Inspección de llaves y TTL.

**Hallazgo a documentar:** medir el tiempo de respuesta con Redis caído en dos configuraciones:
- Por defecto (cola fuera de línea activa): la petición queda bloqueada.
- Configurada (cola desactivada + timeout): degrada a `BYPASS`.

Este resultado alimenta el análisis de F6.

**F5. Ejecución** — preparar y ejecutar los escenarios CP-02, CP-05, CP-06 y CP-08, y entregar a C las evidencias (logs de la API, salidas de `redis-cli` y `psql`).

**Exposición**
- Explicación de la estrategia y los casos (5 min).
- En la demo: caída de Redis y recuperación (CP-05 y CP-08); dato desactualizado (CP-06) si el tiempo lo permite.

**Debe poder explicar:**
- TTL y su papel como mitigación de datos desactualizados.
- Política de desalojo LRU y por qué `maxmemory` está acotado.
- Por qué la caché no tiene persistencia en disco.
- Qué es la cola fuera de línea del cliente y por qué se desactivó.
- Cada línea de `compose.yaml`.
- Cómo se provoca cada falla.

**Terminado cuando:** con Redis detenido la API responde 200 con `BYPASS` en menos de 1 s, los scripts reproducen cada escenario de falla y la comparación de configuraciones está medida.

---

### Integrante C — Automatización, evidencias y documentación de pruebas

**Estado de entregables (3 de octubre de 2026):** implementación y documentación completadas; revisión conjunta, grabación y exposición presencial quedan a cargo del equipo.

**F2. Estrategia — completada** en `docs/estrategia.md`: herramientas, datos de prueba y criterios de aprobación/fallo están documentados.

**F3. Casos — completada** en `docs/matriz-casos.xlsx`: ocho casos contienen los 12 campos, trazabilidad a riesgos y puntos de integración, clasificación integración/sistema y resultado, evidencia y estado.

**F4. Guía — completada** en `README.md`: prerequisitos, instalación, arranque, pruebas, límites destructivos del entorno local y reproducción de los escenarios Bash.

**F5. Automatización y ejecución — completada**
- Jest + Supertest separados en `tests/integration/` y `tests/system/`.
- `tests/helpers.ts` prepara y restaura Redis y las cuatro filas semilla antes y después de cada caso; la suite corre secuencialmente con `--runInBand`.
- Automatizados CP-01, CP-02, CP-03, CP-04, CP-05 y CP-07 con PostgreSQL y Redis reales. CP-05 detiene el contenedor y siempre lo restaura.
- Reporte JSON propio en `docs/evidencias/reporte-jest.json`; una evidencia por caso automatizado en `docs/evidencias/`. CP-02, CP-05, CP-06 y CP-08 tienen además las evidencias de los guiones manuales.
- Ejecución comprobada: 3 suites y 6 pruebas aprobadas; `npm run typecheck` pasa.

**F6. Análisis — completado** en `docs/estrategia.md`: tabla esperado/obtenido, mediciones puntuales HIT/MISS/BYPASS, hallazgo H-01, límites y conclusiones.

**Exposición — pendiente (F7):** guion y diapositivas del segmento de resultados, hallazgos y conclusiones (3 min). La integración de diapositivas al material común, la ejecución presencial de la demo, el ensayo y la grabación del video de respaldo quedan pendientes para el equipo.

**Conceptos para explicar:** integración comprueba colaboraciones API–BD–Redis; sistema valida el flujo real con los contenedores. El estado inicial se restablece con `FLUSHDB` y truncado/siembra de la tabla. CP-05 detiene el contenedor Docker real y verifica 200/BYPASS en menos de un segundo. El reporte JSON indica suites, casos, duración y mensajes de fallo; el código de salida distinto de cero señala una ejecución fallida.

---

### Tareas compartidas

- **Revisión cruzada de código.** Pendiente: A revisa la parte de B, B la de C y C la de A; el equipo debe confirmar que todos pueden responder preguntas sobre las tres partes (secciones 3 y 15 de la guía).
- **Referencias.** Completas en `docs/estrategia.md`, sección 13: B aportó las de Redis y cache-aside, C las de Jest y Supertest, y A las de Express, node-postgres y HTTP.
- **Presentación.** Pendiente: cada integrante arma las diapositivas de su segmento y luego se integran y revisan en `docs/presentacion/`.
- **Ensayo.** Pendiente: ensayo completo cronometrado, con el laboratorio desde cero en otro equipo.
- **Copia de respaldo.** El equipo debe preparar el repositorio y la carpeta comprimida para el día de la exposición.

---

## 7. Dependencias entre integrantes

| Acuerdo | Entre | Momento | Contenido |
|---|---|---|---|
| Contrato de la API | A ↔ C | Antes de F4 | Rutas, códigos de estado, cuerpo de respuesta, header `X-Cache` |
| Interfaz del módulo de caché | A ↔ B | Antes de F4 | `get(key)`, `set(key, value, ttl)`, `del(key)`; no lanzan excepciones y retornan un estado que indica HIT, MISS o fallo |
| Mecanismo de falla en pruebas | B ↔ C | Inicio de F5 | Acordado e implementado: detener/restaurar `lab-cache-redis` con Docker desde CP-05 |
| Datos de prueba | A ↔ C | F3 | Registros semilla de `init.sql` y estado esperado antes de cada caso |

---

## 8. Distribución de la exposición (20 min)

| Momento | Tiempo | Responsable |
|---|---|---|
| Presentación del tema y la arquitectura | 3 min | A |
| Estrategia y casos de prueba | 5 min | B |
| Demostración del laboratorio | 8 min | A (flujo exitoso) · B (caída y recuperación de Redis) · C (suite y reporte) |
| Resultados, hallazgos y conclusiones | 3 min | C |
| Preguntas | 1 min | Los tres |