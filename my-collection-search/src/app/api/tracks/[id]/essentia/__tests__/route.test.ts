import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readEssentiaAnalysis = vi.fn();
vi.mock("@/lib/essentia-storage", () => ({
  readEssentiaAnalysis: (...a: unknown[]) => readEssentiaAnalysis(...a),
}));

import { GET } from "../route";

const call = (query: string) =>
  GET(new NextRequest(`http://localhost/api/tracks/t1/essentia${query}`), {
    params: Promise.resolve({ id: "t1" }),
  });

describe("GET /api/tracks/[id]/essentia", () => {
  beforeEach(() => readEssentiaAnalysis.mockReset());

  it("returns the analysis payload", async () => {
    readEssentiaAnalysis.mockReturnValue({ file_path: "/essentia/t1.json", payload: { bpm: 124 } });
    const res = await call("?friend_id=2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      track_id: "t1",
      friend_id: 2,
      file_path: "/essentia/t1.json",
      data: { bpm: 124 },
    });
  });

  it("rejects a missing or non-numeric friend_id", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("?friend_id=abc")).status).toBe(400);
  });

  it("returns 404 when there is no analysis file", async () => {
    readEssentiaAnalysis.mockReturnValue(null);
    expect((await call("?friend_id=2")).status).toBe(404);
  });

  it("returns 500 when reading throws", async () => {
    readEssentiaAnalysis.mockReturnValue({
      get file_path(): string {
        throw new Error("disk");
      },
      payload: {},
    });
    const res = await call("?friend_id=2");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "disk" });
  });
});
