import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// One Neon Postgres database for the whole app. The pool is cached on globalThis so
// Next.js dev hot-reloads do not open a new pool on every module replacement.
const globalForDb = globalThis as unknown as { __hiddenPool?: Pool };

function pool(): Pool {
  if (!globalForDb.__hiddenPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    globalForDb.__hiddenPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 20_000,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForDb.__hiddenPool;
}

export type Sql = { text: string; values: unknown[] };

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return pool().query<T>(text, values);
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T | null> {
  const r = await query<T>(text, values);
  return r.rows[0] ?? null;
}

export async function all<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  return (await query<T>(text, values)).rows;
}

export async function scalar<T = number>(text: string, values: unknown[] = []): Promise<T> {
  const row = await one<Record<string, T>>(text, values);
  return row ? Object.values(row)[0] : (0 as T);
}

/** Run fn in a single transaction. Any thrown error rolls the whole thing back. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
