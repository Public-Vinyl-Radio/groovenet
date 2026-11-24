import { describe, expect, it } from "vitest";
import {
  createServerPlayerSchema,
  serverPlayerCommandSchema,
  serverPlayerEventSchema,
  playerJsonSchemas,
  speakerObservationSchema,
  serverPlayersStreamEventSchema,
  serverPlayerSchema,
  playerErrorSchema,
} from "./players.js";
import { z } from "zod";
const lostPlayer = (error: unknown) => ({
  id: "lounge",
  name: "Lounge",
  engine_id: "primary",
  availability_policy: "ask",
  revision: 4,
  assigned_output: null,
  state: {
    queue: [],
    current_entry_id: null,
    status: "error",
    position: 0,
    duration: null,
    volume: 50,
    desired_output: "202481586338774",
    checkpoint: false,
    error,
  },
});
describe("lost output details (#1241)", () => {
  const output = {
    id: "202481586338774",
    name: "Lounge Room Audio",
    lost_at: "2026-11-21T01:47:41.000Z",
    reason: "output_lost",
    detail: "OwnTone reported the output lost during playback",
    back_at: "2026-11-21T01:48:05.000Z",
    retried: true,
  };
  it("round-trips the loss on the player error", () => {
    const error = { code: "PLAYBACK_INTERRUPTED", message: "gone", output };
    expect(serverPlayerSchema.parse(lostPlayer(error)).state.error).toEqual(error);
    expect(
      playerErrorSchema.parse({ ...error, output: { ...output, reason: "a_new_reason" } }),
    ).toBeTruthy();
  });
  it("keeps errors without the field valid, and nullable", () => {
    const plain = { code: "DEVICE_UNAVAILABLE", message: "OwnTone output is unavailable" };
    expect(serverPlayerSchema.parse(lostPlayer(plain)).state.error).toEqual(plain);
    expect(playerErrorSchema.parse({ ...plain, output: null }).output).toBeNull();
    const minimal = {
      id: output.id,
      name: output.name,
      lost_at: output.lost_at,
      reason: output.reason,
      detail: output.detail,
    };
    expect(playerErrorSchema.parse({ ...plain, output: minimal }).output).toEqual(minimal);
    expect(playerErrorSchema.safeParse({ ...plain, output: { ...output, id: "" } }).success).toBe(
      false,
    );
  });
  it("is stripped, not rejected, by a client built before the field existed", () => {
    // The pre-#1241 error shape: a plain object, so unknown keys are dropped.
    const before = z.object({ code: z.string(), message: z.string() });
    expect(before.parse({ code: "X", message: "m", output })).toEqual({ code: "X", message: "m" });
  });
});
describe("server-player contracts", () => {
  it("accepts persistent names and configured engine identifiers, not client-supplied URLs", () => {
    expect(
      createServerPlayerSchema.parse({ id: "lounge", name: " Lounge ", engine_id: "primary" }).name,
    ).toBe("Lounge");
    expect(
      createServerPlayerSchema.safeParse({
        id: "lounge",
        name: "Lounge",
        engine_id: "primary",
        apiUrl: "http://attacker",
      }).success,
    ).toBe(false);
    expect(
      createServerPlayerSchema.safeParse({ id: "../escape", name: "Lounge", engine_id: "primary" })
        .success,
    ).toBe(false);
  });
  it("accepts commands with or without a revision and never defaults to takeover", () => {
    for (const availability_policy of ["ask", "allow_unknown", "always"])
      expect(
        serverPlayerCommandSchema.parse({ type: "availability.set", availability_policy }),
      ).toMatchObject({ availability_policy });
    expect(
      serverPlayerCommandSchema.safeParse({
        type: "availability.set",
        availability_policy: "unsafe",
      }).success,
    ).toBe(false);
    expect(
      (playerJsonSchemas.ServerPlayer as { properties: Record<string, unknown> }).properties,
    ).toHaveProperty("availability_policy");
    expect(serverPlayerCommandSchema.parse({ type: "play", expected_revision: 3 })).toMatchObject({
      allow_unknown: false,
      takeover: false,
    });
    expect(serverPlayerCommandSchema.parse({ type: "play" })).toEqual({
      type: "play",
      allow_unknown: false,
      takeover: false,
    });
    expect(
      serverPlayerCommandSchema.safeParse({ type: "pause", expected_revision: -1 }).success,
    ).toBe(false);
    expect(
      serverPlayerCommandSchema.safeParse({ type: "seek", expected_revision: 1, seconds: -1 })
        .success,
    ).toBe(false);
    expect(
      serverPlayerCommandSchema.safeParse({ type: "volume", expected_revision: 1, volume: 101 })
        .success,
    ).toBe(false);
    expect(
      serverPlayerCommandSchema.safeParse({
        type: "queue.add",
        expected_revision: 1,
        tracks: [{ track_id: "a", friend_id: 1, local_audio_url: "/secret" }],
      }).success,
    ).toBe(false);
  });
  it("requires the source revision for transfers and exports an optional target revision", () => {
    expect(
      serverPlayerCommandSchema.safeParse({
        type: "output.transfer",
        from_player_id: "a",
        output_id: "s",
      }).success,
    ).toBe(false);
    expect(
      serverPlayerCommandSchema.parse({
        type: "output.transfer",
        from_player_id: "a",
        from_revision: 2,
        output_id: "s",
      }),
    ).toMatchObject({ play: false });
    expect(
      serverPlayerCommandSchema.parse({
        type: "output.transfer",
        expected_revision: 1,
        from_player_id: "a",
        from_revision: 2,
        output_id: "s",
      }),
    ).toMatchObject({ expected_revision: 1 });
    const variants = (
      playerJsonSchemas.ServerPlayerCommand as {
        oneOf: Array<{ required: string[]; properties: Record<string, unknown> }>;
      }
    ).oneOf;
    expect(variants.every((variant) => !variant.required.includes("expected_revision"))).toBe(true);
    expect(
      variants.find(
        (variant) => variant.properties.type && variant.required.includes("from_revision"),
      ),
    ).toBeTruthy();
    expect(playerJsonSchemas.ServerPlayer).toHaveProperty("properties");
    expect(serverPlayerEventSchema.safeParse({ type: "snapshot" }).success).toBe(false);
  });
});

