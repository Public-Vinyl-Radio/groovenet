import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal stand-in for `pg.Pool`. `query` and `connect` are prototype methods
 * that read `this`, so a detached reference only works if the lazy proxy binds
 * it — which is exactly what these tests assert.
 */
class PoolMock {
  static instances: PoolMock[] = [];

  config: { connectionString?: string };
  calls: { text: string; values?: unknown[] }[] = [];
  result: unknown = { rows: [], rowCount: 0 };
  client: ClientMock = new ClientMock();
  totalCount = 7;

  constructor(config: { connectionString?: string }) {
    this.config = config;
    PoolMock.instances.push(this);
  }

  async query(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    return this.result;
  }

  async connect() {
    return this.client;
  }
}

class ClientMock {
  queries: string[] = [];
  release = vi.fn();
  /** Statements that should reject instead of resolving. */
  failOn = new Set<string>();

  query = vi.fn(async (text: string) => {
    this.queries.push(text);
    if (this.failOn.has(text)) throw new Error(`${text} failed`);
    return { rows: [], rowCount: 0 };
  });
}

vi.mock("pg", () => ({ Pool: PoolMock }));

const DSN = "postgresql://user:pw@db.test:5432/mcs";
const TEST_DSN = "postgresql://localhost:5432/mcs_test";

let originalDatabaseUrl: string | undefined;

/** Import a fresh copy of the module under test. */
async function loadModule() {
  return import("../serverDb");
}

/** The pool the module lazily built, asserting exactly one was created. */
function onlyPool(): PoolMock {
  expect(PoolMock.instances).toHaveLength(1);
  return PoolMock.instances[0];
}

beforeEach(() => {
  PoolMock.instances = [];
  globalThis.__mcsDbPool = undefined;
  originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = DSN;
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  globalThis.__mcsDbPool = undefined;
});

describe("pool construction", () => {
  it("does not build a pool at import time", async () => {
    vi.resetModules();

    await loadModule();

    expect(PoolMock.instances).toHaveLength(0);
  });

  it("builds the pool from DATABASE_URL on first use", async () => {
    const { dbQuery } = await loadModule();

    await dbQuery("SELECT 1");

    expect(onlyPool().config).toEqual({ connectionString: DSN });
  });

  it("falls back to the local test database when DATABASE_URL is unset under NODE_ENV=test", async () => {
    delete process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "test");
    const { dbQuery } = await loadModule();

    await dbQuery("SELECT 1");

    expect(onlyPool().config).toEqual({ connectionString: TEST_DSN });
  });

  it("prefers DATABASE_URL over the test fallback", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { dbQuery } = await loadModule();

    await dbQuery("SELECT 1");

    expect(onlyPool().config).toEqual({ connectionString: DSN });
  });

  it.each(["production", "development"])(
    "throws when DATABASE_URL is unset under NODE_ENV=%s",
    async (nodeEnv) => {
      delete process.env.DATABASE_URL;
      vi.stubEnv("NODE_ENV", nodeEnv);
      const { dbQuery } = await loadModule();

      await expect(dbQuery("SELECT 1")).rejects.toThrow("DATABASE_URL is not configured");
      expect(PoolMock.instances).toHaveLength(0);
    }
  );

  it("treats an empty DATABASE_URL as unset", async () => {
    process.env.DATABASE_URL = "";
    vi.stubEnv("NODE_ENV", "production");
    const { dbQuery } = await loadModule();

    await expect(dbQuery("SELECT 1")).rejects.toThrow("DATABASE_URL is not configured");
  });

  it("reuses one pool across every entry point", async () => {
    const { dbQuery, dbPool, withDbClient } = await loadModule();

    await dbQuery("SELECT 1");
    void dbPool.totalCount;
    await withDbClient(async () => undefined);

    expect(PoolMock.instances).toHaveLength(1);
  });

  it("caches the pool on globalThis so a module reload does not reconnect", async () => {
    const { dbQuery } = await loadModule();
    await dbQuery("SELECT 1");
    const first = onlyPool();

    vi.resetModules();
    const reloaded = await loadModule();
    await reloaded.dbQuery("SELECT 2");

    expect(PoolMock.instances).toHaveLength(1);
    expect(first.calls.map((c) => c.text)).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("does not cache a failed pool construction", async () => {
    delete process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "production");
    const { dbQuery } = await loadModule();

    await expect(dbQuery("SELECT 1")).rejects.toThrow("DATABASE_URL is not configured");
    expect(globalThis.__mcsDbPool).toBeUndefined();

    process.env.DATABASE_URL = DSN;
    await expect(dbQuery("SELECT 1")).resolves.toBeDefined();
    expect(onlyPool().config).toEqual({ connectionString: DSN });
  });
});

describe("dbPool proxy", () => {
  it("creates the pool on first property access, not before", async () => {
    const { dbPool } = await loadModule();
    expect(PoolMock.instances).toHaveLength(0);

    expect(dbPool.totalCount).toBe(7);
    expect(PoolMock.instances).toHaveLength(1);
  });

  it("passes non-function properties through untouched", async () => {
    const { dbPool } = await loadModule();

    expect(dbPool.totalCount).toBe(7);
    expect((dbPool as unknown as PoolMock).config).toEqual({ connectionString: DSN });
  });

  it("binds methods so a detached reference still reaches the pool", async () => {
    const { dbPool } = await loadModule();

    const detachedQuery = dbPool.query;
    await detachedQuery("SELECT detached");

    expect(onlyPool().calls).toEqual([{ text: "SELECT detached", values: undefined }]);
  });

  it("surfaces the configuration error on property access", async () => {
    delete process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "production");
    const { dbPool } = await loadModule();

    expect(() => dbPool.totalCount).toThrow("DATABASE_URL is not configured");
  });
});

