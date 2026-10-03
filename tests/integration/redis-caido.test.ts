import { performance } from 'node:perf_hooks';
import {
  API,
  REDIS_CONTAINER,
  comandoDocker,
  ejecutarCaso,
  iniciarSuite,
  prepararCaso,
  restaurarRedis,
  terminarSuite,
} from '../helpers.ts';

jest.setTimeout(30000);
beforeAll(iniciarSuite);
beforeEach(prepararCaso);
afterEach(async () => {
  await restaurarRedis();
  await prepararCaso();
});
afterAll(terminarSuite);

describe('Pruebas de integración · degradación de Redis', () => {
  test('CP-05: Redis detenido produce BYPASS desde PostgreSQL en menos de 1 s', async () => {
    await ejecutarCaso(
      'CP-05',
      'Degradación controlada con Redis detenido',
      'CP-05_redis-caido-bypass_automatizado.txt',
      async ({ registrar }) => {
        await API.get('/productos/3');
        const detener = comandoDocker(['stop', '--timeout', '0', REDIS_CONTAINER]);
        registrar(`Contenedor detenido: ${detener}`);
        try {
          const inicio = performance.now();
          const respuesta = await API.get('/productos/3');
          const duracion = performance.now() - inicio;

          expect(respuesta.status).toBe(200);
          expect(respuesta.headers['x-cache']).toBe('BYPASS');
          expect(respuesta.body.id).toBe(3);
          expect(duracion).toBeLessThan(1000);

          registrar(
            `GET: HTTP ${respuesta.status}, X-Cache=${respuesta.headers['x-cache']}, ${duracion.toFixed(2)} ms`,
          );
          registrar(`Producto servido desde PostgreSQL: id=${respuesta.body.id}, precio=${respuesta.body.precio}`);
        } finally {
          await restaurarRedis();
          registrar('Redis levantado nuevamente y conexión verificada');
        }
      },
    );
  });
});
