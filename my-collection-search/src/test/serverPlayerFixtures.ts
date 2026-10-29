import type { ServerPlayer, ServerPlayerDevice } from "@groovenet/contracts";
export const entryA = "11111111-1111-4111-8111-111111111111";
export const entryB = "22222222-2222-4222-8222-222222222222";
export const workerA = "33333333-3333-4333-8333-333333333333";
export const workerB = "44444444-4444-4444-8444-444444444444";
export function player(id = "lounge", revision = 3): ServerPlayer {
  return {
    id,
    name: id === "lounge" ? "Lounge" : "Aswitch",
    engine_id: "primary",
    availability_policy: "ask",
    revision,
    assigned_output: null,
    state: {
      queue: [
        { id: entryA, track_id: "same-track", friend_id: 1, title: "Track", artist: "Artist" },
        { id: entryB, track_id: "same-track", friend_id: 2, title: "Track", artist: "Artist" },
      ],
      current_entry_id: entryA,
      status: "paused",
      position: 12,
      duration: 100,
      volume: 30,
      desired_output: "speaker",
      checkpoint: false,
      error: null,
    },
  };
}
export const device: ServerPlayerDevice = {
  id: "speaker",
  name: "Speaker",
  assigned_player_id: null,
  desired_by: ["lounge"],
  observed: {
    availability: "unknown",
    observed_at: null,
    source: "unconfigured",
    sender_identity: "unknown",
  },
};
