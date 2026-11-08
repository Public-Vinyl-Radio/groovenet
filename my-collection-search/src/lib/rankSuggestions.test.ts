import { describe, expect, it } from "vitest";
import type { Track } from "@/types/track";
import {
  blendSuggestionSources,
  layoutSuggestions,
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
    expect(ranked.folds).toEqual([
      { key: "1:artist:album", release: "Album", tracks: candidates.slice(1) },
    ]);
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

describe("layoutSuggestions", () => {
  const seed = track("seed");
  // Scores fix the order: a1 (release A), b1 (B), c1 (C), then the A and B siblings.
  const ranked = rankSuggestions(
    [
      track("a1", { album: "A", _score: 0.9 }),
      track("b1", { album: "B", _score: 0.8 }),
      track("c1", { album: "C", _score: 0.7 }),
      track("a2", { album: "A", _score: 0.6 }),
      track("a3", { album: "A", _score: 0.5 }),
      track("b2", { album: "B", _score: 0.4 }),
    ],
    { seed },
  );
  const keyA = ranked.folds.find((fold) => fold.release === "A")!.key;
  const keyB = ranked.folds.find((fold) => fold.release === "B")!.key;
  const labels = (items: ReturnType<typeof layoutSuggestions>["items"]) =>
    items.map((item) =>
      item.kind === "track"
        ? `${item.rank}:${item.track.track_id}`
        : `+${item.fold.tracks.length} ${item.fold.release}`,
    );

  it("places each fold directly under its release's row", () => {
    const layout = layoutSuggestions(ranked, { expanded: [], limit: 20 });
    expect(labels(layout.items)).toEqual(["1:a1", "+2 A", "2:b1", "+1 B", "3:c1"]);
    expect(layout).toMatchObject({ shown: 3, total: 3, remaining: 0 });
  });

  it("expands a release in place, ranking its tracks where they appear", () => {
    const layout = layoutSuggestions(ranked, { expanded: [keyA], limit: 20 });
    expect(labels(layout.items)).toEqual(["1:a1", "2:a2", "3:a3", "4:b1", "+1 B", "5:c1"]);
    expect(layout).toMatchObject({ shown: 5, total: 5, remaining: 0 });
  });

  it("hides a fold until its release has a visible row, then shows it on the next page", () => {
    const first = layoutSuggestions(ranked, { expanded: [], limit: 1 });
    expect(labels(first.items)).toEqual(["1:a1", "+2 A"]);
    expect(first).toMatchObject({ shown: 1, total: 3, remaining: 2 });
    const next = layoutSuggestions(ranked, { expanded: [], limit: 2 });
    expect(labels(next.items)).toEqual(["1:a1", "+2 A", "2:b1", "+1 B"]);
  });

  it("does not count expanded tracks against the page", () => {
    const layout = layoutSuggestions(ranked, { expanded: [keyA], limit: 2 });
    expect(labels(layout.items)).toEqual(["1:a1", "2:a2", "3:a3", "4:b1", "+1 B"]);
    expect(layout).toMatchObject({ shown: 4, total: 5, remaining: 1 });
  });

  it("keeps an expanded release's tracks off screen while its row is paged out", () => {
    const layout = layoutSuggestions(ranked, { expanded: [keyB], limit: 1 });
    expect(labels(layout.items)).toEqual(["1:a1", "+2 A"]);
    expect(layout).toMatchObject({ shown: 1, total: 4, remaining: 2 });
  });

  it("puts the fold after the last visible row when a release shows more than one", () => {
    const capped = rankSuggestions(
      [
        track("a1", { album: "A", _score: 0.9 }),
        track("b1", { album: "B", _score: 0.8 }),
        track("a2", { album: "A", _score: 0.7 }),
        track("a3", { album: "A", _score: 0.6 }),
      ],
      { seed, varietyCap: 2 },
    );
    expect(labels(layoutSuggestions(capped, { expanded: [], limit: 20 }).items)).toEqual([
      "1:a1",
      "2:b1",
      "3:a2",
      "+1 A",
    ]);
  });

  it("keeps same-titled albums by different artists apart", () => {
    const split = rankSuggestions(
      [
        track("x1", { album: "Same", artist: "X", _score: 0.9 }),
        track("y1", { album: "Same", artist: "Y", _score: 0.8 }),
        track("x2", { album: "Same", artist: "X", _score: 0.7 }),
        track("y2", { album: "Same", artist: "Y", _score: 0.6 }),
      ],
      { seed },
    );
    const keyX = split.folds[0].key;
    expect(labels(layoutSuggestions(split, { expanded: [keyX], limit: 20 }).items)).toEqual([
      "1:x1",
      "2:x2",
      "3:y1",
      "+1 Same",
    ]);
  });

  it("treats a negative limit as an empty page", () => {
    expect(layoutSuggestions(ranked, { expanded: [], limit: -1 })).toMatchObject({
      items: [],
      shown: 0,
      remaining: 3,
    });
  });
});
