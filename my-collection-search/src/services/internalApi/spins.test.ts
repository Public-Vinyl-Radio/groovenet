import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { listSpins } from "./spins";

beforeEach(() => httpMock.mockReset().mockResolvedValue({ items: [] }));

describe("listSpins", () => {
  it("sends only friend, limit and offset by default", async () => {
    await listSpins({ friend_id: 7, limit: 50, offset: 0 });
    expect(httpMock).toHaveBeenCalledWith("/api/spins?friend_id=7&limit=50&offset=0", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("sends every filter, the medium and the cursor", async () => {
    await listSpins({
      friend_id: 7,
      release_id: "r1",
      track_id: "t1",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.999Z",
      limit: 20,
      offset: 0,
      medium: "digital",
      cursor: "abc_-",
    });
    const [url] = httpMock.mock.calls[0];
    expect(Object.fromEntries(new URL(url, "http://x").searchParams)).toEqual({
      friend_id: "7",
      release_id: "r1",
      track_id: "t1",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.999Z",
      limit: "20",
      offset: "0",
      medium: "digital",
      cursor: "abc_-",
    });
  });
});
