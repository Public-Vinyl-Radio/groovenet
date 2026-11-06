import { describe, expect, it } from "vitest";
import type { Track } from "@/types/track";
import {
  blendSuggestionSources,
  rankSuggestions,
  SUGGESTION_RANK_WEIGHTS,
} from "./rankSuggestions";

const track = (id: string, values: Partial<Track> & { _score?: number } = {}) =>
  ({
    track_id: id,
    friend_id: 1,
    title: id,
    artist: "Artist",
    album: id,
    bpm: "120",
    key: "C major",
    ...values,
  }) as Track;

describe("rankSuggestions", () => {
  it("excludes the seed and playlist tracks by their compound identity", () => {
    const seed = track("seed");
    const candidates = [
      seed,
      track("already-in-list"),
      track("same-id-other-library", { friend_id: 2 }),
      track("keep"),
    ];
    expect(
      rankSuggestions(candidates, { seed, playlist: [seed, track("already-in-list")] }).tracks.map(
        (item) => item.track_id,
      ),
    ).toEqual(["same-id-other-library", "keep"]);
  });

  it("keeps one track per release and reports the rest as folds", () => {
    const seed = track("seed");
    const candidates = ["a", "b", "c"].map((id) => track(id, { album: "Album" }));
    const ranked = rankSuggestions(candidates, { seed });
    expect(ranked.tracks).toHaveLength(1);
    expect(ranked.folds).toEqual([{ release: "Album", tracks: candidates.slice(1) }]);
    expect(rankSuggestions(candidates, { seed, varietyCap: 2 }).folds[0].tracks).toHaveLength(1);
    expect(
      rankSuggestions(
        [track("unknown-release-1", { album: "" }), track("unknown-release-2", { album: "" })],
        { seed },
      ).folds,
    ).toHaveLength(0);
  });

  it("filters key clashes and BPM values outside six percent, counting hidden candidates", () => {
    const seed = track("seed");
    const ranked = rankSuggestions(
      [
        track("same", { key: "A minor" }),
        track("clash", { key: "F minor" }),
        track("fast", { bpm: "130" }),
      ],
      { seed, filters: { compatibleKey: true, bpmWithinSixPercent: true } },
    );
    expect(ranked.tracks.map((item) => item.track_id)).toEqual(["same"]);
    expect(ranked.hiddenByFilters).toBe(2);
  });

  it("passes unknown BPM and key and can disable filters", () => {
    const seed = track("seed");
    const unknown = track("unknown", { bpm: null, key: null });
    expect(
      rankSuggestions([unknown], {
        seed,
        filters: { compatibleKey: true, bpmWithinSixPercent: true },
      }).tracks,
    ).toEqual([unknown]);
    expect(
      rankSuggestions([track("clash", { key: "F sharp major", bpm: "140" })], { seed }).tracks,
    ).toHaveLength(1);
    expect(
      rankSuggestions([track("with-bpm"), track("also-no-bpm", { bpm: null })], { seed }).tracks,
    ).toHaveLength(2);
  });

  it("uses the last playlist track as comparison seed in playlist mode", () => {
    const first = track("first", { bpm: "90", key: "C major" });
    const last = track("last", { bpm: "120", key: "A minor" });
    const nearLast = track("near-last", { bpm: "123", key: "A minor" });
    const nearFirst = track("near-first", { bpm: "90", key: "C major" });
    const options = {
      seed: first,
      playlist: [first, last],
      seedMode: "playlist" as const,
      filters: { compatibleKey: true, bpmWithinSixPercent: true },
    };
    expect(
      rankSuggestions([nearLast, nearFirst], options).tracks.map((item) => item.track_id),
    ).toEqual(["near-last"]);
    expect(
      rankSuggestions([nearLast, nearFirst], { ...options, seedMode: "track" }).tracks.map(
        (item) => item.track_id,
      ),
    ).toEqual(["near-first"]);
    expect(
      rankSuggestions([nearFirst], { seed: first, seedMode: "playlist" }).tracks.map(
        (item) => item.track_id,
      ),
    ).toEqual(["near-first"]);
  });

  it("keeps similarity primary and centralizes key and BPM boosts", () => {
    const seed = track("seed");
    const result = rankSuggestions(
      [
        track("high-similarity", { _score: 0.95, key: "F minor", bpm: "120" }),
        track("mix-fit", { _score: 0.89, key: "A minor", bpm: "120" }),
      ],
      { seed },
    );
    expect(result.tracks.map((item) => item.track_id)).toEqual(["high-similarity", "mix-fit"]);
    expect(SUGGESTION_RANK_WEIGHTS).toEqual({ sameKey: 0.02, adjacentKey: 0.01, closestBpm: 0.01 });
  });

  it("uses the best recommendation similarity score before mix adjustments", () => {
    const seed = track("seed");
    const candidates = [
      { ...track("identity"), _simIdentity: 0.8, _simAudio: null },
      { ...track("audio"), _simIdentity: null, _simAudio: 0.7 },
      track("no-score"),
    ];
    expect(rankSuggestions(candidates, { seed }).tracks.map((item) => item.track_id)).toEqual([
      "identity",
      "audio",
      "no-score",
    ]);
  });

  it("blends duplicate sources into one candidate with combined provenance", () => {
    const candidate = track("shared");
    const result = blendSuggestionSources([
      { name: "ai", tracks: [candidate], score: () => 0.7 },
      { name: "vibe", tracks: [candidate], score: () => 0.8 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ _score: 0.8, _sources: ["ai", "vibe"] });
  });
});
