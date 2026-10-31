import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { SpinSessionRepository } from "../spinSessionRepository";
import { TrackSpinEventRepository } from "../trackSpinEventRepository";
import { spinRecapService } from "@/server/services/spinRecapService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const username = "recap-integration";
let friendId: number;
let rootId: string;
let childId: string;
async function cleanup() {
  await dbQuery("DELETE FROM friends WHERE username = $1", [username]);
  await dbQuery("DELETE FROM genres WHERE slug = 'recap-child'");
  await dbQuery("DELETE FROM genres WHERE slug = 'recap-root'");
}
async function spin(release: string, time: string, medium: "vinyl" | "digital" = "vinyl") {
  const session = await new SpinSessionRepository().createSession(dbPool, {
    friend_id: friendId,
    release_id: release,
    played_at: time,
    selection_mode: "tracks",
    medium,
  });
  await new TrackSpinEventRepository().insertEvents(dbPool, session.id, [
    {
      friend_id: friendId,
      release_id: release,
      track_id: release,
      played_at: time,
      ordinal: 0,
      title_snapshot: release,
      artist_snapshot: "Recap Artist",
      album_snapshot: release,
    },
  ]);
}
beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendId = (
    await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      username,
    ])
  ).rows[0].id;
  rootId = (
    await dbQuery<{ id: string }>(
      "INSERT INTO genres (name, normalized_name, slug, source) VALUES ('Recap Root', 'recap root', 'recap-root', 'custom') RETURNING id",
    )
  ).rows[0].id;
  childId = (
    await dbQuery<{ id: string }>(
      "INSERT INTO genres (name, normalized_name, slug, source, parent_id) VALUES ('Recap Child', 'recap child', 'recap-child', 'custom', $1) RETURNING id",
      [rootId],
    )
  ).rows[0].id;
  for (const release of [
    "recap-old",
    "recap-september",
    "recap-october",
    "recap-boundary",
    "recap-future",
  ]) {
    await dbQuery(
      "INSERT INTO tracks (track_id, friend_id, username, release_id, title, artist, duration_seconds, bpm) VALUES ($1, $2, $3, $1, $1, 'Recap Artist', 360, 120)",
      [release, friendId, username],
    );
  }
  await dbQuery(
    "INSERT INTO track_genres (track_id, friend_id, genre_id, source) VALUES ('recap-boundary', $1, $2, 'manual'), ('recap-boundary', $1, $3, 'manual')",
    [friendId, childId, rootId],
  );
  await spin("recap-old", "2026-08-01T12:00:00Z", "digital");
  await spin("recap-september", "2026-09-15T12:00:00Z");
  await spin("recap-old", "2026-10-10T12:00:00Z");
  await spin("recap-october", "2026-10-15T12:00:00Z", "digital");
  // October 31, Saturday, 23:30 in Los Angeles; Sunday 06:30 in UTC.
  await spin("recap-boundary", "2026-11-01T06:30:00Z");
  // Exactly local midnight is excluded from October, including across DST's month.
  await spin("recap-future", "2026-11-01T07:00:00Z");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});
dbTest(
  "uses local midnight bounds, first-ever spins across media, and recursive root genres",
  async () => {
    vi.stubEnv("GROOVENET_TIME_ZONE", "America/Los_Angeles");
    const result = await spinRecapService.getRecap({ friend_id: friendId, month: "2026-10" });
    expect(result.stats.spins).toEqual({ value: 3, previous: 1 });
    expect(result.stats.new_to_rotation).toEqual({ value: 2, previous: 1 });
    expect(result.stats.records_pulled).toEqual({ value: 3, previous: 1 });
    expect(result.stats.hours.value).toBeCloseTo(0.3);
    expect(result.stats.hours_known_share).toBe(1);
    expect(result.split).toEqual({ vinyl: 2, digital: 1 });
    expect(result.by_week[4]).toEqual({ week: 5, vinyl: 1, digital: 0 });
    expect(result.heatmap[5][11]).toBe(1);
    // Linking the root and its child must not count the same root twice.
    expect(result.genre_mix.current[0]).toEqual({
      genre_id: rootId,
      name: "Recap Root",
      spins: 1,
      share: 1 / 3,
    });
    expect(result.genre_mix.current[1].spins).toBe(2);
  },
);
dbTest("places the same instant in November and UTC weekday/hour buckets", async () => {
  vi.stubEnv("GROOVENET_TIME_ZONE", "UTC");
  const october = await spinRecapService.getRecap({ friend_id: friendId, month: "2026-10" });
  expect(october.stats.spins.value).toBe(2);
  expect(october.stats.new_to_rotation.value).toBe(1);
  const november = await spinRecapService.getRecap({ friend_id: friendId, month: "2026-11" });
  expect(november.stats.spins).toEqual({ value: 2, previous: 2 });
  expect(november.stats.new_to_rotation).toEqual({ value: 2, previous: 1 });
  expect(november.heatmap[6][3]).toBe(2);
  expect(november.by_week[0].vinyl).toBe(2);
});
