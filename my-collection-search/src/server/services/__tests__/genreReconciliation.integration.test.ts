import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { genreReconciliationRepository as repo } from "@/server/repositories/genreReconciliationRepository";
import {
  applyProposals,
  defaultRunOptions,
  executeRun,
  getCoverage,
  updateProposal,
} from "../genreReconciliationService";
import { mergeGenres } from "../genreAdminService";

// Real-database checks for local_tags reconciliation (#372): the
// jsonb_to_recordset upserts, the partial-index ON CONFLICT that allows one
// running run, the uuid[] rewrite on merge, and apply end to end. AI is off
// throughout; the model step is covered by unit tests.
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "genre-reconciliation-test";
let friendId: number;

async function genreId(name: string): Promise<string> {
  const { rows } = await dbQuery<{ id: string }>("SELECT id FROM genres WHERE name = $1", [name]);
  return rows[0].id;
}

async function proposalFor(value: string) {
  const { proposals } = await repo.listProposals({ limit: 500, offset: 0 });
  return proposals.find((p) => p.value_normalized === value)!;
}

async function cleanup() {
  await dbQuery("DELETE FROM genre_reconciliation_proposals");
  await dbQuery("DELETE FROM genre_reconciliation_runs");
  await dbQuery("DELETE FROM tracks WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM genre_aliases WHERE source = 'reconciliation' OR alias_normalized LIKE 'recon test %'");
  await dbQuery("DELETE FROM genres WHERE name LIKE 'Recon Test %'");
  await dbQuery("DELETE FROM friends WHERE username = $1", [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ($1) RETURNING id",
    [USERNAME]
  );
  friendId = rows[0].id;
  const tracks: Array<[string, string | null, string[]]> = [
    ["rc-1", "Cumbia · Recon Test Psych", ["Cumbia"]],
    ["rc-2", "cumbia, Uplifting", ["Cumbia", "Salsa"]],
    ["rc-3", "Recon Test Psych", []],
    ["rc-4", "Bossanova", ["Bossa Nova"]],
    ["rc-5", "Recon Junk", []],
    ["rc-6", null, []],
  ];
  for (const [trackId, localTags, styles] of tracks) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, local_tags, styles)
       VALUES ($1, $2, $3, 'Title', 'Artist', $4, $5)`,
      [trackId, USERNAME, friendId, localTags, styles]
    );
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("local_tags reconciliation", () => {
  dbTest("allows one running run, and writes off a stale one", async () => {
    const first = await repo.createRun(defaultRunOptions, "m");
    expect(first).toMatchObject({ status: "running", options: defaultRunOptions, cost_usd: 0 });
    expect(await repo.createRun(defaultRunOptions, "m")).toBeNull();
    expect((await repo.getRunningRun())?.id).toBe(first!.id);

    await dbQuery("UPDATE genre_reconciliation_runs SET updated_at = now() - interval '1 hour'");
    await repo.failStaleRuns(15);
    expect(await repo.getRun(first!.id)).toMatchObject({ status: "failed", error: expect.stringContaining("Stalled") });
    expect(await repo.createRun(defaultRunOptions, "m")).not.toBeNull();
    await dbQuery("DELETE FROM genre_reconciliation_runs");
  });

  dbTest("proposes exact matches by name and alias, and leaves the rest for AI", async () => {
    const run = (await repo.createRun({ ...defaultRunOptions, ai: false }, null))!;
    await executeRun(run.id, { ...defaultRunOptions, ai: false });

    expect(await repo.getRun(run.id)).toMatchObject({
      status: "completed", distinct_values: 5, exact_matches: 2, ai_pending: 3, finished_at: expect.any(Date),
    });
    const cumbia = await proposalFor("cumbia");
    expect(cumbia).toMatchObject({
      action: "map", method: "exact", status: "pending", confidence: 1, track_count: 2,
      target_genre_ids: [await genreId("Cumbia")],
      target_genres: [{ name: "Cumbia", parent_name: "Latin" }],
    });
    expect(cumbia.raw_examples.sort()).toEqual(["Cumbia", "cumbia"]);
    // Canonical beats alias: Bossanova is a Discogs style as well as an alias.
    expect((await proposalFor("bossanova")).target_genre_ids).toEqual([await genreId("Bossanova")]);
    expect(await proposalFor("recon junk")).toBeUndefined();
  });

  dbTest("keeps reviewed decisions on a re-run, refreshing their counts", async () => {
    await repo.upsertProposals([{
      value_normalized: "recon test psych", raw_examples: ["Recon Test Psych"], track_count: 2,
      action: "new_genre", target_genre_ids: [], proposed_genre_name: "Recon Test Psych",
      proposed_parent_id: await genreId("Cumbia"), confidence: 0.8, method: "ai",
    }, {
      value_normalized: "uplifting", raw_examples: ["Uplifting"], track_count: 1,
      action: "descriptor", target_genre_ids: [], proposed_genre_name: null,
      proposed_parent_id: null, confidence: 0.9, method: "ai",
    }, {
      value_normalized: "recon junk", raw_examples: ["Recon Junk"], track_count: 1,
      action: "drop", target_genre_ids: [], proposed_genre_name: null,
      proposed_parent_id: null, confidence: 0.9, method: "ai",
    }], (await repo.createRun(defaultRunOptions, null))!.id);
    await dbQuery("UPDATE genre_reconciliation_runs SET status = 'completed'");

    const cumbia = await proposalFor("cumbia");
    await updateProposal(cumbia.id, { status: "accepted" });
    await updateProposal((await proposalFor("uplifting")).id, { status: "accepted" });
    await updateProposal((await proposalFor("recon junk")).id, { status: "accepted" });
    const edited = await updateProposal((await proposalFor("recon test psych")).id, { proposed_genre_name: "Recon Test Psychedelic Cumbia" });
    expect(edited).toMatchObject({ status: "edited", method: "manual", proposed_parent_name: "Cumbia" });

    await dbQuery("UPDATE genre_reconciliation_proposals SET track_count = 99 WHERE value_normalized = 'cumbia'");
    const rerun = (await repo.createRun({ ...defaultRunOptions, ai: false }, null))!;
    await executeRun(rerun.id, { ...defaultRunOptions, ai: false });
    expect(await repo.getRun(rerun.id)).toMatchObject({ exact_matches: 1, kept: 4, ai_pending: 0 });
    expect(await proposalFor("cumbia")).toMatchObject({ status: "accepted", track_count: 2 });
    expect((await repo.listProposals({ status: "edited", limit: 10, offset: 0 })).total).toBe(1);
  });

  dbTest("applies accepted proposals, repeatably, and reports coverage", async () => {
    const first = await applyProposals();
    expect(first).toMatchObject({
      proposals_applied: 4, genres_created: 1, descriptors_added: 1, skipped: [],
    });
    // cumbia → rc-1, rc-2; the new genre → rc-1, rc-3.
    expect(first.tracks_linked).toBe(4);
    // "recon test psych" → the new genre; "cumbia" is already canonical.
    expect(first.aliases_added).toBe(1);

    const created = await genreId("Recon Test Psychedelic Cumbia");
    const { rows: links } = await dbQuery<{ track_id: string; source: string }>(
      "SELECT track_id, source FROM track_genres WHERE genre_id = $1 ORDER BY track_id", [created]
    );
    expect(links).toEqual([{ track_id: "rc-1", source: "reconciliation" }, { track_id: "rc-3", source: "reconciliation" }]);
    const { rows: [rc2] } = await dbQuery("SELECT descriptors, local_tags FROM tracks WHERE track_id = 'rc-2'");
    expect(rc2).toEqual({ descriptors: ["uplifting"], local_tags: "cumbia, Uplifting" });
    expect((await proposalFor("recon test psych")).created_genre_id).toBe(created);

    expect(await applyProposals()).toMatchObject({
      proposals_applied: 4, tracks_linked: 0, descriptors_added: 0, aliases_added: 0, genres_created: 0,
    });

    expect(await getCoverage()).toMatchObject({
      tracks: { with_local_tags: 5, with_genres: 3, descriptors_only: 0, no_genre: 1, unresolved: 1 },
      values: { distinct: 5, proposed: 5, exact: 2, exact_share: 0.4 },
    });
  });

  dbTest("retargets proposals when their genre is merged away", async () => {
    const created = await genreId("Recon Test Psychedelic Cumbia");
    const cumbia = await proposalFor("cumbia");
    await updateProposal(cumbia.id, { target_genres: [created, "Cumbia"] });
    await mergeGenres(created, await genreId("Cumbia"));

    const after = await proposalFor("cumbia");
    expect(after.target_genre_ids).toEqual([await genreId("Cumbia")]);
    expect((await proposalFor("recon test psych")).created_genre_id).toBe(await genreId("Cumbia"));
  });
});
