// Hallazgo de B: tiempo de un GET a Redis cuando la caché falla, con dos configuraciones del cliente.
//
//   - Por defecto: createClient({ url }) sin más opciones. La cola fuera de línea está activa y no
//     hay timeout por comando, así que el comando espera a que Redis vuelva.
//   - Laboratorio: el módulo api/src/cache.ts (cola desactivada + timeout por comando).
//
// Se ejecuta con Redis ya en falla (lo prepara scripts/medir-cliente-redis.sh):
//   node --env-file-if-exists=.env scripts/medir-cliente-redis.ts <detenido|congelado>
import { createClient } from 'redis';
import config from '../api/src/config.ts';
import * as cache from '../api/src/cache.ts';

// Tope de espera para la configuración por defecto; sin él la medición no terminaría nunca.
const TOPE_MS = 10_000;
const REPETICIONES = 3;
const escenario = process.argv[2] ?? 'detenido';

type Medicion = { ms: number; resultado: string };

async function medir(op: () => Promise<string>): Promise<Medicion> {
  const inicio = performance.now();
  let tope: NodeJS.Timeout | undefined;
  const resultado = await Promise.race([
    // Algunos errores de node-redis llegan con message vacío (TimeoutError, AggregateError).
    op().catch((err: Error & { code?: string }) => `excepción: ${err.message || err.code || err.constructor.name}`),
    new Promise<string>((resolve) => {
      tope = setTimeout(() => resolve(`sin respuesta tras ${TOPE_MS} ms`), TOPE_MS);
    }),
  ]).finally(() => clearTimeout(tope));
  return { ms: Math.round(performance.now() - inicio), resultado };
}

const silenciar = () => {}; // los errores de conexión ya se esperan; no ensucian la salida

// Configuración por defecto
const porDefecto = createClient({ url: config.redisUrl });
porDefecto.on('error', silenciar);
porDefecto.connect().catch(silenciar);

// Configuración del laboratorio: el módulo ya registra su propio listener de errores.
console.error = silenciar;
cache.connect();

// Margen para que ambos clientes intenten conectarse antes de medir. En el escenario congelado,
// el .sh pausa Redis 1 s después del arranque: se espera a que eso ya haya ocurrido.
await new Promise((r) => setTimeout(r, escenario === 'congelado' ? 2500 : 500));

const filas: Array<{ configuracion: string; intento: number } & Medicion> = [];
for (let i = 1; i <= REPETICIONES; i++) {
  const d = await medir(async () => `valor: ${await porDefecto.get('producto:1')}`);
  filas.push({ configuracion: 'por defecto', intento: i, ...d });
  const l = await medir(async () => {
    const r = await cache.get('producto:1');
    return r.status === 'ERROR' ? `ERROR (${r.error.message}) → BYPASS` : r.status;
  });
  filas.push({ configuracion: 'laboratorio', intento: i, ...l });
}

console.log(`\nEscenario: Redis ${escenario} · timeout por comando = ${config.redisCommandTimeoutMs} ms\n`);
console.table(filas);

porDefecto.destroy();
await cache.close();
process.exit(0);
