import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: (...a: unknown[]) => http(...a) }));

import { getReleaseDetails, lookupDiscogsUser } from "../discogsApiClient";

describe("lookupDiscogsUser()", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the release count from the user's All folder", async () => {
    http.mockResolvedValue({ id: 0, name: "All", count: 412 });
    await expect(lookupDiscogsUser("dj friend")).resolves.toEqual({
      found: true,
      releaseCount: 412,
    });
    expect(http.mock.calls[0][0]).toBe(
      "https://api.discogs.com/users/dj%20friend/collection/folders/0",
    );
  });

  it("counts a folder without a count as empty", async () => {
    http.mockResolvedValue({});
    await expect(lookupDiscogsUser("dj")).resolves.toEqual({ found: true, releaseCount: 0 });
  });

  it.each([404, 403])("treats a %i as not found", async (status) => {
    http.mockImplementation(async () => {
      throw Object.assign(new Error(`HTTP ${status}`), { status });
    });
    expect(await lookupDiscogsUser("dj")).toEqual({ found: false });
  });

  it("rethrows any other failure", async () => {
    http.mockImplementation(async () => {
      throw Object.assign(new Error("HTTP 500"), { status: 500 });
    });
    await expect(lookupDiscogsUser("dj")).rejects.toThrow("HTTP 500");
  });
});

describe("getReleaseDetails()", () => {
  beforeEach(() => vi.resetAllMocks());

  const rateLimited = (retryAfter?: string) =>
    Object.assign(new Error("HTTP 429"), {
      status: 429,
      headers: new Headers(retryAfter === undefined ? {} : { "Retry-After": retryAfter }),
    });

  it("fetches the release", async () => {
    http.mockResolvedValue({ id: 1 });
    const sleep = vi.fn(async () => {});
    await expect(getReleaseDetails("1", { sleep })).resolves.toEqual({ id: 1 });
    expect(http.mock.calls[0][0]).toBe("https://api.discogs.com/releases/1");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits for Retry-After on a 429 and retries", async () => {
    http.mockRejectedValueOnce(rateLimited("7")).mockResolvedValueOnce({ id: 1 });
    const sleep = vi.fn(async () => {});
    await expect(getReleaseDetails("1", { sleep })).resolves.toEqual({ id: 1 });
    expect(sleep.mock.calls).toEqual([[7000]]);
  });

  it("caps a very long Retry-After", async () => {
    http.mockRejectedValueOnce(rateLimited("3600")).mockResolvedValueOnce({ id: 1 });
    const sleep = vi.fn(async () => {});
    await getReleaseDetails("1", { sleep });
    expect(sleep.mock.calls).toEqual([[60_000]]);
  });

  it.each([[undefined], ["soon"], ["-1"]])(
    "backs off when Retry-After is %s, then gives up after 3 retries",
    async (retryAfter) => {
      const error = rateLimited(retryAfter);
      http.mockRejectedValue(error);
      const sleep = vi.fn(async () => {});
      await expect(getReleaseDetails("1", { sleep })).rejects.toBe(error);
      expect(http).toHaveBeenCalledTimes(4);
      expect(sleep.mock.calls).toEqual([[5000], [10_000], [20_000]]);
    },
  );

  it("backs off when the error carries no headers", async () => {
    http
      .mockRejectedValueOnce(Object.assign(new Error("HTTP 429"), { status: 429 }))
      .mockResolvedValueOnce({ id: 1 });
    const sleep = vi.fn(async () => {});
    await getReleaseDetails("1", { sleep });
    expect(sleep.mock.calls).toEqual([[5000]]);
  });

  it("doesn't retry other failures", async () => {
    http.mockRejectedValue(Object.assign(new Error("HTTP 404"), { status: 404 }));
    const sleep = vi.fn(async () => {});
    await expect(getReleaseDetails("1", { sleep })).rejects.toThrow("HTTP 404");
    expect(http).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("sleeps with a real timer by default", async () => {
    vi.useFakeTimers();
    try {
      http.mockRejectedValueOnce(rateLimited("2")).mockResolvedValueOnce({ id: 1 });
      const result = getReleaseDetails("1");
      await vi.advanceTimersByTimeAsync(1999);
      expect(http).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ id: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
