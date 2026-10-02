// Crea la app sin llamar a listen(), para que Supertest la pueda usar directamente.
import express from 'express';
import * as db from './db.ts';
import * as cache from './cache.ts';

type Estado = 'up' | 'down';

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  const [postgres, redis] = await Promise.all([
    db.ping().then((): Estado => 'up', (): Estado => 'down'),
    cache.ping().then((): Estado => 'up', (): Estado => 'down'),
  ]);
  const status = postgres === 'up' && redis === 'up' ? 'ok' : 'degraded';
  res.status(200).json({ status, postgres, redis });
});

// TODO(A): rutas /productos según el contrato (docs/estructura-trabajo.md, sección 2).

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;
