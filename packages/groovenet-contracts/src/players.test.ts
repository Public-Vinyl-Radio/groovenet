import { describe, expect, it } from "vitest";
import { createServerPlayerSchema, serverPlayerCommandSchema, serverPlayerEventSchema, playerJsonSchemas } from "./players.js";
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
