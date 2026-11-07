import { beforeEach, expect, it, vi } from "vitest";
const { path, load, resolve, probe } = vi.hoisted(() => ({
  path: vi.fn(),
  load: vi.fn(),
  resolve: vi.fn(),
  probe: vi.fn(),
}));
vi.mock("../discogsManifestService", () => ({ getReleasePath: path, loadAlbum: load }));
vi.mock("../trackAudioMetadataService", () => ({
  trackAudioMetadataService: { resolveAudioFilePath: resolve, runFfprobe: probe },
}));
import { artistReviewEvidence } from "../artistReviewEvidence";
import type { ArtistReviewDetail } from "@/api-contract/artistReview";
const item = (): ArtistReviewDetail => ({
  id: 1,
  name: "A",
  sort_name: "A",
  reviewed: false,
  is_placeholder: false,
  aliases: [],
  albums: [{ username: "dj", release_id: "37417227" }],
  tracks: [{ audio_source: "apple_music", local_audio_url: "song.m4a" }],
  merges: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  path.mockReturnValue("raw.json");
  load.mockReturnValue({ artists: [{ name: "A" }, { name: "B" }], tracklist: [] });
  resolve.mockReturnValue("/audio/song.m4a");
  probe.mockResolvedValue({ format: { tags: { artist: "A & B", album_artist: "A" } } });
});
it("shows structured Discogs and Apple file evidence", async () => {
  const value = item();
  await artistReviewEvidence(value);
  expect(value.albums[0].discogs).toMatchObject({ artists: [{ name: "A" }, { name: "B" }] });
  expect(value.tracks[0].apple_tags).toEqual({ artist: "A & B", album_artist: "A" });
});
it("tolerates missing files and missing probe tags", async () => {
  const value = item();
  path.mockReturnValue(null);
  resolve.mockReturnValue(null);
  await artistReviewEvidence(value);
  expect(value.albums[0].discogs).toBeNull();
  expect(value.tracks[0].apple_tags).toBeNull();
  path.mockReturnValue("bad.json");
  load.mockReturnValue(null);
  resolve.mockReturnValue("/audio/song.m4a");
  probe.mockResolvedValue({});
  await artistReviewEvidence(value);
  expect(value.tracks[0].apple_tags).toBeNull();
  probe.mockResolvedValue({ format: {} });
  await artistReviewEvidence(value);
  expect(value.tracks[0].apple_tags).toBeNull();
});
it("skips non-Apple and missing audio and bounds probing", async () => {
  const value = item();
  value.tracks = [
    { audio_source: "youtube" },
    { audio_source: "apple_music" },
    ...Array.from({ length: 10 }, () => ({ audio_source: "apple_music", local_audio_url: "file" })),
  ];
  await artistReviewEvidence(value);
  expect(probe).toHaveBeenCalledTimes(3);
});
it("reports unavailable Apple evidence without failing the queue", async () => {
  const value = item();
  probe.mockRejectedValue(new Error("probe"));
  await artistReviewEvidence(value);
  expect(value.tracks[0].evidence_error).toBe("Local Apple tags unavailable");
});
