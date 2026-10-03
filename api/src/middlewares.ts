import type { ErrorRequestHandler, RequestHandler } from 'express';
import config from './config.ts';

// Log por petición: método, ruta, estado, X-Cache y tiempo. Sirve de evidencia en las demos.
export const logPeticiones: RequestHandler = (req, res, next) => {
  if (!config.logPeticiones) {
    next();
    return;
  }
  const inicio = performance.now();
  res.on('finish', () => {
    const ms = (performance.now() - inicio).toFixed(1);
    const xCache = res.getHeader('X-Cache') ?? '-';
    console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} X-Cache=${xCache} ${ms}ms`);
  });
  next();
};

// Express 5 envía aquí también los rechazos de los handlers async.
export const manejarErrores: ErrorRequestHandler = (err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  console.error(`[api] error en ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Error interno' });
};
