import pg from 'pg';
import config from './config.ts';

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 2000,
});

// Sin este listener, un error en un cliente inactivo del pool tumba el proceso.
pool.on('error', (err) => {
  console.error('[db] error en cliente inactivo:', err.message);
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function ping(): Promise<void> {
  await pool.query('SELECT 1');
}

export function close(): Promise<void> {
  return pool.end();
}
