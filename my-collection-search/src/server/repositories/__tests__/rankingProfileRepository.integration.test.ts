import { exportRankingProfileFile, parseRankingProfileFile } from "@groovenet/contracts";
/**
 * Ranking profiles against a real Postgres (#1192): the per-library limit in
 * one statement, the surface CHECKs, one profile per selection, and deleting a
 * profile (or a library) taking its selections with it. A mocked driver
 * accepts any of this SQL. Run with `just ranking-profiles-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { draftToStored, profileToDraft, RANKING_PRESETS } from "@/lib/ranking/profiles";
import { RankingProfileService } from "@/server/services/rankingProfileService";
import { RankingProfileRepository } from "../rankingProfileRepository";

const enabled = process.env.RUN_DB_TESTS === "1";
const dbTest = it.skipIf(!enabled);
const repo = new RankingProfileRepository();
const service = new RankingProfileService(repo);
const MINE = "ranking-profile-test-mine";
const THEIRS = "ranking-profile-test-theirs";
let mine = 0;
let theirs = 0;

const write = (name = "Peak") => draftToStored(profileToDraft(RANKING_PRESETS.beatmatcher, name));

async function cleanup() {
  await dbQuery(`DELETE FROM friends WHERE username IN ($1, $2)`, [MINE, THEIRS]);
}

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number; username: string }>(
    `INSERT INTO friends (username) VALUES ($1), ($2) RETURNING id, username`,
    [MINE, THEIRS],
  );
  mine = rows.find((r) => r.username === MINE)!.id;
  theirs = rows.find((r) => r.username === THEIRS)!.id;
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await dbPool.end();
});

describe("ranking profiles (integration)", () => {
  dbTest("stores, reads back and updates a profile as JSON", async () => {
    const stored = await repo.insert(mine, write(), 50);
    expect(stored).toMatchObject({
      friend_id: mine,
      name: "Peak",
      surfaces: ["suggestions", "related", "recommendations", "playlists"],
    });
    expect(stored!.config).toEqual(write().config);
    const updated = await repo.update(stored!.id, { ...write("Closing"), surfaces: ["related"] });
    expect(updated).toMatchObject({ name: "Closing", surfaces: ["related"] });
    expect(await repo.listByFriend(mine)).toHaveLength(1);
    expect(await repo.listByFriend(theirs)).toEqual([]);
  });

  dbTest(
    "round trips through JSONB byte-identically and stores independent friend provenance",
    async () => {
      const exported = exportRankingProfileFile(RANKING_PRESETS.beatmatcher);
      const { format: _format, ...draft } = parseRankingProfileFile(JSON.stringify(exported)).file;
      void _format;
      const imported = await service.create(mine, { ...draft, author: "original" }, "file");
      expect(JSON.stringify(exportRankingProfileFile(await service.get(imported.id)))).toBe(
        JSON.stringify(
          exportRankingProfileFile({ ...RANKING_PRESETS.beatmatcher, author: "original" }),
        ),
      );
      const copied = await service.useFriend(imported.id, theirs, mine);
      expect(copied).toMatchObject({ origin: "friend", source_handle: MINE, author: "original" });
      await service.update(imported.id, { ...draft, name: "Changed" });
      expect((await service.get(copied.id)).name).toBe("Beatmatcher");
      await service.remove(imported.id);
      await service.remove(copied.id);
    },
  );

  dbTest("refuses past the per-library limit", async () => {
    await repo.insert(theirs, write(), 2);
    await repo.insert(theirs, write(), 2);
    expect(await repo.insert(theirs, write(), 2)).toBeNull();
    expect(await repo.listByFriend(theirs)).toHaveLength(2);
  });

  dbTest("refuses an unknown surface, an empty name and a non-object config", async () => {
    await expect(
      repo.insert(mine, { ...write(), surfaces: ["search" as never] }, 50),
    ).rejects.toThrow(/check constraint/);
    await expect(repo.insert(mine, { ...write(), name: "" }, 50)).rejects.toThrow(
      /check constraint/,
    );
    await expect(repo.insert(mine, { ...write(), config: [1] }, 50)).rejects.toThrow(
      /check constraint/,
    );
  });

  dbTest("a missing library is a foreign key error the service reports as 404", async () => {
    await expect(
      service.create(2147483000, profileToDraft(RANKING_PRESETS.selector)),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  dbTest("sets selections per surface and replaces them", async () => {
    const [profile] = await repo.listByFriend(mine);
    await repo.setSelections(mine, ["suggestions", "related"], { presetId: "selector" });
    await repo.setSelections(mine, ["related"], { profileId: profile.id });
    expect(await repo.listSelections(mine)).toEqual([
      { surface: "related", preset_id: null, profile_id: profile.id },
      { surface: "suggestions", preset_id: "selector", profile_id: null },
    ]);
    await expect(
      dbQuery(
        `INSERT INTO ranking_profile_selections (friend_id, surface, preset_id, profile_id)
         VALUES ($1, 'recommendations', 'selector', $2)`,
        [mine, profile.id],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      dbQuery(
        `INSERT INTO ranking_profile_selections (friend_id, surface, preset_id) VALUES ($1, 'search', 'x')`,
        [mine],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  dbTest("stores a playlists choice and bounds the surface list at four (#1193)", async () => {
    await repo.setSelections(mine, ["playlists"], { presetId: "beatmatcher" });
    expect(await repo.listSelections(mine)).toContainEqual({
      surface: "playlists",
      preset_id: "beatmatcher",
      profile_id: null,
    });
    const five = ["suggestions", "related", "recommendations", "playlists", "related"] as const;
    await expect(repo.insert(mine, { ...write(), surfaces: [...five] }, 50)).rejects.toThrow(
      /check constraint/,
    );
    await dbQuery(
      `DELETE FROM ranking_profile_selections WHERE friend_id = $1 AND surface = 'playlists'`,
      [mine],
    );
  });

  dbTest("drops selections outside the profile's surfaces", async () => {
    const [profile] = await repo.listByFriend(mine);
    await repo.setSelections(mine, ["suggestions", "related"], { profileId: profile.id });
    await repo.dropSelectionsOutside(profile.id, ["related"]);
    expect((await repo.listSelections(mine)).map((s) => s.surface)).toEqual(["related"]);
  });

  dbTest(
    "an unreadable row lists as Default and resolves with a fallback, never an error",
    async () => {
      const [profile] = await repo.listByFriend(mine);
      await dbQuery(
        `UPDATE ranking_profiles SET config = '{"weights":{"plays":1}}' WHERE id = $1`,
        [profile.id],
      );
      const listed = await service.list(mine);
      expect(listed.profiles.find((p) => p.id === String(profile.id))).toMatchObject({
        invalid: true,
      });
      expect(listed.active.related).toBe("default");
      const ranker = await service.resolveRanker(undefined, mine, "related");
      expect(ranker).toMatchObject({ id: String(profile.id), fallback: true });
    },
  );

  dbTest("deleting a profile, then a library, takes their selections", async () => {
    const [profile] = await repo.listByFriend(mine);
    expect(await repo.delete(profile.id)).toBe(true);
    expect(await repo.delete(profile.id)).toBe(false);
    expect(await repo.listSelections(mine)).toEqual([]);
    await repo.setSelections(theirs, ["suggestions"], { presetId: "beatmatcher" });
    await dbQuery(`DELETE FROM friends WHERE id = $1`, [theirs]);
    expect(await repo.listSelections(theirs)).toEqual([]);
    expect(await repo.listByFriend(theirs)).toEqual([]);
  });
});
