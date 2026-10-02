// Módulo de caché (dueño: Integrante B).
//
// Interfaz acordada A ↔ B (docs/estructura-trabajo.md, sección 7): ninguna función lanza
// excepciones; ante un fallo de Redis devuelven status 'ERROR' y la API responde X-Cache: BYPASS.
//
// Esta versión es la base: conexión configurada y ping para /health.
// TODO(B): implementar get/set/del con TTL, timeout por comando y manejo de JSON corrupto.
import { createClient } from 'redis';
import config from './config.ts';

export type CacheGetResult<T> =
  | { status: 'HIT'; value: T }
  | { status: 'MISS' }
  | { status: 'ERROR'; error: Error };

export type CacheWriteResult = { status: 'OK' } | { status: 'ERROR'; error: Error };

const client = createClient({
  url: config.redisUrl,
  // Sin cola fuera de línea: con Redis caído los comandos fallan de inmediato
  // en lugar de quedar encolados y bloquear la petición.
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 1000,
    reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
  },
});

// ECONNREFUSED llega como AggregateError (IPv4 + IPv6) con message vacío; el code sí viene.
const describir = (err: Error & { code?: string }): string => err.message || err.code || String(err);

client.on('error', (err: Error) => {
  console.error('[cache] error de Redis:', describir(err));
});

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout de Redis (${ms} ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function connect(): void {
  // No se espera la conexión: si Redis no está, la API arranca igual y el cliente reintenta.
  client.connect().catch((err: Error) => {
    console.error('[cache] no se pudo conectar:', describir(err));
  });
}

export async function ping(): Promise<void> {
  await withTimeout(client.ping(), config.redisCommandTimeoutMs);
}

export async function get<T>(_key: string): Promise<CacheGetResult<T>> {
  return { status: 'MISS' };
}

export async function set(
  _key: string,
  _value: unknown,
  _ttlSeconds: number = config.cacheTtlSeconds,
): Promise<CacheWriteResult> {
  return { status: 'OK' };
}

export async function del(_key: string): Promise<CacheWriteResult> {
  return { status: 'OK' };
}

export async function close(): Promise<void> {
  if (client.isOpen) client.destroy();
}
