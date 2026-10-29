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
const repair = vi.hoisted(() => ({
  repairDiscogsCollectionFields: vi.fn(async () => ({ albums: [] as string[], tracks: 0 })),
}));

vi.mock("@/server/services/discogsManifestService", () => manifest);
vi.mock("@/server/services/discogsApiClient", () => discogs);
vi.mock("@/lib/serverDb", () => ({ dbPool: {} }));
vi.mock("@/server/services/discogsCleanupService", () => ({
  cleanupDiscogsReleases: vi.fn().mockResolvedValue({ friendId: null }),
}));
vi.mock("@/server/services/trackUpsertService", () => trackUpsert);
vi.mock("@/server/services/albumUpsertService", () => albumUpsert);
vi.mock("@/server/services/trackEmbeddingSyncService", () => embeddingSync);
vi.mock("@/server/services/discogsCollectionRepairService", () => repair);

import { GET } from "../route";
import { syncDiscogsStream } from "@/services/internalApi/discogs";
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
    vi.unstubAllGlobals();
    setAnalyticsProvider(null);
  });

  it("reports the start and the outcome of a sync, without the username", async () => {
    manifest.getManifestReleaseIds.mockReturnValue(["1", "2"]);
    discogs.getCollectionPage.mockResolvedValue(page([2, 3]));
    discogs.getReleaseDetails.mockRejectedValue(new Error("429"));

    const res = await GET(
      new Request("http://localhost/api/discogs?username=dj", {
        headers: { "X-Groovenet-Client": "mcp" },
      }) as never,
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

describe("GET /api/discogs — auto-ingest and streamed failures", () => {
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
    trackUpsert.upsertTracks.mockResolvedValue({
      upserted: [{ track_id: "t1", friend_id: 1 }],
      errors: [],
    });
    embeddingSync.syncIdentityEmbeddings.mockResolvedValue({ queued: 1 });
    albumUpsert.getAlbumsFromManifestReleases.mockResolvedValue([]);
    albumUpsert.upsertAlbums.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setAnalyticsProvider(null);
  });

  async function runSync() {
    const res = await GET(new Request("http://localhost/api/discogs?username=dj") as never);
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
    expect(body).toContain("Upserted 1 tracks to Postgres");
    expect(body).toContain("✅ Auto-ingest complete!");
    expect(body).not.toContain("track upsert failures");
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

  it("streams release and track failures to the UI consumer and ends with a partial-failure summary", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1, 2, 3]));
    discogs.getReleaseDetails
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockRejectedValueOnce(new Error("429"));
    const successful = [{ track_id: "1-B1", friend_id: 1 }];
    const errors = [
      { trackId: "1-A1", releaseId: "1", username: "dj", error: "constraint violation" },
      { trackId: "1-A2", releaseId: "1", username: "dj", error: "connection lost" },
      { trackId: "2-A1", releaseId: "2", username: "dj", error: "timeout" },
    ];
    const tracks = [...successful, ...errors.map((e) => ({ track_id: e.trackId }))];
    manifest.getTracksFromManifestReleases.mockReturnValue(tracks);
    trackUpsert.upsertTracks.mockResolvedValue({ upserted: successful, errors });
    const lines: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const response = await GET(
          new Request("http://localhost/api/discogs?username=dj") as never,
        );
        expect(response.headers.get("Content-Type")).toBe("text/event-stream");
        return response;
      }),
    );

    const stream = syncDiscogsStream("dj", (line) => lines.push(line));
    await vi.runAllTimersAsync();
    await stream;

    expect(lines).toContain("Release 1 fetched with track upsert failures (2):");
    expect(lines).toContain("Release 2 fetched with track upsert failures (1):");
    for (const error of errors) {
      expect(lines).toContain(`  - Track ${error.trackId}@dj: ${error.error}`);
    }
    expect(lines).toContain("Error for release ID 3: 429");
    expect(lines).toContain("  - Release 3: 429");
    expect(lines).toContain("Auto-ingest incomplete. Track upsert failures: 3.");
    expect(lines.at(-1)).toBe(
      "All operations complete with track upsert failures. Failed tracks: 3; affected releases: 2.",
    );
    expect(lines.join("\n")).not.toContain("✅ Auto-ingest complete!");
    expect(lines.join("\n")).not.toContain("🎉 All operations complete!");
    expect(trackUpsert.upsertTracks).toHaveBeenCalledWith(tracks);
    expect(albumUpsert.upsertAlbums).toHaveBeenCalledWith({}, [], { preserveManualFields: true });
    expect(embeddingSync.syncIdentityEmbeddings).toHaveBeenCalledWith(successful);
    expect(manifest.saveManifest).toHaveBeenCalledWith("/dev/null", ["1", "2"]);
    expect(analyticsEvents.events.at(-1)?.properties).toMatchObject({
      new_releases: 2,
      error_count: 4,
    });
  });

  it("reports an all-track failure, including an absent release ID, and closes the stream", async () => {
    trackUpsert.upsertTracks.mockResolvedValue({
      upserted: [],
      errors: [
        {
          trackId: "t1",
          username: "dj",
          error: "Could not resolve friend_id",
        },
      ],
    });
    const body = await runSync();
    expect(body).toContain("Upserted 0 tracks to Postgres");
    expect(body).toContain("Release unknown fetched with track upsert failures (1):");
    expect(body).toContain("Track t1@dj: Could not resolve friend_id");
    expect(body).toContain("Auto-ingest incomplete. Track upsert failures: 1.");
    expect(body).toContain(
      "All operations complete with track upsert failures. Failed tracks: 1; affected releases: 1.",
    );
    expect(embeddingSync.syncIdentityEmbeddings).toHaveBeenCalledWith([]);
  });

  it("keeps a soft-deleted no-op successful even when fewer tracks were upserted than loaded", async () => {
    manifest.getTracksFromManifestReleases.mockReturnValue([
      { track_id: "t1" },
      { track_id: "deleted" },
    ]);
    const body = await runSync();
    expect(body).toContain("Loaded 2 tracks");
    expect(body).toContain("Upserted 1 tracks to Postgres");
    expect(body).toContain("✅ Auto-ingest complete!");
    expect(body).toContain("🎉 All operations complete!");
    expect(body).not.toContain("track upsert failures");
    expect(analyticsEvents.events.at(-1)?.properties.error_count).toBe(0);
  });
});

