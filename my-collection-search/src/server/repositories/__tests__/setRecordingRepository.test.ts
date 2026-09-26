import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { SetRecordingRepository } from "../setRecordingRepository";

const repo = () => new SetRecordingRepository();
const SHA = "a".repeat(64);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SetRecordingRepository", () => {
  it("finds a recording by sha256, or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ sha256: SHA }] }).mockResolvedValueOnce({ rows: [] });

    expect(await repo().findBySha256(SHA)).toEqual({ sha256: SHA });
    expect(await repo().findBySha256(SHA)).toBeNull();
    expect(dbQuery.mock.calls[0]).toEqual(["SELECT * FROM set_recordings WHERE sha256 = $1", [SHA]]);
  });

  it("inserts without clobbering an existing row, then returns what is stored", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ sha256: SHA, file_path: "kept.mp3" }] });

    const stored = await repo().create({
      sha256: SHA, file_path: `${SHA}.mp3`, original_filename: "set.mp3",
      format_name: "mp3", duration_seconds: 60, size_bytes: 10,
    });

    expect(stored).toEqual({ sha256: SHA, file_path: "kept.mp3" });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(sha256\) DO NOTHING/);
    expect(params).toEqual([SHA, `${SHA}.mp3`, "set.mp3", "mp3", 60, 10]);
  });

  it("stores unknown metadata as null", async () => {
    dbQuery.mockResolvedValue({ rows: [{ sha256: SHA }] });
    await repo().create({ sha256: SHA, file_path: "x", size_bytes: 1 });
    expect(dbQuery.mock.calls[0][1]).toEqual([SHA, "x", null, null, null, 1]);
  });
});
