/**
 * Editing a spin, against a real Postgres (#336).
 *
 * An edit rewrites the session, its selections and its track events inside one
 * transaction, under a row lock, and play counts are read back from those
 * events — the whole path only means something against a real database. Run
 * with `just spin-sessions-test`.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { AudioIngestRepository } from "@/server/repositories/audioIngestRepository";
import { PlayDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { SpinLoggingService } from "../spinLoggingService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const service = new SpinLoggingService();

const USERNAME = "spin-edit-friend";
const OTHER_USERNAME = "spin-edit-other";
const RELEASE_ID = "spin-edit-release";
const SOURCE = "spin-edit-test";
let friendId = 0;
let otherFriendId = 0;
// An automatic spin must point at the detection that made it.
let detectionId = "";

async function cleanup() {
  // Friends first: their spins cascade away before the detections they point
  // at. The other order fails — an automatic spin may not lose its detection.
  await dbQuery(`DELETE FROM friends WHERE username IN ($1, $2)`, [USERNAME, OTHER_USERNAME]);
  await dbQuery(`DELETE FROM audio_ingests WHERE source_id = $1`, [SOURCE]);
  await dbQuery(`DELETE FROM albums WHERE release_id = $1`, [RELEASE_ID]);
  await dbQuery(`DELETE FROM tracks WHERE release_id = $1`, [RELEASE_ID]);
}

async function playCounts(): Promise<Record<string, number>> {
  const rows = await service.listTopTracks({ friend_id: friendId, release_id: RELEASE_ID });
  return Object.fromEntries(rows.map((row) => [row.track_id, row.play_count]));
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();

  const friends = await dbQuery<{ id: number; username: string }>(
    `INSERT INTO friends (username) VALUES ($1), ($2) RETURNING id, username`,
    [USERNAME, OTHER_USERNAME]
  );
  friendId = friends.rows.find((row) => row.username === USERNAME)!.id;
  otherFriendId = friends.rows.find((row) => row.username === OTHER_USERNAME)!.id;

  await dbQuery(
    `INSERT INTO albums (release_id, friend_id, title, artist)
     VALUES ($1, $2, 'Algo-Ritmo', 'Mexican Institute Of Sound')`,
    [RELEASE_ID, friendId]
  );
  for (const [trackId, position, title] of [
    ["edit-a1", "A1", "Mexico"],
    ["edit-a2", "A2", "Yo Digo Baila"],
    ["edit-b1", "B1", "Alocatel"],
  ]) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, album, release_id, position)
       VALUES ($1, $2, $3, $4, 'Mexican Institute Of Sound', 'Algo-Ritmo', $5, $6)`,
      [trackId, USERNAME, friendId, title, RELEASE_ID, position]
    );
  }

  const ingest = await new AudioIngestRepository().create({
    source_id: SOURCE, session_id: "s1", sequence: 1,
    file_path: "x/1.wav", status: "processed", duration_seconds: 15,
  });
  const detection = await new PlayDetectionRepository().create({
    ingest_id: ingest.id, source_id: SOURCE, session_id: "s1",
    track_id: "edit-a1", friend_id: friendId, confidence: 0.82,
    offset_seconds: 30, window_start_at: new Date("2026-09-20T21:30:00.000Z"),
    fingerprint_type: "chromaprint", fingerprint_version: "1",
  });
  detectionId = detection.id;
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

dbTest("correcting a detected spin moves its play to the right track", async () => {
  const detected = await service.createSpinSession({
    friend_id: friendId,
    release_id: RELEASE_ID,
    played_at: "2026-09-20T21:30:00.000Z",
    track_refs: [{ track_id: "edit-a1", friend_id: friendId }],
    provenance: "automatic",
    source_id: SOURCE,
    detection_id: detectionId,
    confidence: 0.82,
  });
  expect(await playCounts()).toEqual({ "edit-a1": 1 });

  const corrected = await service.updateSpinSession(detected.session.id, friendId, {
    track_refs: [{ track_id: "edit-a2", friend_id: friendId }],
  });

  expect(corrected?.track_events.map((event) => event.track_id)).toEqual(["edit-a2"]);
  expect(corrected?.session.provenance).toBe("automatic");
  expect(corrected?.session.detection_id).toBe(detectionId);
  expect(corrected?.session.corrected_at).not.toBeNull();
  expect(await playCounts()).toEqual({ "edit-a2": 1 });
});

dbTest("changing only the time moves the events with the spin", async () => {
  const spin = await service.createSpinSession({
    friend_id: friendId,
    release_id: RELEASE_ID,
    played_at: "2026-09-21T21:00:00.000Z",
    side_keys: ["A"],
  });

  const moved = await service.updateSpinSession(spin.session.id, friendId, {
    played_at: "2026-09-21T19:00:00.000Z",
    note: "earlier than logged",
  });

  expect(moved?.session.played_at).toBe("2026-09-21T19:00:00.000Z");
  expect(moved?.session.note).toBe("earlier than logged");
  expect(moved?.session.corrected_at).toBeNull();
  expect(moved?.selections.map((selection) => selection.side_key)).toEqual(["A"]);
  expect(moved?.track_events.map((event) => event.played_at)).toEqual([
    "2026-09-21T19:00:00.000Z",
    "2026-09-21T19:00:00.000Z",
  ]);
});

dbTest("a spin is only editable by its friend, and a bad selection changes nothing", async () => {
  const spin = await service.createSpinSession({
    friend_id: friendId,
    release_id: RELEASE_ID,
    played_at: "2026-09-22T21:00:00.000Z",
    side_keys: ["B"],
  });

  await expect(
    service.updateSpinSession(spin.session.id, otherFriendId, { note: "not mine" })
  ).resolves.toBeNull();
  await expect(
    service.updateSpinSession(spin.session.id, friendId, { side_keys: ["Z"] })
  ).rejects.toThrow("Invalid side key: Z");

  const [unchanged] = await service.listSpinSessions({
    friend_id: friendId,
    from: "2026-09-22T00:00:00.000Z",
  });
  expect(unchanged.session.note).toBeNull();
  expect(unchanged.track_events.map((event) => event.track_id)).toEqual(["edit-b1"]);
});
