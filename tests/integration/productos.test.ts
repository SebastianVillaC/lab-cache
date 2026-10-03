import {
  API,
  CACHE_TTL_SEGUNDOS,
  db,
  ejecutarCaso,
  iniciarSuite,
  prepararCaso,
  terminarSuite,
  adminRedis,
  cache,
} from '../helpers.ts';

beforeAll(iniciarSuite);
beforeEach(prepararCaso);
afterEach(prepararCaso);
afterAll(terminarSuite);

describe('Pruebas de integración · API, Redis y PostgreSQL', () => {
  test('CP-01: primera lectura MISS y segunda HIT con contenido idéntico', async () => {
    await ejecutarCaso('CP-01', 'MISS y HIT devuelven el mismo producto', 'CP-01_miss-hit-identicos_automatizado.txt', async ({ registrar }) => {
      const primera = await API.get('/productos/1');
      const segunda = await API.get('/productos/1');
      const ttl = await adminRedis.ttl(cache.claveProducto(1));

      expect(primera.status).toBe(200);
      expect(primera.headers['x-cache']).toBe('MISS');
      expect(segunda.status).toBe(200);
      expect(segunda.headers['x-cache']).toBe('HIT');
      expect(segunda.body).toEqual(primera.body);
      expect(typeof primera.body.precio).toBe('number');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(CACHE_TTL_SEGUNDOS);

      registrar(`Primera lectura: HTTP ${primera.status}, X-Cache=${primera.headers['x-cache']}`);
      registrar(`Segunda lectura: HTTP ${segunda.status}, X-Cache=${segunda.headers['x-cache']}`);
      registrar(`Cuerpo idéntico; precio es number; TTL observado=${ttl} s`);
    });
  });

  test('CP-02: PUT invalida la caché y la lectura posterior devuelve el dato nuevo', async () => {
    await ejecutarCaso('CP-02', 'PUT invalida la caché', 'CP-02_invalidacion-tras-put_automatizado.txt', async ({ registrar }) => {
      await API.get('/productos/2');
      const actualizacion = await API.put('/productos/2').send({
        nombre: 'Mouse inalámbrico',
        precio: 60900.5,
        stock: 40,
      });
      const llaveInvalidada = await adminRedis.exists(cache.claveProducto(2));
      const lectura = await API.get('/productos/2');

      expect(actualizacion.status).toBe(200);
      expect(llaveInvalidada).toBe(0);
      expect(lectura.status).toBe(200);
      expect(lectura.headers['x-cache']).toBe('MISS');
      expect(lectura.body.precio).toBe(60900.5);

      registrar(`PUT: HTTP ${actualizacion.status}; llave invalidada=${llaveInvalidada === 0}`);
      registrar(`GET posterior: HTTP ${lectura.status}, X-Cache=${lectura.headers['x-cache']}, precio=${lectura.body.precio}`);
    });
  });

  test('CP-03: datos inválidos responden 400 y no alteran la caché ni la BD', async () => {
    await ejecutarCaso('CP-03', 'Validación de POST y PUT inválidos', 'CP-03_validacion-datos_automatizado.txt', async ({ registrar }) => {
      const inicial = await API.get('/productos/1');
      const post = await API.post('/productos').send({ nombre: '', precio: -1, stock: -1 });
      const put = await API.put('/productos/1').send({ nombre: '', precio: -1, stock: -1 });
      const final = await API.get('/productos/1');
      const conteo = await db.query<{ total: string }>('SELECT count(*)::text AS total FROM productos');

      expect(inicial.headers['x-cache']).toBe('MISS');
      expect(post.status).toBe(400);
      expect(put.status).toBe(400);
      expect(final.headers['x-cache']).toBe('HIT');
      expect(final.body).toEqual(inicial.body);
      expect(conteo.rows[0]?.total).toBe('4');

      registrar(`POST inválido: HTTP ${post.status}`);
      registrar(`PUT inválido: HTTP ${put.status}`);
      registrar(`Caché intacta (HIT) y productos en BD=${conteo.rows[0]?.total}`);
    });
  });

  test('CP-04: producto inexistente responde 404 y no se cachea', async () => {
    await ejecutarCaso('CP-04', '404 no se guarda en Redis', 'CP-04_producto-inexistente_automatizado.txt', async ({ registrar }) => {
      const respuesta = await API.get('/productos/999999');
      const llaveExiste = await adminRedis.exists(cache.claveProducto(999999));

      expect(respuesta.status).toBe(404);
      expect(llaveExiste).toBe(0);

      registrar(`GET inexistente: HTTP ${respuesta.status}; llave en Redis=${llaveExiste}`);
    });
  });
});
