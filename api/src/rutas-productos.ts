// Rutas /productos con patrón cache-aside (dueño: Integrante A).
// El módulo de caché no lanza excepciones (contrato A ↔ B): un fallo de Redis llega como
// status 'ERROR' y aquí se traduce en X-Cache: BYPASS.
import { Router } from 'express';
import * as cache from './cache.ts';
import * as productos from './productos.ts';
import type { Producto } from './productos.ts';
import { validarId, validarProducto } from './validacion.ts';

const router = Router();

const llave = (id: number): string => `producto:${id}`;

router.get('/:id', async (req, res) => {
  const id = validarId(req.params.id);
  if (!id.ok) {
    res.status(400).json({ error: 'id inválido', detalles: id.errores });
    return;
  }
  const key = llave(id.valor);

  const enCache = await cache.get<Producto>(key);
  if (enCache.status === 'HIT') {
    res.set('X-Cache', 'HIT').status(200).json(enCache.value);
    return;
  }
  const origen = enCache.status === 'MISS' ? 'MISS' : 'BYPASS';
  res.set('X-Cache', origen);

  const producto = await productos.buscarPorId(id.valor);
  if (!producto) {
    // No se cachean respuestas de error (R4).
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  // Con Redis caído (BYPASS) no se intenta escribir: fallaría igual y solo sumaría latencia.
  if (origen === 'MISS') {
    const escritura = await cache.set(key, producto);
    if (escritura.status === 'ERROR') {
      console.warn(`[api] no se pudo cachear ${key}:`, escritura.error.message);
    }
  }
  res.status(200).json(producto);
});

router.post('/', async (req, res) => {
  const datos = validarProducto(req.body, { stockObligatorio: false });
  if (!datos.ok) {
    res.status(400).json({ error: 'Datos inválidos', detalles: datos.errores });
    return;
  }
  // Cache-aside: la caché se llena en la lectura, no en la creación.
  const producto = await productos.crear(datos.valor);
  res.status(201).location(`/productos/${producto.id}`).json(producto);
});

router.put('/:id', async (req, res) => {
  const id = validarId(req.params.id);
  if (!id.ok) {
    res.status(400).json({ error: 'id inválido', detalles: id.errores });
    return;
  }
  const datos = validarProducto(req.body, { stockObligatorio: true });
  if (!datos.ok) {
    res.status(400).json({ error: 'Datos inválidos', detalles: datos.errores });
    return;
  }

  const producto = await productos.actualizar(id.valor, datos.valor);
  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  // Se invalida después de escribir en la BD (R1). Si falla, el dato viejo vive hasta el TTL.
  const key = llave(id.valor);
  const borrado = await cache.del(key);
  if (borrado.status === 'ERROR') {
    console.warn(
      `[api] no se pudo invalidar ${key}; quedará desactualizada hasta que venza el TTL:`,
      borrado.error.message,
    );
  }
  res.status(200).json(producto);
});

export default router;
