import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackAudioFileRepository } from "../trackAudioFileRepository";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => vi.resetAllMocks());

describe("trackAudioFileRepository", () => {
  it("lists a track's alternates, none of them primary", async () => {
    dbQuery.mockResolvedValue({ rows: [{ filename: "t.m4a", codec: "aac" }] });
    const files = await trackAudioFileRepository.listAlternates("t", 1);
    expect(files).toEqual([{ filename: "t.m4a", codec: "aac", primary: false }]);
    expect(dbQuery.mock.calls[0][1]).toEqual(["t", 1]);
  });

  it("upserts one alternate and reports whether the link is new", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ inserted: true }] });
    const created = await trackAudioFileRepository.upsert("t", 1, "t.m4a", {
      audio_codec: "aac",
      audio_container: "m4a",
      audio_lossless: false,
      audio_source: "apple_music",
    });
    expect(created).toBe(true);
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (track_id, friend_id, filename) DO UPDATE");
    expect(values.slice(0, 6)).toEqual(["t", 1, "t.m4a", "m4a", "aac", false]);
    expect(values[11]).toBe("apple_music");

    dbQuery.mockResolvedValueOnce({ rows: [{ inserted: false }] });
    expect(await trackAudioFileRepository.upsert("t", 1, "t.m4a", {})).toBe(false);
    dbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await trackAudioFileRepository.upsert("t", 1, "t.m4a", {})).toBe(false);
  });

  it("unlinks an alternate", async () => {
    dbQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await trackAudioFileRepository.remove("t", 1, "t.m4a")).toBe(true);
    dbQuery.mockResolvedValueOnce({ rowCount: 0 });
    expect(await trackAudioFileRepository.remove("t", 1, "t.m4a")).toBe(false);
    dbQuery.mockResolvedValueOnce({ rowCount: null });
    expect(await trackAudioFileRepository.remove("t", 1, "t.m4a")).toBe(false);
  });

  it("finds live tracks whose primary is a FLAC", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t" }] });
    expect(await trackAudioFileRepository.listFlacPrimaries()).toEqual([{ track_id: "t" }]);
    expect(dbQuery.mock.calls[0][0]).toContain("'%.flac'");
  });

  it("lists every tracked file with whether it is lossless, primaries and alternates together", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        { filename: "a.flac", lossless: true },
        { filename: "a.m4a", lossless: false },
        { filename: "new.m4a", lossless: null },
      ],
    });
    const formats = await trackAudioFileRepository.listAudioFormats();
    expect(formats).toHaveLength(3);
    const sql = String(dbQuery.mock.calls[0][0]);
    expect(sql).toContain("FROM tracks");
    expect(sql).toContain("FROM track_audio_files");
  });
});
