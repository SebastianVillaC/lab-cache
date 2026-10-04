// Módulo de caché. Ninguna función lanza excepciones: ante un fallo de Redis devuelven status
// 'ERROR' y la API responde X-Cache: BYPASS. Cada comando tiene un tope de
// REDIS_COMMAND_TIMEOUT_MS para que una caché lenta no bloquee la API.
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

// Formato de llave acordado: producto:{id}. La API usa este helper en vez de armar la llave a mano.
export const claveProducto = (id: number | string): string => `producto:${id}`;

const comoError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

export async function get<T>(key: string): Promise<CacheGetResult<T>> {
  let raw: string | null;
  try {
    raw = await withTimeout(client.get(key), config.redisCommandTimeoutMs);
  } catch (err) {
    return { status: 'ERROR', error: comoError(err) };
  }
  if (raw === null) return { status: 'MISS' };

  try {
    return { status: 'HIT', value: JSON.parse(raw) as T };
  } catch {
    // Entrada corrupta: se trata como MISS y se borra para que la siguiente lectura la regenere.
    console.error(`[cache] JSON inválido en ${key}; se elimina la llave`);
    await del(key);
    return { status: 'MISS' };
  }
}

export async function set(
  key: string,
  value: unknown,
  ttlSeconds: number = config.cacheTtlSeconds,
): Promise<CacheWriteResult> {
  try {
    // EX fija el TTL en la misma operación: nunca queda una llave sin expiración (R6).
    await withTimeout(
      client.set(key, JSON.stringify(value), { expiration: { type: 'EX', value: ttlSeconds } }),
      config.redisCommandTimeoutMs,
    );
    return { status: 'OK' };
  } catch (err) {
    return { status: 'ERROR', error: comoError(err) };
  }
}

export async function del(key: string): Promise<CacheWriteResult> {
  try {
    await withTimeout(client.del(key), config.redisCommandTimeoutMs);
    return { status: 'OK' };
  } catch (err) {
    return { status: 'ERROR', error: comoError(err) };
  }
}

export async function close(): Promise<void> {
  if (client.isOpen) client.destroy();
}
