import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { ServerPlayerState } from "@groovenet/contracts";
import { PostgresPlayerStore } from "./store.js";
const enabled = process.env.RUN_PLAYER_DB_TESTS === "1";
const test = it.skipIf(!enabled);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const otherPool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = new PostgresPlayerStore(pool);
const other = new PostgresPlayerStore(otherPool);
const ids = [`test-${randomUUID()}`, `test-${randomUUID()}`];
const state: ServerPlayerState = { queue: [], current_entry_id: null, status: "stopped", position: 0, duration: null, volume: 50, desired_output: null, checkpoint: true, error: null };
beforeAll(async () => { if (enabled) await store.acquire(() => {}); });
afterAll(async () => {
  if (enabled) {
    await pool.query("DELETE FROM server_player_plays WHERE player_id=ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM server_players WHERE id=ANY($1::text[])", [ids]);
  }
  await other.release(); await store.release();
});
test("enforces exclusive workers, durable independent queues, revisions and unique speaker claims in real Postgres", async () => {
  await expect(other.acquire(() => {})).rejects.toMatchObject({ code: "WORKER_ALREADY_RUNNING" });
  let a = await store.create({ id: ids[0]!, name: "First", engine_id: ids[0]! }, state);
  expect(a.availability_policy).toBe("ask");
  const b = await store.create({ id: ids[1]!, name: "Second", engine_id: ids[1]! }, state);
  a.state.queue.push({ id: randomUUID(), track_id: "track-one", friend_id: 1, title: "One", artist: "Artist" });
  a.state.current_entry_id = a.state.queue[0]!.id;
  a.state.desired_output = "test-output";
  a.assigned_output = "test-output";
  a.availability_policy = "always";
  a = await store.save(a, 0);
  await expect(store.save(b, 123)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  await expect(store.save({ ...b, assigned_output: "test-output" }, 0)).rejects.toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
  await store.checkpoint({ ...a, state: { ...a.state, position: 22 } });
  await store.checkpoint({ ...a, revision: 0, state: { ...a.state, position: 99 } });
  const persisted = (await store.list()).filter(row => ids.includes(row.id));
  expect(persisted.find(row => row.id === a.id)!.state.position).toBe(22);
  expect(persisted.find(row => row.id === a.id)!.availability_policy).toBe("always");
  expect(persisted.find(row => row.id === b.id)!.state.queue).toEqual([]);
  const play = { entryId: a.state.queue[0]!.id, playerId: a.id, trackId: "track-one", friendId: 1, releaseId: "release-one", startedAt: new Date("2026-01-01T00:00:00Z") };
  await store.queuePlay(play);
  await store.queuePlay(play);
  expect((await store.pendingPlays()).filter(row => row.entryId === play.entryId)).toEqual([play]);
  await store.markPlayLogged(play.entryId);
  expect((await store.pendingPlays()).some(row => row.entryId === play.entryId)).toBe(false);
  await store.heartbeat();
});
