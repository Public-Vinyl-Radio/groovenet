import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listAlternates: vi.fn(),
  upsert: vi.fn(),
  listFlacPrimaries: vi.fn(),
}));
const meta = vi.hoisted(() => ({
  normalizeAudioFilename: vi.fn((name: string) => name.replace(/^\/audio\//, "")),
  inspectLocalAudio: vi.fn(),
  resolveAudioFilePath: vi.fn(),
}));
vi.mock("@/server/repositories/trackAudioFileRepository", () => ({
  trackAudioFileRepository: repo,
}));
vi.mock("@/server/services/trackAudioMetadataService", () => ({
  trackAudioMetadataService: meta,
}));

import { AlternateAudioError, trackAudioFileService } from "../trackAudioFileService";

const track = { track_id: "t1", friend_id: 1, local_audio_url: "t1.flac" };

beforeEach(() => {
  vi.resetAllMocks();
  meta.normalizeAudioFilename.mockImplementation((name: string) => name.replace(/^\/audio\//, ""));
});

describe("listFiles", () => {
  it("puts the primary first, then the alternates", async () => {
    repo.listAlternates.mockResolvedValue([{ filename: "t1.m4a", primary: false }]);
    const files = await trackAudioFileService.listFiles({
      ...track,
      audio_codec: "flac",
      audio_lossless: true,
    });
    expect(files.map((f) => [f.filename, f.primary])).toEqual([
      ["t1.flac", true],
      ["t1.m4a", false],
    ]);
    expect(files[0].codec).toBe("flac");
  });

  it("lists only alternates when the track has no primary", async () => {
    repo.listAlternates.mockResolvedValue([{ filename: "t1.m4a", primary: false }]);
    const files = await trackAudioFileService.listFiles({ ...track, local_audio_url: "  " });
    expect(files.map((f) => f.filename)).toEqual(["t1.m4a"]);
  });
});

describe("linkAlternate", () => {
  it("probes the file and links it", async () => {
    meta.inspectLocalAudio.mockResolvedValue({ fields: { audio_codec: "aac" } });
    repo.upsert.mockResolvedValue(true);
    expect(await trackAudioFileService.linkAlternate(track, "/audio/t1.m4a", "apple_music")).toBe(
      true,
    );
    expect(meta.inspectLocalAudio).toHaveBeenCalledWith("t1.m4a", "apple_music");
    expect(repo.upsert).toHaveBeenCalledWith("t1", 1, "t1.m4a", { audio_codec: "aac" });
  });

  it("rejects an empty name and the primary itself", async () => {
    meta.normalizeAudioFilename.mockReturnValueOnce("");
    await expect(trackAudioFileService.linkAlternate(track, " ")).rejects.toBeInstanceOf(
      AlternateAudioError,
    );
    await expect(trackAudioFileService.linkAlternate(track, "t1.flac")).rejects.toThrow(
      "already the primary",
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("links to a track with no primary", async () => {
    meta.inspectLocalAudio.mockResolvedValue({ fields: {} });
    repo.upsert.mockResolvedValue(false);
    expect(
      await trackAudioFileService.linkAlternate({ ...track, local_audio_url: null }, "t1.m4a"),
    ).toBe(false);
  });
});

describe("backfillSiblingAlternates", () => {
  it("links an m4a beside a flac, counts repeats, skips missing files and survives a failure", async () => {
    repo.listFlacPrimaries.mockResolvedValue([
      { ...track, track_id: "a", local_audio_url: "a.flac", audio_source: "apple_music" },
      { ...track, track_id: "b", local_audio_url: "b.flac", audio_source: null },
      { ...track, track_id: "c", local_audio_url: "c.flac", audio_source: null },
      { ...track, track_id: "d", local_audio_url: "d.flac", audio_source: null },
    ]);
    meta.resolveAudioFilePath.mockImplementation((name: string) =>
      name === "d.m4a" ? null : `/audio/${name}`,
    );
    meta.inspectLocalAudio.mockImplementation(async (name: string) => {
      if (name === "c.m4a") throw new Error("ffprobe failed");
      return { fields: {} };
    });
    repo.upsert.mockImplementation(async (id: string) => id === "a");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await trackAudioFileService.backfillSiblingAlternates()).toEqual({
      scanned: 4,
      linked: 1,
      already_linked: 1,
      failed: 1,
    });
  });
});
