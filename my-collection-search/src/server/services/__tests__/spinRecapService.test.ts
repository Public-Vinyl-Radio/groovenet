import { beforeEach, expect, it, vi } from "vitest";
import { spinRecapResponseSchema } from "@groovenet/contracts";
import { spinRecapRepository, type RecapGroup } from "@/server/repositories/spinRecapRepository";
import { spinRecapService } from "../spinRecapService";

vi.mock("@/server/repositories/spinRecapRepository", () => ({
  spinRecapRepository: { groups: vi.fn(), firstSpins: vi.fn() },
}));
const query = { friend_id: 4, month: "2026-10" };
const group = (patch: Partial<RecapGroup> = {}): RecapGroup => ({
  current: true,
  release_id: "r1",
  track_id: "t1",
  title: "Track",
  artist: "Artist",
  album: "Record",
  record_artist: "Artist",
  thumbnail: null,
  medium: "vinyl",
  week: 5,
  weekday: 5,
  block: 11,
  duration: 1800,
  bpm: 120,
  genres: [],
  spins: 1,
  ...patch,
});
beforeEach(() => {
  vi.stubEnv("GROOVENET_TIME_ZONE", "America/Los_Angeles");
  vi.mocked(spinRecapRepository.groups).mockResolvedValue([]);
  vi.mocked(spinRecapRepository.firstSpins).mockResolvedValue({ current: 0, previous: 0 });
});

it("shapes an empty month with complete zero buckets and nullable BPM summaries", async () => {
  const result = await spinRecapService.getRecap(query);
  expect(spinRecapResponseSchema.parse(result)).toEqual(result);
  expect(result.stats.spins).toEqual({ value: 0, previous: 0 });
  expect(result.stats.hours_known_share).toBe(0);
  expect(result.stats.hours_known_spins).toBe(0);
  expect(result.by_week).toHaveLength(5);
  expect(result.heatmap).toEqual(Array.from({ length: 7 }, () => Array(12).fill(0)));
  expect(result.genre_mix.current).toEqual([{ genre_id: null, name: "Other", spins: 0, share: 0 }]);
  expect(result.bpm.median).toBeNull();
  expect(result.bpm.busiest).toBeNull();
  expect(spinRecapRepository.groups).toHaveBeenCalledWith(4, "2026-10", "America/Los_Angeles");
  expect(spinRecapRepository.firstSpins).toHaveBeenCalledWith(4, "2026-10", "America/Los_Angeles");
});

it("counts mixed media, known durations, previous values, and repeated tracks", async () => {
  vi.mocked(spinRecapRepository.groups).mockResolvedValue([
    group({ spins: 2 }),
    group({ medium: "digital", duration: null, bpm: null }),
    group({
      current: false,
      release_id: "old",
      spins: 4,
      genres: [{ genre_id: "root", name: "House" }],
    }),
  ]);
  vi.mocked(spinRecapRepository.firstSpins).mockResolvedValue({ current: 1, previous: 2 });
  const result = await spinRecapService.getRecap(query);
  expect(result.stats).toEqual({
    spins: { value: 3, previous: 4 },
    hours: { value: 1, previous: 2 },
    records_pulled: { value: 1, previous: 1 },
    new_to_rotation: { value: 1, previous: 2 },
    hours_known_share: 2 / 3,
    hours_known_spins: 2,
  });
  expect(result.split).toEqual({ vinyl: 2, digital: 1 });
  expect(result.by_week[4]).toEqual({ week: 5, vinyl: 2, digital: 1 });
  expect(result.heatmap[5][11]).toBe(3);
  expect(result.top_records).toEqual([
    { release_id: "r1", title: "Record", artist: "Artist", thumbnail: null, spins: 3 },
  ]);
  expect(result.top_tracks[0]).toMatchObject({ track_id: "t1", spins: 3 });
  expect(result.top_artists).toEqual([{ artist: "Artist", spins: 3 }]);
  expect(result.genre_mix.previous[0]).toEqual({
    genre_id: "root",
    name: "House",
    spins: 4,
    share: 1,
  });
  expect(result.bpm.median).toBe(120);
});