it("preserves mapping diagnostics and sender identity in device observations", () => {
  const observation = {
    availability: "occupied",
    source: "home_assistant",
    observed_at: "now",
    entity_id: "media_player.room",
    sender_identity: "groovenet",
    sender_engine_id: "primary",
  };
  expect(speakerObservationSchema.parse(observation)).toEqual(observation);
  expect(
    speakerObservationSchema.safeParse({ ...observation, sender_identity: "trusted" }).success,
  ).toBe(false);
  expect(
    speakerObservationSchema.parse({
      availability: "unknown",
      source: "unconfigured",
      observed_at: null,
      sender_identity: "unknown",
    }),
  ).not.toHaveProperty("entity_id");
});

it("validates atomic queue replacement and keeps playback opt-in", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const entry = { id, track_id: "track", friend_id: 1 };
  expect(
    serverPlayerCommandSchema.parse({
      type: "queue.replace",
      expected_revision: 3,
      entries: [entry],
    }),
  ).toMatchObject({ entries: [entry], play: false, allow_unknown: false, takeover: false });
  expect(
    serverPlayerCommandSchema.parse({ type: "queue.replace", entries: [entry] }),
  ).not.toHaveProperty("expected_revision");
  for (const command of [
    { entries: [entry, entry] },
    { entries: [{ ...entry, id: "invalid" }] },
    { entries: [{ ...entry, local_audio_url: "/secret" }] },
    { entries: [entry], position: -1 },
    { entries: [entry], position: Infinity },
    { entries: [entry], current_entry_id: "invalid" },
    { entries: Array.from({ length: 10001 }, () => ({ track_id: "track", friend_id: 1 })) },
  ])
    expect(
      serverPlayerCommandSchema.safeParse({
        type: "queue.replace",
        expected_revision: 3,
        ...command,
      }).success,
    ).toBe(false);
  expect(
    serverPlayerCommandSchema.parse({
      type: "queue.replace",
      expected_revision: 0,
      entries: [],
      current_entry_id: null,
    }).entries,
  ).toEqual([]);
});

it("validates bounded joins and the aggregate stream's initial list", () => {
  const tracks = [{ track_id: "track", friend_id: 1 }];
  expect(serverPlayerCommandSchema.parse({ type: "session.join", tracks })).toEqual({
    type: "session.join",
    tracks,
    allow_unknown: false,
    takeover: false,
  });
  for (const change of [
    { tracks: [] },
    { tracks: Array(1001).fill(tracks[0]) },
    { at: 0 },
    { tracks: [{ ...tracks[0], local_audio_url: "secret" }] },
  ]) {
    expect(
      serverPlayerCommandSchema.safeParse({ type: "session.join", tracks, ...change }).success,
    ).toBe(false);
  }
  const initial = {
    type: "players",
    players: [],
    worker_instance: "33333333-3333-4333-8333-333333333333",
    sequence: 1,
  };
  expect(serverPlayersStreamEventSchema.parse(initial)).toEqual(initial);
  expect(serverPlayersStreamEventSchema.safeParse({ ...initial, players: [{}] }).success).toBe(
    false,
  );
});

it("requires explicit authorization for stopping a foreign engine", () => {
  expect(serverPlayerCommandSchema.parse({ type: "engine.stop", takeover: true })).toEqual({
    type: "engine.stop",
    takeover: true,
    allow_unknown: false,
  });
  for (const takeover of [undefined, false]) {
    expect(serverPlayerCommandSchema.safeParse({ type: "engine.stop", takeover }).success).toBe(
      false,
    );
  }
});
