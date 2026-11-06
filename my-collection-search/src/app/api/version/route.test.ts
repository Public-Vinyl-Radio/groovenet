import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/version", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports the baked-in build metadata", async () => {
    vi.stubEnv("APP_VERSION", "1.2.3");
    vi.stubEnv("GIT_SHA", "abc1234");
    vi.stubEnv("BUILD_TIME", "2026-11-06T00:00:00Z");
    const res = await GET();
    expect(await res.json()).toEqual({
      version: "1.2.3",
      gitSha: "abc1234",
      builtAt: "2026-11-06T00:00:00Z",
      nodeEnv: "test",
    });
  });

  it("falls back to the image tag, then the package version, and null build time", async () => {
    vi.stubEnv("APP_VERSION", "");
    vi.stubEnv("IMAGE_TAG", "sha-9f9f9f9");
    vi.stubEnv("GIT_SHA", "x");
    vi.stubEnv("BUILD_TIME", undefined as unknown as string);
    const body = await (await GET()).json();
    expect(body.version).toBe("sha-9f9f9f9");
    expect(body.builtAt).toBeNull();

    vi.stubEnv("IMAGE_TAG", "");
    expect((await (await GET()).json()).version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reads the commit from git outside production, and null in production", async () => {
    vi.stubEnv("GIT_SHA", undefined as unknown as string);
    const dev = await (await GET()).json();
    expect(dev.gitSha === null || typeof dev.gitSha === "string").toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect((await (await GET()).json()).gitSha).toBeNull();
  });
});
