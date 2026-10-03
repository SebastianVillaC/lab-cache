// Única fuente de configuración. El resto del código lee de aquí, no de process.env.
const toInt = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
};

const config = {
  port: toInt(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://lab:lab@localhost:5433/labcache',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  cacheTtlSeconds: toInt(process.env.CACHE_TTL_SECONDS, 60),
  redisCommandTimeoutMs: toInt(process.env.REDIS_COMMAND_TIMEOUT_MS, 500),
  // Jest define NODE_ENV=test; se apaga el log por petición para no ensuciar su salida.
  logPeticiones: process.env.NODE_ENV !== 'test',
} as const;

export default config;
