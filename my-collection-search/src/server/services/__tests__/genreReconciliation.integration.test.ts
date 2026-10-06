import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { genreReconciliationRepository as repo } from "@/server/repositories/genreReconciliationRepository";
import {
  applyProposals,
  defaultRunOptions,
  decideProposals,
  executeRun,
  getCoverage,
  getProposalTracks,
  restoreProposals,
  updateProposal,
} from "../genreReconciliationService";
import { mergeGenres } from "../genreAdminService";

// Real-database checks for local_tags reconciliation (#372): the
// jsonb_to_recordset upserts, the partial-index ON CONFLICT that allows one
// running run, the uuid[] rewrite on merge, and apply end to end. AI is off
// throughout; the model step is covered by unit tests.
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "genre-reconciliation-test";
const OTHER = "genre-reconciliation-other";
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
  await dbQuery("DELETE FROM tracks WHERE username = ANY($1)", [[USERNAME, OTHER]]);
  await dbQuery("DELETE FROM genre_aliases WHERE source = 'reconciliation' OR alias_normalized LIKE 'recon test %'");
  await dbQuery("DELETE FROM genres WHERE name LIKE 'Recon Test %'");
  await dbQuery("DELETE FROM friends WHERE username = ANY($1)", [[USERNAME, OTHER]]);
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

  dbTest("scopes a run, an apply and coverage to one friend", async () => {
    const { rows } = await dbQuery<{ id: number }>(
      "INSERT INTO friends (username) VALUES ($1) RETURNING id",
      [OTHER]
    );
    const otherId = rows[0].id;
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, local_tags)
       VALUES ('rc-other', $1, $2, 'Title', 'Artist', 'Cumbia · Recon Other Only')`,
      [OTHER, otherId]
    );

    const options = { ...defaultRunOptions, ai: false, friend_id: friendId };
    const run = (await repo.createRun(options, null))!;
    await executeRun(run.id, options);
    expect(await repo.getRun(run.id)).toMatchObject({ distinct_values: 5, options: { friend_id: friendId } });
    // The other friend's value is neither proposed nor counted.
    expect(await proposalFor("recon other only")).toBeUndefined();
    expect((await proposalFor("cumbia")).track_count).toBe(2);

    await applyProposals(undefined, friendId);
    const { rows: otherLinks } = await dbQuery("SELECT 1 FROM track_genres WHERE track_id = 'rc-other'");
    expect(otherLinks).toEqual([]);

    expect((await getCoverage(otherId)).tracks).toEqual({
      with_local_tags: 1, with_genres: 0, descriptors_only: 0, no_genre: 0, unresolved: 1,
    });
    expect((await getCoverage(friendId)).tracks.with_local_tags).toBe(5);

    await applyProposals(undefined, otherId);
    const { rows: linked } = await dbQuery("SELECT 1 FROM track_genres WHERE track_id = 'rc-other'");
    expect(linked).toHaveLength(1);
  });

  dbTest("decides in one transaction, undoes exactly, and finds example tracks", async () => {
    const uplifting = await proposalFor("uplifting");
    expect(uplifting).toMatchObject({ status: "accepted", action: "descriptor", method: "ai" });

    // A missing id rolls back the whole batch.
    await expect(decideProposals([
      { id: uplifting.id, action: "drop" },
      { id: "00000000-0000-4000-8000-000000000000", status: "accepted" },
    ])).rejects.toMatchObject({ status: 404 });
    expect(await proposalFor("uplifting")).toMatchObject({ action: "descriptor", status: "accepted" });

    const { previous } = await decideProposals([{ id: uplifting.id, action: "drop" }]);
    expect(await proposalFor("uplifting")).toMatchObject({ action: "drop", status: "edited", method: "manual" });
    expect(await restoreProposals(previous)).toEqual({ restored: 1 });
    expect(await proposalFor("uplifting")).toMatchObject({ action: "descriptor", status: "accepted", method: "ai" });

    // rc-other (another friend) also says Cumbia; rc-3's tags hold no "cumbia".
    const tracks = await getProposalTracks((await proposalFor("cumbia")).id, friendId, 5);
    expect(tracks.map((t) => t.track_id)).toEqual(["rc-1", "rc-2"]);
    expect(tracks[0]).toMatchObject({ title: "Title", artist: "Artist", styles: ["Cumbia"] });

    const { proposals } = await repo.listProposals({ min_tracks: 2, limit: 50, offset: 0 });
    expect(proposals.every((p) => p.track_count >= 2)).toBe(true);
    expect(proposals.map((p) => p.value_normalized)).toContain("cumbia");
  });

  dbTest("matches spelling variants loosely, against the seeded taxonomy", async () => {
    const matches = await repo.resolveExactValues(["blues-rock", "synth pop", "prog rock", "zzz recon nothing"]);
    const nameOf = async (value: string) => {
      const match = matches.get(value);
      if (!match) return undefined;
      const { rows } = await dbQuery<{ name: string }>("SELECT name FROM genres WHERE id = $1", [match.genre_id]);
      return { name: rows[0].name, loose: match.loose };
    };
    expect(await nameOf("blues-rock")).toEqual({ name: "Blues Rock", loose: true });
    expect(await nameOf("synth pop")).toEqual({ name: "Synth-pop", loose: true });
    expect(await nameOf("prog rock")).toEqual({ name: "Prog Rock", loose: false });
    expect(matches.has("zzz recon nothing")).toBe(false);
  });
});