describe("GET /api/discogs — collection date repair (#847)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAnalyticsProvider(new MemoryAnalyticsProvider());
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    manifest.getManifestReleaseIds.mockReturnValue(["1", "2"]);
    discogs.getReleaseDetails.mockRejectedValue(new Error("429"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setAnalyticsProvider(null);
  });

  async function runSync() {
    const res = await GET(new Request("http://localhost/api/discogs?username=dj") as never);
    const body = res.text();
    await vi.runAllTimersAsync();
    return body;
  }

  it("repairs the releases already imported, from the listing's earliest copy", async () => {
    discogs.getCollectionPage.mockResolvedValue({
      releases: [
        { basic_information: { id: 1 }, date_added: "2024-05-01T00:00:00-07:00" },
        { basic_information: { id: 1 }, date_added: "2023-02-01T00:00:00-08:00" },
        { basic_information: { id: 1 }, date_added: "2025-01-01T00:00:00-08:00" },
        { basic_information: { id: 2 } },
        { basic_information: { id: 3 }, date_added: "2026-01-01T00:00:00-08:00" },
      ],
      pagination: { page: 1, pages: 1 },
    });
    repair.repairDiscogsCollectionFields.mockResolvedValueOnce({ albums: ["1"], tracks: 4 });

    const body = await runSync();

    expect(repair.repairDiscogsCollectionFields).toHaveBeenCalledTimes(1);
    const [username, ids, dates] = repair.repairDiscogsCollectionFields.mock
      .calls[0] as unknown as [string, string[], Map<string, string>];
    expect(username).toBe("dj");
    // Release 3 is new: it gets its date when it is fetched, not here.
    expect(ids).toEqual(["1", "1", "1", "2"]);
    expect(dates.get("1")).toBe("2023-02-01T00:00:00-08:00");
    expect(dates.has("2")).toBe(false);
    expect(discogs.getReleaseDetails).toHaveBeenCalledTimes(1);
    expect(body).toContain("Repaired 1 albums and 4 tracks from collection dates");
  });

  it("reports a repair failure and carries on with the sync", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1]));
    repair.repairDiscogsCollectionFields.mockRejectedValueOnce(new Error("db down"));

    const body = await runSync();

    expect(body).toContain("Collection date repair error: db down");
    expect(body).toContain("All operations complete");
  });

  it("names a non-Error repair failure", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1]));
    repair.repairDiscogsCollectionFields.mockRejectedValueOnce("boom");

    expect(await runSync()).toContain("Collection date repair error: boom");
  });
});
