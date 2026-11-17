import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery, withDbTransaction } from "@/lib/serverDb";
import { importArtistCredits } from "@/lib/artists/importCredits";
import { upsertAlbum, upsertAlbums } from "../albumUpsertService";

// #1223: the album routes call upsertAlbum inside withDbTransaction. The credit
// import used to open a second transaction and wait on the row the first one
// held, which Postgres cannot detect. Each save below is raced against a timeout
// so a regression fails in seconds instead of hanging.
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const TIMEOUT_MS = 5000;
let friendId: number;

const album = (releaseId: string, extra: Record<string, unknown> = {}) => ({
  release_id: releaseId,
  friend_id: friendId,
  title: "Save Test",
  artist: "Save Fixture Artist",
  artist_credits: importArtistCredits([{ id: 999723001, name: "Save Fixture Artist" }], "unused"),
  track_count: 0,
  ...extra,
});

function withinTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`album save did not finish in ${TIMEOUT_MS}ms (deadlock?)`)),
      TIMEOUT_MS,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function idleInTransaction(): Promise<number> {
  const { rows } = await dbQuery<{ n: string }>(
    `SELECT count(*) AS n FROM pg_stat_activity
     WHERE datname = current_database() AND state LIKE 'idle in transaction%'`,
  );
  return Number(rows[0].n);
}

const creditCount = async (releaseId: string) =>
  Number(
    (
      await dbQuery<{ n: string }>(
        `SELECT count(*) AS n FROM album_artists aa JOIN albums a ON a.id = aa.album_id
         WHERE a.release_id = $1 AND a.friend_id = $2`,
        [releaseId, friendId],
      )
    ).rows[0].n,
  );

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  const friend = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ('album-save-test') RETURNING id",
  );
  friendId = friend.rows[0].id;
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await dbQuery("DELETE FROM friends WHERE id = $1", [friendId]);
  await dbPool.end();
});

describe("album save inside a transaction (#1223)", () => {
  dbTest("creates a new album and its credits", async () => {
    const saved = await withinTimeout(
      withDbTransaction((client) => upsertAlbum(client, album("1223-new"))),
    );
    expect(saved.release_id).toBe("1223-new");
    expect(await creditCount("1223-new")).toBe(1);
    expect(await idleInTransaction()).toBe(0);
  });

  dbTest("edits an existing album (library identifier) and keeps its credits", async () => {
    await withDbTransaction((client) => upsertAlbum(client, album("1223-edit")));
    const saved = await withinTimeout(
      withDbTransaction((client) =>
        upsertAlbum(client, album("1223-edit", { library_identifier: "LP-1223" }), {
          preserveSourceTaxonomy: true,
        }),
      ),
    );
    expect(saved.library_identifier).toBe("LP-1223");
    expect(await creditCount("1223-edit")).toBe(1);
    expect(await idleInTransaction()).toBe(0);
  });

  dbTest("rolls the album back with its credits when the transaction fails", async () => {
    await expect(
      withinTimeout(
        withDbTransaction(async (client) => {
          await upsertAlbum(client, album("1223-rollback"));
          throw new Error("later step failed");
        }),
      ),
    ).rejects.toThrow("later step failed");
    const { rows } = await dbQuery("SELECT 1 FROM albums WHERE release_id = '1223-rollback'");
    expect(rows).toHaveLength(0);
    expect(await idleInTransaction()).toBe(0);
  });

  dbTest("the Discogs sync path (pool, no outer transaction) still works", async () => {
    const saved = await withinTimeout(upsertAlbums(dbPool, [album("1223-sync")]));
    expect(saved).toHaveLength(1);
    expect(await creditCount("1223-sync")).toBe(1);
    expect(await idleInTransaction()).toBe(0);
  });
});
