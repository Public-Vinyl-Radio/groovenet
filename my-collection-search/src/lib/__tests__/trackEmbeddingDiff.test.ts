import { describe, it, expect } from "vitest";
import { computeEmbeddingUpdates } from "../trackEmbeddingDiff";

function track(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "t1",
    friend_id: 1,
    title: "Title",
    artist: "Artist",
    album: "Album",
    year: "2000",
    composer: "Composer",
    styles: ["Deep House"],
    genres: ["Electronic"],
    local_tags: "crate1",
    bpm: 120,
    key: "A minor",
    danceability: 0.8,
    mood_happy: 0.5,
    mood_sad: 0.1,
    mood_relaxed: 0.2,
    mood_aggressive: 0.3,
    notes: "",
    star_rating: 3,
    ...overrides,
  };
}

describe("computeEmbeddingUpdates", () => {
  it("reports no changes when current and updated are identical", () => {
    expect(computeEmbeddingUpdates(track(), track())).toEqual({
      prompt: false,
      identity: false,
      audioVibe: false,
    });
  });

  it("ignores fields outside every set (e.g. star_rating)", () => {
    const plan = computeEmbeddingUpdates(track({ star_rating: 3 }), track({ star_rating: 5 }));
    expect(plan).toEqual({ prompt: false, identity: false, audioVibe: false });
  });

  // ─── prompt-only fields ───────────────────────────────────────────────────

  it("flags prompt only when notes changes", () => {
    const plan = computeEmbeddingUpdates(track({ notes: "" }), track({ notes: "great" }));
    expect(plan).toEqual({ prompt: true, identity: false, audioVibe: false });
  });

  // ─── audio-vibe fields also live in prompt ────────────────────────────────

  it("flags prompt and audioVibe when bpm changes", () => {
    const plan = computeEmbeddingUpdates(track({ bpm: 120 }), track({ bpm: 130 }));
    expect(plan).toEqual({ prompt: true, identity: false, audioVibe: true });
  });

  it("flags audioVibe only when mood_sad changes (not a prompt field)", () => {
    const plan = computeEmbeddingUpdates(track({ mood_sad: 0.1 }), track({ mood_sad: 0.9 }));
    expect(plan).toEqual({ prompt: false, identity: false, audioVibe: true });
  });

  // ─── identity-only fields ─────────────────────────────────────────────────

  it("flags identity only when title changes", () => {
    const plan = computeEmbeddingUpdates(track({ title: "Old" }), track({ title: "New" }));
    expect(plan).toEqual({ prompt: false, identity: true, audioVibe: false });
  });

  it("flags identity only when composer changes", () => {
    const plan = computeEmbeddingUpdates(track({ composer: "A" }), track({ composer: "B" }));
    expect(plan).toEqual({ prompt: false, identity: true, audioVibe: false });
  });

  // ─── shared fields ────────────────────────────────────────────────────────

  it("flags prompt and identity when local_tags changes", () => {
    const plan = computeEmbeddingUpdates(track({ local_tags: "a" }), track({ local_tags: "a,b" }));
    expect(plan).toEqual({ prompt: true, identity: true, audioVibe: false });
  });

  it("flags prompt and identity when styles array content changes", () => {
    const plan = computeEmbeddingUpdates(
      track({ styles: ["Deep House"] }),
      track({ styles: ["Tech House"] })
    );
    expect(plan).toEqual({ prompt: true, identity: true, audioVibe: false });
  });

  // ─── array comparison semantics ───────────────────────────────────────────

  it("does not flag when array content is identical", () => {
    const plan = computeEmbeddingUpdates(
      track({ genres: ["A", "B"] }),
      track({ genres: ["A", "B"] })
    );
    expect(plan.prompt).toBe(false);
    expect(plan.identity).toBe(false);
  });

  it("flags when array order changes", () => {
    const plan = computeEmbeddingUpdates(
      track({ genres: ["A", "B"] }),
      track({ genres: ["B", "A"] })
    );
    expect(plan.prompt).toBe(true);
  });

  it("treats null/undefined array as empty (null → [] is not a change)", () => {
    const plan = computeEmbeddingUpdates(
      track({ styles: null }),
      track({ styles: [] })
    );
    expect(plan.prompt).toBe(false);
    expect(plan.identity).toBe(false);
  });

  it("flags when array goes from empty to populated", () => {
    const plan = computeEmbeddingUpdates(
      track({ genres: [] }),
      track({ genres: ["House"] })
    );
    expect(plan.prompt).toBe(true);
  });

  // ─── null current (track had no prior row) ────────────────────────────────

  it("handles a null current track without throwing", () => {
    const plan = computeEmbeddingUpdates(null, track());
    expect(plan.prompt).toBe(true);
    expect(plan.identity).toBe(true);
    expect(plan.audioVibe).toBe(true);
  });
});
