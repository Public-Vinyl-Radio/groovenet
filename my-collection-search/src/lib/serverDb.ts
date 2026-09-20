import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

declare global {
  var __mcsDbPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "test"
      ? "postgresql://localhost:5432/mcs_test"
      : undefined);
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return new Pool({ connectionString });
}

function getPool(): Pool {
  if (!globalThis.__mcsDbPool) {
    globalThis.__mcsDbPool = createPool();
  }
  return globalThis.__mcsDbPool;
}

// Lazy proxy — pool is only created on first actual use, not at module load time.
// This prevents build-time failures when DATABASE_URL is not available.
export const dbPool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const pool = getPool();
    const value = Reflect.get(pool, prop, receiver);
    return typeof value === "function" ? value.bind(pool) : value;
  },
});

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function withDbClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    // The connection is usually already gone by the time a ROLLBACK fails.
    // Swallow it so the error that actually aborted the transaction is the one
    // the caller sees, but log it — it means this client is going back to the
    // pool in a bad state.
    console.error("[db] ROLLBACK failed after a transaction error:", rollbackError);
  }
}

export async function withDbTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");
    let result: T;
    try {
      result = await fn(client);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    }
    // COMMIT sits outside the rollback guard: once it fails Postgres has
    // already ended the transaction, so there is nothing left to roll back.
    await client.query("COMMIT");
    return result;
  });
}
