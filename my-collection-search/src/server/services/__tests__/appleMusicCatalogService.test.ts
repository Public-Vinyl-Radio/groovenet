import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sign = vi.hoisted(() => vi.fn(() => "signed.jwt"));
vi.mock("jsonwebtoken", () => ({ default: { sign } }));

import {
  AppleMusicCatalogService,
  SONGS_PER_REQUEST,
  generateAppleMusicDeveloperToken,
} from "../appleMusicCatalogService";

const fetchMock = vi.fn();
const wait = vi.fn().mockResolvedValue(undefined);
const service = new AppleMusicCatalogService(wait, () => "tok");

const ok = (data: unknown[]) => ({ ok: true, status: 200, json: async () => ({ data }) });
const fail = (status: number, retryAfter?: string) => ({
  ok: false,
  status,
  headers: new Headers(retryAfter ? { "retry-after": retryAfter } : {}),
});
const song = (id: string, isrc?: string) => ({ id, attributes: { isrc } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("generateAppleMusicDeveloperToken", () => {
  it("signs with the configured credentials", () => {
    vi.stubEnv("APPLE_MUSIC_TEAM_ID", "team");
    vi.stubEnv("APPLE_MUSIC_KEY_ID", "key");
    vi.stubEnv("APPLE_MUSIC_PRIVATE_KEY", "line1\\nline2");
    expect(generateAppleMusicDeveloperToken()).toBe("signed.jwt");
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ iss: "team" }),
      "line1\nline2",
      expect.objectContaining({ algorithm: "ES256", header: { alg: "ES256", kid: "key" } }),
    );
  });

  it("throws when a credential is missing", () => {
    vi.stubEnv("APPLE_MUSIC_TEAM_ID", "");
    expect(() => generateAppleMusicDeveloperToken()).toThrow(/Missing Apple Music credentials/);
  });
});

describe("AppleMusicCatalogService", () => {
  it("assertConfigured surfaces a missing credential", () => {
    const broken = new AppleMusicCatalogService(wait, () => {
      throw new Error("Missing Apple Music credentials");
    });
    expect(() => broken.assertConfigured()).toThrow(/Missing/);
    expect(() => service.assertConfigured()).not.toThrow();
  });

  it("resolves ids to normalised ISRCs in one request", async () => {
    fetchMock.mockResolvedValueOnce(ok([song("1", "us-ab1-18-00123"), song("2", "GBXYZ2000001")]));
    const result = await service.fetchIsrcs(["1", "2", "1"], "gb");
    expect(result).toEqual(
      new Map([
        ["1", "USAB11800123"],
        ["2", "GBXYZ2000001"],
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/gb/songs?ids=1,2",
      { headers: { Authorization: "Bearer tok" } },
    );
  });

  it("maps a missing song, a missing ISRC and an invalid ISRC to null", async () => {
    fetchMock.mockResolvedValueOnce(ok([song("1"), song("2", "bad"), song("9", "USAB11800123")]));
    const result = await service.fetchIsrcs(["1", "2", "3"]);
    expect(result).toEqual(
      new Map([
        ["1", null],
        ["2", null],
        ["3", null],
      ]),
    );
  });

  it("tolerates a response with no data", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    expect(await service.fetchIsrcs(["1"])).toEqual(new Map([["1", null]]));
  });

  it("splits large lists into several requests", async () => {
    fetchMock.mockResolvedValue(ok([]));
    const ids = Array.from({ length: SONGS_PER_REQUEST + 1 }, (_, i) => String(i + 1));
    const result = await service.fetchIsrcs(ids);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(ids.length);
  });

  it("returns an empty map without calling Apple for no ids", async () => {
    expect((await service.fetchIsrcs([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for Retry-After on a 429 and retries", async () => {
    fetchMock
      .mockResolvedValueOnce(fail(429, "2"))
      .mockResolvedValueOnce(ok([song("1", "USAB11800123")]));
    expect((await service.fetchIsrcs(["1"])).get("1")).toBe("USAB11800123");
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it("caps Retry-After and backs off exponentially without one", async () => {
    fetchMock
      .mockResolvedValueOnce(fail(429, "9999"))
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok([]));
    await service.fetchIsrcs(["1"]);
    expect(wait).toHaveBeenNthCalledWith(1, 30_000);
    expect(wait).toHaveBeenNthCalledWith(2, 4000);
  });

  it("ignores a non-numeric Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(fail(429, "soon")).mockResolvedValueOnce(ok([]));
    await service.fetchIsrcs(["1"]);
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it("gives up after repeated rate limiting", async () => {
    fetchMock.mockResolvedValue(fail(429));
    await expect(service.fetchIsrcs(["1"], "us")).rejects.toThrow("Apple Music API 429");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a client error", async () => {
    fetchMock.mockResolvedValue(fail(401));
    await expect(service.fetchIsrcs(["1"])).rejects.toThrow("Apple Music API 401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
