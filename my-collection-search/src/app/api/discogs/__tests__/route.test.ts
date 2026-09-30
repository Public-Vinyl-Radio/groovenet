import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manifest = vi.hoisted(() => {
  // Read when the route module loads.
  process.env.DISCOGS_USER_TOKEN = "token";
  return {
    saveManifest: vi.fn(),
    getReleaseWritePath: vi.fn(() => "/dev/null"),
    createExportsDir: vi.fn(),
    getManifestReleaseIds: vi.fn(),
    getManifestPath: vi.fn(() => "/dev/null"),
    deleteRelease: vi.fn(() => true),
  };
});
const discogs = vi.hoisted(() => ({
  getCollectionPage: vi.fn(),
  getReleaseDetails: vi.fn(),
}));

vi.mock("@/server/services/discogsManifestService", () => manifest);
vi.mock("@/server/services/discogsApiClient", () => discogs);
vi.mock("@/lib/serverDb", () => ({ dbPool: {} }));
vi.mock("@/server/services/discogsCleanupService", () => ({
  cleanupDiscogsReleases: vi.fn().mockResolvedValue({ friendId: null }),
}));

import { GET } from "../route";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";

const analyticsEvents = new MemoryAnalyticsProvider();

const page = (ids: number[]) => ({
  releases: ids.map((id) => ({ basic_information: { id } })),
  pagination: { page: 1, pages: 1 },
});

describe("GET /api/discogs — analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEvents.reset();
    setAnalyticsProvider(analyticsEvents);
    vi.spyOn(console, "log").mockImplementation(() => {});
    // The route waits between release fetches to stay under Discogs' rate limit.
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setAnalyticsProvider(null);
  });

  it("reports the start and the outcome of a sync, without the username", async () => {
    manifest.getManifestReleaseIds.mockReturnValue(["1", "2"]);
    discogs.getCollectionPage.mockResolvedValue(page([2, 3]));
    discogs.getReleaseDetails.mockRejectedValue(new Error("429"));

    const res = await GET(
      new Request("http://localhost/api/discogs?username=dj", {
        headers: { "X-Groovenet-Client": "mcp" },
      }) as never
    );
    const body = res.text();
    await vi.runAllTimersAsync();
    expect(await body).toContain("All operations complete");

    expect(analyticsEvents.events.map((e) => [e.event, e.properties])).toEqual([
      ["discogs_sync_started", { manifest_ids_count: 2, source: "mcp" }],
      [
        "discogs_sync_completed",
        {
          new_releases: 0,
          removed_releases: 1,
          error_count: 1,
          duration_ms: expect.any(Number),
          source: "mcp",
        },
      ],
    ]);
  });
});
