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
    getTracksFromManifestReleases: vi.fn((): unknown[] => []),
  };
});
const discogs = vi.hoisted(() => ({
  getCollectionPage: vi.fn(),
  getReleaseDetails: vi.fn(),
}));
const trackUpsert = vi.hoisted(() => ({ upsertTracks: vi.fn() }));
const albumUpsert = vi.hoisted(() => ({
  getAlbumsFromManifestReleases: vi.fn(),
  upsertAlbums: vi.fn(),
}));
const embeddingSync = vi.hoisted(() => ({ syncIdentityEmbeddings: vi.fn() }));

vi.mock("@/server/services/discogsManifestService", () => manifest);
vi.mock("@/server/services/discogsApiClient", () => discogs);
vi.mock("@/lib/serverDb", () => ({ dbPool: {} }));
vi.mock("@/server/services/discogsCleanupService", () => ({
  cleanupDiscogsReleases: vi.fn().mockResolvedValue({ friendId: null }),
}));
vi.mock("@/server/services/trackUpsertService", () => trackUpsert);
vi.mock("@/server/services/albumUpsertService", () => albumUpsert);
vi.mock("@/server/services/trackEmbeddingSyncService", () => embeddingSync);

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

describe("GET /api/discogs — embeddings sync (#385)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEvents.reset();
    setAnalyticsProvider(analyticsEvents);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The route waits between release fetches to stay under Discogs' rate limit.
    vi.useFakeTimers({ toFake: ["setTimeout"] });

    manifest.getManifestReleaseIds.mockReturnValue([]);
    manifest.getTracksFromManifestReleases.mockReturnValue([{ track_id: "t1" }]);
    discogs.getCollectionPage.mockResolvedValue(page([1]));
    discogs.getReleaseDetails.mockResolvedValue({ id: 1 });
    trackUpsert.upsertTracks.mockResolvedValue([{ track_id: "t1", friend_id: 1 }]);
    albumUpsert.getAlbumsFromManifestReleases.mockResolvedValue([]);
    albumUpsert.upsertAlbums.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setAnalyticsProvider(null);
  });

  async function runSync() {
    const res = await GET(
      new Request("http://localhost/api/discogs?username=dj") as never
    );
    const bodyPromise = res.text();
    await vi.runAllTimersAsync();
    return bodyPromise;
  }

  it("enqueues embeddings for the upserted tracks and reports how many were queued", async () => {
    embeddingSync.syncIdentityEmbeddings.mockResolvedValueOnce({ queued: 1 });

    const body = await runSync();

    expect(embeddingSync.syncIdentityEmbeddings).toHaveBeenCalledWith([
      { track_id: "t1", friend_id: 1 },
    ]);
    expect(body).toContain("Embeddings: 1 queued for background generation");
    expect(body).toContain("All operations complete");
  });

  it("reports a failure to enqueue without failing the rest of the sync", async () => {
    embeddingSync.syncIdentityEmbeddings.mockRejectedValueOnce(new Error("redis down"));

    const body = await runSync();

    expect(body).toContain("⚠️  Failed to queue embeddings: redis down");
    expect(body).toContain("All operations complete");
  });

  it("stringifies a non-Error rejection when reporting the failure", async () => {
    embeddingSync.syncIdentityEmbeddings.mockRejectedValueOnce("redis down");

    const body = await runSync();

    expect(body).toContain("⚠️  Failed to queue embeddings: redis down");
  });
});