it("returns five genres, folds overflow and untagged spins into Other, and shares multi-root spins", async () => {
  vi.mocked(spinRecapRepository.groups).mockResolvedValue([
    ...Array.from({ length: 7 }, (_, i) =>
      group({ genres: [{ genre_id: String(i), name: `Genre ${i}` }], spins: i + 1 }),
    ),
    group({ spins: 2 }),
    group({
      genres: [
        { genre_id: "6", name: "Genre 6" },
        { genre_id: "5", name: "Genre 5" },
      ],
      spins: 2,
    }),
  ]);
  const result = await spinRecapService.getRecap(query);
  expect(result.genre_mix.current).toHaveLength(6);
  expect(result.genre_mix.current[0]).toMatchObject({ genre_id: "6", spins: 8, share: 8 / 32 });
  expect(result.genre_mix.current[5]).toEqual({
    genre_id: null,
    name: "Other",
    spins: 5,
    share: 5 / 32,
  });
  expect(result.genre_mix.current.reduce((sum, g) => sum + g.share, 0)).toBe(1);
});

it("clamps BPM edges, computes an even median and resolves busiest-bin ties toward the lower bin", async () => {
  vi.mocked(spinRecapRepository.groups).mockResolvedValue(
    [60, 80, 89.99, 90, 190, 199.9, 200, 240].map((bpm) => group({ bpm })),
  );
  const result = await spinRecapService.getRecap(query);
  expect(result.bpm.histogram.map((bin) => bin.spins)).toEqual([
    3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4,
  ]);
  expect(result.bpm.median).toBe(140);
  expect(result.bpm.busiest).toEqual({ from: 190, to: 200, spins: 4 });
  vi.mocked(spinRecapRepository.groups).mockResolvedValue([
    group({ bpm: 100 }),
    group({ bpm: 90 }),
  ]);
  expect((await spinRecapService.getRecap(query)).bpm.busiest?.from).toBe(90);
});

it("breaks top and genre ties deterministically and limits all leaderboards to five", async () => {
  const rows = Array.from({ length: 7 }, (_, i) =>
    group({
      release_id: `r${i}`,
      track_id: `t${i}`,
      artist: `Artist${i}`,
      genres: [{ genre_id: `${i}`, name: `${i}` }],
    }),
  );
  vi.mocked(spinRecapRepository.groups).mockResolvedValue([...rows].reverse());
  const result = await spinRecapService.getRecap(query);
  expect(result.top_records.map((r) => r.release_id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  expect(result.top_tracks).toHaveLength(5);
  expect(result.top_artists).toHaveLength(5);
  expect(result.genre_mix.current.slice(0, 5).map((g) => g.genre_id)).toEqual([
    "0",
    "1",
    "2",
    "3",
    "4",
  ]);
});

it("propagates repository failures", async () => {
  vi.mocked(spinRecapRepository.groups).mockRejectedValueOnce(new Error("db down"));
  await expect(spinRecapService.getRecap(query)).rejects.toThrow("db down");
});

it("orders leaders by count before ID regardless of encounter order", async () => {
  vi.mocked(spinRecapRepository.groups).mockResolvedValue(
    ["b", "d", "a", "c"].map((id) =>
      group({ release_id: id, track_id: id, artist: id, spins: id === "c" ? 3 : 1 }),
    ),
  );
  const result = await spinRecapService.getRecap(query);
  expect(result.top_records.map((r) => r.release_id)).toEqual(["c", "a", "b", "d"]);
  expect(result.top_tracks.map((r) => r.track_id)).toEqual(["c", "a", "b", "d"]);
  expect(result.top_artists.map((r) => r.artist)).toEqual(["c", "a", "b", "d"]);
});
