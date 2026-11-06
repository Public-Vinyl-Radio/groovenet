import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const fetchMock = vi.fn();

describe("GET /api/update-check", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("APP_VERSION", "1.2.3");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const release = (over: Record<string, unknown> = {}) => ({
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: "v1.3.0",
      name: "Groovenet 1.3.0",
      html_url: "https://github.com/x/y/releases/tag/v1.3.0",
      published_at: "2026-11-01T00:00:00Z",
      ...over,
    }),
  });

  it("reports a newer release", async () => {
    fetchMock.mockResolvedValue(release());
    const body = await (await GET()).json();
    expect(body).toMatchObject({
      current: "1.2.3",
      comparable: true,
      latest: "v1.3.0",
      updateAvailable: true,
      releaseName: "Groovenet 1.3.0",
      error: null,
    });
  });

  it("is not an update when the latest release is the same or older, or names no tag", async () => {
    fetchMock.mockResolvedValue(release({ tag_name: "v1.2.3" }));
    expect((await (await GET()).json()).updateAvailable).toBe(false);
    fetchMock.mockResolvedValue(release({ tag_name: "v0.9.0" }));
    expect((await (await GET()).json()).updateAvailable).toBe(false);
    fetchMock.mockResolvedValue(release({ tag_name: undefined, name: undefined }));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ latest: null, releaseName: null, updateAvailable: false });
  });

  it("does not compare a build that is not a release", async () => {
    vi.stubEnv("APP_VERSION", "sha-abc");
    fetchMock.mockResolvedValue(release());
    const body = await (await GET()).json();
    expect(body).toMatchObject({ comparable: false, updateAvailable: false, latest: "v1.3.0" });
  });

  it("reports a missing release, a GitHub error and a network failure in `error`", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect((await (await GET()).json()).error).toBe("No published releases yet");
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    expect((await (await GET()).json()).error).toBe("GitHub API returned 503");
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await (await GET()).json()).error).toBe("offline");
    fetchMock.mockRejectedValue("boom");
    expect((await (await GET()).json()).error).toBe("update check failed");
  });
});
