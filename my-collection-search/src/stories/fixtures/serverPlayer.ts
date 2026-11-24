import type { ServerPlayer } from "@groovenet/contracts";

/** The lounge after its AirPlay receiver dropped out (#1241): error, assigned null, desired kept. */
export function lostSpeakerPlayer({ back = false } = {}): ServerPlayer {
  const lost: ServerPlayer = {
    id: "lounge",
    name: "Lounge",
    engine_id: "primary",
    availability_policy: "ask",
    revision: 3,
    assigned_output: null,
    state: {
      queue: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          track_id: "cumbia-beckiana",
          friend_id: 1,
          title: "Cumbia Beckiana",
          artist: "Artist",
        },
      ],
      current_entry_id: "11111111-1111-4111-8111-111111111111",
      status: "error",
      position: 12,
      duration: 100,
      volume: 30,
      desired_output: "202481586338774",
      checkpoint: false,
      error: null,
    },
  };
  lost.state.status = "error";
  lost.state.desired_output = "202481586338774";
  lost.state.error = back
    ? {
        code: "DEVICE_UNAVAILABLE",
        message: "Lounge Room Audio is back — press play to resume.",
        output: {
          id: "202481586338774",
          name: "Lounge Room Audio",
          lost_at: "2026-11-21T01:47:41.000Z",
          reason: "not_listed",
          detail: "OwnTone no longer lists the output",
          back_at: "2026-11-21T01:48:05.000Z",
        },
      }
    : {
        code: "PLAYBACK_INTERRUPTED",
        message:
          "Lounge Room Audio went away during playback. The queue has not advanced; press play once it is back.",
        output: {
          id: "202481586338774",
          name: "Lounge Room Audio",
          lost_at: "2026-11-21T01:47:41.000Z",
          reason: "output_lost",
          detail: "OwnTone reported the output lost during playback",
          back_at: null,
        },
      };
  return lost;
}
