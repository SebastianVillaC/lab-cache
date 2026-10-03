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
| 4 | Puntos de integración | B | Pendiente |
| 5 | Riesgos identificados | B | Pendiente |
| 6 | Ambiente necesario | B | Pendiente |
| 7 | Dependencias reales y simuladas | B | Pendiente |
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

> Pendiente (B). Base: tabla PI-1 a PI-4 de `estructura-trabajo.md`, sección 4.

## 5. Riesgos identificados

> Pendiente (B). Base: riesgos R1 a R6 de `estructura-trabajo.md`, sección 4.

## 6. Ambiente necesario

> Pendiente (B).

## 7. Dependencias reales y simuladas

> Pendiente (B).

## 8. Herramientas seleccionadas

> Pendiente (C).

## 9. Datos de prueba

> Pendiente (C). Base: registros semilla de `db/init.sql`.

## 10. Criterios de aprobación y fallo

> Pendiente (C).

---

## 11. Análisis de resultados

> Pendiente (C, con aportes de A y B) — F6.

## 12. Conclusiones

> Pendiente (C, con aportes de A y B) — F6.

## 13. Referencias

> Cada integrante agrega las fuentes de su parte.
