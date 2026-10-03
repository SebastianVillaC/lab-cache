import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createClient } from 'redis';
import request from 'supertest';
import app from '../api/src/app.ts';
import * as cache from '../api/src/cache.ts';
import config from '../api/src/config.ts';
import * as db from '../api/src/db.ts';

export const API = request(app);
export const REDIS_CONTAINER = 'lab-cache-redis';
export const PRODUCTO_SEMILLA = {
  id: 1,
  nombre: 'Teclado mecánico',
  precio: 189900,
  stock: 15,
};

const evidenciaDir = resolve('docs/evidencias');
const adminRedis = createClient({ url: config.redisUrl });
adminRedis.on('error', (error: Error) => {
  console.error('[tests] error en el cliente administrativo de Redis:', error.message);
});

export async function iniciarSuite(): Promise<void> {
  await db.ping();
  await adminRedis.connect();
  cache.connect();
  await esperarRedis();
}

export async function terminarSuite(): Promise<void> {
  if (adminRedis.isOpen) await adminRedis.quit();
  await db.close();
  await cache.close();
}

export async function prepararCaso(): Promise<void> {
  await esperarRedis();
  await adminRedis.flushDb();
  await db.query('TRUNCATE TABLE productos RESTART IDENTITY');
  await db.query(
    `INSERT INTO productos (nombre, precio, stock) VALUES
      ('Teclado mecánico', 189900.00, 15),
      ('Mouse inalámbrico', 59900.50, 40),
      ('Monitor 24"', 749000.00, 8),
      ('Audífonos USB', 99000.00, 25)`,
  );
}

export async function esperarRedis(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let ultimoError: unknown;
  while (Date.now() < deadline) {
    try {
      await cache.ping();
      return;
    } catch (error) {
      ultimoError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  throw new Error(`Redis no respondió en ${timeoutMs} ms`, { cause: ultimoError });
}

export function comandoDocker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 10000 }).trim();
}

export async function restaurarRedis(): Promise<void> {
  const running = comandoDocker(['inspect', '--format', '{{.State.Running}}', REDIS_CONTAINER]);
  if (running !== 'true') comandoDocker(['start', REDIS_CONTAINER]);
  await esperarRedis(10000);
}

export type Evidencia = {
  registrar: (detalle: string) => void;
};

export async function ejecutarCaso(
  id: string,
  nombre: string,
  archivo: string,
  ejecutar: (evidencia: Evidencia) => Promise<void>,
): Promise<void> {
  const pasos: string[] = [
    `${id} · ${nombre}`,
    `Fecha: ${new Date().toISOString()}`,
    'Dependencias: PostgreSQL y Redis reales de compose.yaml',
    'Estado inicial: Redis vacío y productos restaurados a db/init.sql',
    '',
  ];
  const inicio = performance.now();
  let estado = 'APROBADO';
  try {
    await ejecutar({ registrar: (detalle) => pasos.push(`- ${detalle}`) });
  } catch (error) {
    estado = 'FALLIDO';
    pasos.push(`- Error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    throw error;
  } finally {
    pasos.push('', `Duración: ${(performance.now() - inicio).toFixed(2)} ms`, `${id}: ${estado}`);
    const destino = resolve(evidenciaDir, archivo);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, `${pasos.join('\n')}\n`, 'utf8');
  }
}

export const CACHE_TTL_SEGUNDOS = config.cacheTtlSeconds;
export { adminRedis, cache, db };