describe("dbQuery", () => {
  it("forwards the statement and its values to the pool", async () => {
    const { dbQuery } = await loadModule();

    await dbQuery("SELECT * FROM tracks WHERE friend_id = $1", [3]);

    expect(onlyPool().calls).toEqual([
      { text: "SELECT * FROM tracks WHERE friend_id = $1", values: [3] },
    ]);
  });

  it("returns the pool's result unchanged", async () => {
    const { dbQuery, dbPool } = await loadModule();
    void dbPool.totalCount; // force pool creation so we can seed its result
    const rows = [{ track_id: "t1" }];
    onlyPool().result = { rows, rowCount: 1 };

    await expect(dbQuery("SELECT 1")).resolves.toEqual({ rows, rowCount: 1 });
  });

  it("omits values when none are given", async () => {
    const { dbQuery } = await loadModule();

    await dbQuery("SELECT 1");

    expect(onlyPool().calls[0].values).toBeUndefined();
  });

  it("propagates a query rejection", async () => {
    const { dbQuery, dbPool } = await loadModule();
    void dbPool.totalCount;
    const boom = new Error("connection terminated");
    vi.spyOn(onlyPool(), "query").mockRejectedValue(boom);

    await expect(dbQuery("SELECT 1")).rejects.toBe(boom);
  });
});

describe("withDbClient", () => {
  it("hands the checked-out client to the callback and returns its value", async () => {
    const { withDbClient, dbPool } = await loadModule();
    void dbPool.totalCount;
    const pool = onlyPool();

    const received: unknown[] = [];
    const result = await withDbClient(async (client) => {
      received.push(client);
      return "done";
    });

    expect(result).toBe("done");
    expect(received).toEqual([pool.client]);
  });

  it("releases the client on success", async () => {
    const { withDbClient, dbPool } = await loadModule();
    void dbPool.totalCount;

    await withDbClient(async () => "ok");

    expect(onlyPool().client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the client and rethrows when the callback fails", async () => {
    const { withDbClient, dbPool } = await loadModule();
    void dbPool.totalCount;
    const boom = new Error("callback exploded");

    await expect(
      withDbClient(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(onlyPool().client.release).toHaveBeenCalledTimes(1);
  });

  it("does not release when the connection itself cannot be acquired", async () => {
    const { withDbClient, dbPool } = await loadModule();
    void dbPool.totalCount;
    const pool = onlyPool();
    vi.spyOn(pool, "connect").mockRejectedValue(new Error("pool exhausted"));

    await expect(withDbClient(async () => "unreachable")).rejects.toThrow("pool exhausted");
    expect(pool.client.release).not.toHaveBeenCalled();
  });
});

describe("withDbTransaction", () => {
  it("wraps the callback in BEGIN/COMMIT and returns its value", async () => {
    const { withDbTransaction, dbPool } = await loadModule();
    void dbPool.totalCount;
    const client = onlyPool().client;

    const result = await withDbTransaction(async (c) => {
      await c.query("INSERT INTO tracks VALUES ($1)", ["t1"]);
      return 42;
    });

    expect(result).toBe(42);
    expect(client.queries).toEqual(["BEGIN", "INSERT INTO tracks VALUES ($1)", "COMMIT"]);
  });

  it("rolls back and rethrows when the callback fails", async () => {
    const { withDbTransaction, dbPool } = await loadModule();
    void dbPool.totalCount;
    const client = onlyPool().client;
    const boom = new Error("constraint violation");

    await expect(
      withDbTransaction(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(client.queries).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("does not roll back when COMMIT itself fails", async () => {
    const { withDbTransaction, dbPool } = await loadModule();
    void dbPool.totalCount;
    const client = onlyPool().client;
    client.failOn.add("COMMIT");

    // Postgres has already ended the transaction, so a ROLLBACK here would be
    // a pointless round trip on a connection that just failed.
    await expect(withDbTransaction(async () => "ok")).rejects.toThrow("COMMIT failed");
    expect(client.queries).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the client whichever way the transaction ends", async () => {
    const { withDbTransaction, dbPool } = await loadModule();
    void dbPool.totalCount;
    const client = onlyPool().client;

    await withDbTransaction(async () => "ok");
    await expect(
      withDbTransaction(async () => {
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");

    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it("does not open a transaction when BEGIN fails", async () => {
    const { withDbTransaction, dbPool } = await loadModule();
    void dbPool.totalCount;
    const client = onlyPool().client;
    client.failOn.add("BEGIN");

    const callback = vi.fn();
    await expect(withDbTransaction(callback)).rejects.toThrow("BEGIN failed");
    expect(callback).not.toHaveBeenCalled();
    expect(client.queries).toEqual(["BEGIN"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the original error when ROLLBACK also fails", async () => {
    const { withDbTransaction, dbPool } = await loadModule();
    void dbPool.totalCount;
    const client = onlyPool().client;
    client.failOn.add("ROLLBACK");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const boom = new Error("constraint violation");
    await expect(
      withDbTransaction(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(consoleError).toHaveBeenCalledWith(
      "[db] ROLLBACK failed after a transaction error:",
      expect.objectContaining({ message: "ROLLBACK failed" })
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
