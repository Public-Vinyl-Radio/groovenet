import { describe, expect, it } from "vitest";
import { createServerPlayerSchema, serverPlayerCommandSchema, serverPlayerEventSchema, playerJsonSchemas, speakerObservationSchema } from "./players.js";
describe("server-player contracts", () => {
  it("accepts persistent names and configured engine identifiers, not client-supplied URLs", () => {
    expect(createServerPlayerSchema.parse({ id: "lounge", name: " Lounge ", engine_id: "primary" }).name).toBe("Lounge");
    expect(createServerPlayerSchema.safeParse({ id: "lounge", name: "Lounge", engine_id: "primary", apiUrl: "http://attacker" }).success).toBe(false);
    expect(createServerPlayerSchema.safeParse({ id: "../escape", name: "Lounge", engine_id: "primary" }).success).toBe(false);
  });
  it("requires a revision and explicit occupancy overrides; defaults never authorize takeover", () => {
    expect(serverPlayerCommandSchema.parse({ type: "play", expected_revision: 3 })).toMatchObject({ allow_unknown: false, takeover: false });
    expect(serverPlayerCommandSchema.safeParse({ type: "play" }).success).toBe(false);
    expect(serverPlayerCommandSchema.safeParse({ type: "seek", expected_revision: 1, seconds: -1 }).success).toBe(false);
    expect(serverPlayerCommandSchema.safeParse({ type: "volume", expected_revision: 1, volume: 101 }).success).toBe(false);
    expect(serverPlayerCommandSchema.safeParse({ type: "queue.add", expected_revision: 1, tracks: [{ track_id: "a", friend_id: 1, local_audio_url: "/secret" }] }).success).toBe(false);
  });
  it("requires both player revisions for transfers and exports reusable JSON schemas", () => {
    expect(serverPlayerCommandSchema.safeParse({ type: "output.transfer", expected_revision: 1, from_player_id: "a", output_id: "s" }).success).toBe(false);
    expect(serverPlayerCommandSchema.parse({ type: "output.transfer", expected_revision: 1, from_player_id: "a", from_revision: 2, output_id: "s" })).toMatchObject({ play: false });
    expect(playerJsonSchemas.ServerPlayer).toHaveProperty("properties");
    expect(serverPlayerEventSchema.safeParse({ type: "snapshot" }).success).toBe(false);
  });
});

it("preserves mapping diagnostics and sender identity in device observations", () => {
  const observation = { availability: "occupied", source: "home_assistant", observed_at: "now", entity_id: "media_player.room", sender_identity: "groovenet", sender_engine_id: "primary" };
  expect(speakerObservationSchema.parse(observation)).toEqual(observation);
  expect(speakerObservationSchema.safeParse({ ...observation, sender_identity: "trusted" }).success).toBe(false);
  expect(speakerObservationSchema.parse({ availability: "unknown", source: "unconfigured", observed_at: null, sender_identity: "unknown" })).not.toHaveProperty("entity_id");
});

it("validates atomic queue replacement and keeps playback opt-in", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const entry = { id, track_id: "track", friend_id: 1 };
  expect(serverPlayerCommandSchema.parse({ type: "queue.replace", expected_revision: 3, entries: [entry] })).toMatchObject({ entries: [entry], play: false, allow_unknown: false, takeover: false });
  for (const command of [
    { entries: [entry, entry] }, { entries: [{ ...entry, id: "invalid" }] },
    { entries: [{ ...entry, local_audio_url: "/secret" }] }, { entries: [entry], position: -1 },
    { entries: [entry], position: Infinity }, { entries: [entry], current_entry_id: "invalid" },
    { entries: Array.from({ length: 10001 }, () => ({ track_id: "track", friend_id: 1 })) },
  ]) expect(serverPlayerCommandSchema.safeParse({ type: "queue.replace", expected_revision: 3, ...command }).success).toBe(false);
  expect(serverPlayerCommandSchema.parse({ type: "queue.replace", expected_revision: 0, entries: [], current_entry_id: null }).entries).toEqual([]);
});
