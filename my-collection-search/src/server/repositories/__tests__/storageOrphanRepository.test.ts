import { beforeEach, describe, expect, it, vi } from "vitest";
import { storageOrphanRepository } from "../storageOrphanRepository";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => vi.resetAllMocks());

describe("storageOrphanRepository", () => {
  it("lists tracks that name an audio file", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1" }] });
    expect(await storageOrphanRepository.listTracksWithAudio()).toEqual([{ track_id: "t1" }]);
    expect(dbQuery.mock.calls[0][0]).toContain("local_audio_url IS NOT NULL");
  });

  it("upserts the single result row as JSON", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    const scannedAt = new Date("2026-11-06T00:00:00Z");
    await storageOrphanRepository.saveResult({
      scannedAt,
      durationMs: 12,
      files: [{ path: "a.mp3", size_bytes: 1, modified_at: "x" }],
      tracks: [],
    });
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(values).toEqual([
      scannedAt,
      12,
      JSON.stringify([{ path: "a.mp3", size_bytes: 1, modified_at: "x" }]),
      "[]",
    ]);
  });

  it("records an error without touching the previous result", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await storageOrphanRepository.saveError("disk gone");
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("SET error = EXCLUDED.error");
    expect(sql).not.toContain("files");
    expect(values).toEqual(["disk gone"]);
  });

  it("pages both lists, and returns null before any scan", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ files_total: 3 }] });
    expect(await storageOrphanRepository.getPage(5, 10, 20)).toEqual({ files_total: 3 });
    expect(dbQuery.mock.calls[0][1]).toEqual([5, 10, 20]);
    dbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await storageOrphanRepository.getPage(5, 0, 0)).toBeNull();
  });

  it("sums orphan bytes, treating no row as zero", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ bytes: "4096" }] });
    expect(await storageOrphanRepository.getFileBytes()).toBe(4096);
    dbQuery.mockResolvedValueOnce({ rows: [{ bytes: null }] });
    expect(await storageOrphanRepository.getFileBytes()).toBe(0);
    dbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await storageOrphanRepository.getFileBytes()).toBe(0);
  });
});
