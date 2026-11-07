import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ stats: vi.fn(), statfs: vi.fn() }));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { getStorageStats: mocks.stats },
}));
vi.mock("node:fs/promises", () => ({ statfs: mocks.statfs }));

import { storageService } from "../storageService";

const stats = {
  tracks: 10,
  by_source: [{ source: "apple_music", files: 3, size_bytes: 600 }],
  by_codec: [
    { codec: "flac", lossless: true, files: 2, size_bytes: 500 },
    { codec: "aac", lossless: false, files: 1, size_bytes: 100 },
    { codec: null, lossless: null, files: 4, size_bytes: 0 },
  ],
};

describe("storageService.getStorage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.stats.mockResolvedValue(stats);
  });

  it("derives totals and splits the used disk into audio and other", async () => {
    mocks.statfs.mockResolvedValue({ blocks: 1000, bsize: 1, bfree: 700, bavail: 600 });
    const res = await storageService.getStorage();
    expect(res.totals).toEqual({
      tracks: 10,
      files: 7,
      size_bytes: 600,
      lossless_files: 2,
      lossless_size_bytes: 500,
      unprobed_files: 4,
    });
    expect(res.disk).toEqual({
      total_bytes: 1000,
      audio_bytes: 300,
      other_bytes: 0,
      free_bytes: 600,
    });
  });

  it("splits used space when audio fits within it", async () => {
    mocks.statfs.mockResolvedValue({ blocks: 2000, bsize: 1, bfree: 1000, bavail: 900 });
    const res = await storageService.getStorage();
    expect(res.disk).toMatchObject({ audio_bytes: 600, other_bytes: 400, free_bytes: 900 });
  });

  it("reports null disk when the volume is unreadable", async () => {
    mocks.statfs.mockRejectedValue(new Error("ENOENT"));
    expect((await storageService.getStorage()).disk).toBeNull();
  });
});
