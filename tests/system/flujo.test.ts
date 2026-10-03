import {
  API,
  ejecutarCaso,
  iniciarSuite,
  prepararCaso,
  terminarSuite,
} from '../helpers.ts';

jest.setTimeout(30000);
beforeAll(iniciarSuite);
beforeEach(prepararCaso);
afterEach(prepararCaso);
afterAll(terminarSuite);

describe('Pruebas de sistema · servicio desplegado en proceso y contenedores reales', () => {
  test('CP-07: flujo completo crear, consultar, actualizar y volver a consultar', async () => {
    await ejecutarCaso('CP-07', 'Flujo completo de producto', 'CP-07_flujo-completo_automatizado.txt', async ({ registrar }) => {
      const crear = await API.post('/productos').send({
        nombre: 'Producto de prueba',
        precio: 12500.75,
        stock: 6,
      });
      expect(crear.status).toBe(201);
      const id = crear.body.id as number;
      const primera = await API.get(`/productos/${id}`);
      const segunda = await API.get(`/productos/${id}`);
      const actualizar = await API.put(`/productos/${id}`).send({
        nombre: 'Producto de prueba actualizado',
        precio: 15000.25,
        stock: 5,
      });
      const posterior = await API.get(`/productos/${id}`);
      const hitPosterior = await API.get(`/productos/${id}`);

      expect(primera.headers['x-cache']).toBe('MISS');
      expect(segunda.headers['x-cache']).toBe('HIT');
      expect(segunda.body).toEqual(primera.body);
      expect(actualizar.status).toBe(200);
      expect(posterior.headers['x-cache']).toBe('MISS');
      expect(posterior.body.precio).toBe(15000.25);
      expect(hitPosterior.headers['x-cache']).toBe('HIT');
      expect(hitPosterior.body).toEqual(posterior.body);

      registrar(`POST HTTP ${crear.status}; recurso creado con id=${id}`);
      registrar(`GET: MISS → HIT; contenido idéntico`);
      registrar(`PUT HTTP ${actualizar.status}; invalidación verificada`);
      registrar(`GET tras actualizar: MISS → HIT; precio=${hitPosterior.body.precio}`);
    });
  });
});
