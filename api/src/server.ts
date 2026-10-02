import app from './app.ts';
import config from './config.ts';
import * as db from './db.ts';
import * as cache from './cache.ts';

cache.connect();

const server = app.listen(config.port, () => {
  console.log(`[api] escuchando en http://localhost:${config.port}`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[api] ${signal} recibido, cerrando...`);
  server.close();
  await Promise.allSettled([db.close(), cache.close()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
