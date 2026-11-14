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
    hasDownloadedRelease: vi.fn<(username: string, releaseId: string) => boolean>(() => false),
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
const cleanup = vi.hoisted(() => ({
  cleanupDiscogsReleases: vi.fn(async (): Promise<Record<string, unknown>> => ({ friendId: null })),
}));
vi.mock("@/server/services/discogsCleanupService", () => cleanup);
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

describe("GET /api/discogs — resume and checkpoints (#1182)", () => {
  const ids = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEvents.reset();
    setAnalyticsProvider(analyticsEvents);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout"] });

    manifest.getManifestReleaseIds.mockReturnValue([]);
    manifest.hasDownloadedRelease.mockReturnValue(false);
    manifest.saveManifest.mockImplementation(() => {});
    manifest.deleteRelease.mockImplementation(() => true);
    manifest.getTracksFromManifestReleases.mockImplementation(((
      _username: string,
      releaseIds: string[],
    ) => releaseIds.map((id) => ({ track_id: `${id}-A1` }))) as never);
    discogs.getReleaseDetails.mockImplementation(async (id: string) => ({ id: Number(id) }));
    trackUpsert.upsertTracks.mockImplementation(async (tracks: { track_id: string }[]) => ({
      upserted: tracks.map((t) => ({ ...t, friend_id: 1 })),
      errors: [],
    }));
    albumUpsert.getAlbumsFromManifestReleases.mockImplementation(
      async (_username: string, releaseIds: string[]) => releaseIds.map((id) => ({ id })),
    );
    albumUpsert.upsertAlbums.mockImplementation(
      async (_pool: unknown, albums: unknown[]) => albums,
    );
    embeddingSync.syncIdentityEmbeddings.mockImplementation(async (tracks: unknown[]) => ({
      queued: tracks.length,
    }));
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

  const savedIds = () => manifest.saveManifest.mock.calls.map((call) => (call as unknown[])[1]);

  it("resumes releases already on disk without fetching or waiting for them", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1, 2, 3]));
    manifest.hasDownloadedRelease.mockImplementation((_u: string, id: string) => id !== "2");
    const timeout = vi.spyOn(globalThis, "setTimeout");

    const body = await runSync();

    expect(manifest.hasDownloadedRelease).toHaveBeenCalledWith("dj", "1");
    expect(discogs.getReleaseDetails).toHaveBeenCalledTimes(1);
    expect(discogs.getReleaseDetails).toHaveBeenCalledWith("2");
    expect(timeout.mock.calls.filter(([, ms]) => ms === 1200)).toHaveLength(1);
    expect(body).toContain("Resuming 2 new releases already on disk");
    expect(body).toContain("New IDs to fetch: 1\n");
    expect(body).toContain("Already downloaded release ID: 1");
    expect(body).toContain("Saved release ID: 2");
    expect(body).toContain("Already downloaded release ID: 3");
    expect(body).toContain("New releases downloaded: 3");
    expect(savedIds().at(-1)).toEqual(["1", "2", "3"]);
    expect(manifest.getTracksFromManifestReleases).toHaveBeenCalledWith("dj", ["1", "2", "3"]);
    expect(albumUpsert.getAlbumsFromManifestReleases).toHaveBeenCalledWith("dj", ["1", "2", "3"]);
  });

  it("fetches a release again when its file on disk doesn't parse", async () => {
    // hasDownloadedRelease is false for an unparseable file (tested in the
    // manifest service), so the route treats it as not yet downloaded.
    discogs.getCollectionPage.mockResolvedValue(page([7]));
    manifest.hasDownloadedRelease.mockReturnValue(false);

    const body = await runSync();

    expect(discogs.getReleaseDetails).toHaveBeenCalledWith("7");
    expect(body).not.toContain("Resuming");
    expect(body).toContain("Saved release ID: 7");
  });

  it("checkpoints the manifest and ingests each batch of 25 with only that batch's IDs", async () => {
    manifest.getManifestReleaseIds.mockReturnValue(["900", "901"]);
    discogs.getCollectionPage.mockResolvedValue(page([900, ...ids(1, 30).map(Number)]));

    const body = await runSync();

    const batch1 = ids(1, 25);
    const batch2 = ids(26, 30);
    expect(savedIds()[0]).toEqual(["900", ...batch1]);
    expect(savedIds().at(-1)).toEqual(["900", ...batch1, ...batch2]);
    expect(manifest.getTracksFromManifestReleases.mock.calls).toEqual([
      ["dj", batch1],
      ["dj", batch2],
    ]);
    expect(albumUpsert.getAlbumsFromManifestReleases.mock.calls).toEqual([
      ["dj", batch1],
      ["dj", batch2],
    ]);
    expect(trackUpsert.upsertTracks).toHaveBeenCalledTimes(2);
    expect(trackUpsert.upsertTracks.mock.calls[1][0]).toHaveLength(5);
    expect(embeddingSync.syncIdentityEmbeddings).toHaveBeenCalledTimes(2);
    // Batch 1 is in the manifest before it is ingested, and in Postgres
    // before batch 2 is fetched.
    expect(manifest.saveManifest.mock.invocationCallOrder[0]).toBeLessThan(
      trackUpsert.upsertTracks.mock.invocationCallOrder[0],
    );
    expect(trackUpsert.upsertTracks.mock.invocationCallOrder[0]).toBeLessThan(
      discogs.getReleaseDetails.mock.invocationCallOrder[25],
    );
    expect(body).toContain("--- Ingesting batch 1 of 2 ---");
    expect(body.match(/--- Starting Auto-Ingest ---/g)).toHaveLength(1);
    expect(body).toContain("Total IDs: 31 (added: 30, failed: 0)");
    expect(body).toContain("✅ Auto-ingest complete!");
    expect(body).toContain("🎉 All operations complete!");
    expect(analyticsEvents.events.at(-1)?.properties).toMatchObject({
      new_releases: 30,
      removed_releases: 1,
      error_count: 0,
    });
  });

  it("keeps batch 1 in the manifest when batch 2 throws, and saves the rest on the way out", async () => {
    discogs.getCollectionPage.mockResolvedValue(page(ids(1, 30).map(Number)));
    manifest.saveManifest
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("disk full");
      });

    const body = await runSync();

    expect(savedIds()).toEqual([ids(1, 25), ids(1, 30), ids(1, 30)]);
    expect(body).toContain("Error: disk full");
    expect(body).not.toContain("All operations complete");
    // Batch 1 reached Postgres; batch 2 was never ingested.
    expect(manifest.getTracksFromManifestReleases.mock.calls).toEqual([["dj", ids(1, 25)]]);
  });

  it("skips ingest for a batch where every fetch failed", async () => {
    discogs.getCollectionPage.mockResolvedValue(page(ids(1, 26).map(Number)));
    discogs.getReleaseDetails.mockImplementation(async (id: string) => {
      if (Number(id) <= 25) throw "nope";
      return { id: Number(id) };
    });

    const body = await runSync();

    expect(body).not.toContain("--- Ingesting batch");
    expect(manifest.getTracksFromManifestReleases.mock.calls).toEqual([["dj", ["26"]]]);
    expect(body).toContain("Error for release ID 1: nope");
    expect(body).toContain("Total IDs: 1 (added: 1, failed: 25)");
  });

  it("starts the auto-ingest section even when only earlier batches downloaded", async () => {
    discogs.getCollectionPage.mockResolvedValue(page(ids(1, 26).map(Number)));
    discogs.getReleaseDetails.mockImplementation(async (id: string) => {
      if (id === "26") throw new Error("gone");
      return { id: Number(id) };
    });

    const body = await runSync();

    expect(manifest.getTracksFromManifestReleases).toHaveBeenCalledTimes(1);
    expect(body).toContain("--- Starting Auto-Ingest ---");
    expect(body).toContain("✅ Auto-ingest complete!");
  });

  it("reports an ingest failure in a batch and carries on with the next", async () => {
    discogs.getCollectionPage.mockResolvedValue(page(ids(1, 26).map(Number)));
    trackUpsert.upsertTracks.mockRejectedValueOnce(new Error("db down"));

    const body = await runSync();

    expect(body).toContain("❌ Auto-ingest error: db down");
    expect(trackUpsert.upsertTracks).toHaveBeenCalledTimes(2);
    expect(body).not.toContain("✅ Auto-ingest complete!");
    expect(body).toContain("All operations complete");
  });

  it("keeps syncing and saves the manifest after the client disconnects", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1, 2, 3]));
    const res = await GET(new Request("http://localhost/api/discogs?username=dj") as never);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    await vi.runAllTimersAsync();

    expect(discogs.getReleaseDetails).toHaveBeenCalledTimes(3);
    expect(savedIds().at(-1)).toEqual(["1", "2", "3"]);
    expect(trackUpsert.upsertTracks).toHaveBeenCalledTimes(1);
    expect(analyticsEvents.events.at(-1)?.event).toBe("discogs_sync_completed");
    expect(console.log).toHaveBeenCalledWith(
      "[Discogs Sync] Client disconnected; sync for dj continues",
    );
    expect(console.log).toHaveBeenCalledWith("[Discogs Sync] Saved release ID: 3");
  });

  it("saves nothing when the collection can't be listed", async () => {
    discogs.getCollectionPage.mockRejectedValue(new Error("HTTP 500"));

    const body = await runSync();

    expect(body).toContain("Error: HTTP 500");
    expect(manifest.saveManifest).not.toHaveBeenCalled();
  });

  it("logs a manifest that can't be saved on the way out", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1]));
    manifest.saveManifest.mockImplementation(() => {
      throw new Error("read-only");
    });

    const body = await runSync();

    expect(body).toContain("Error: read-only");
    expect(manifest.saveManifest).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      "[Discogs Sync] Could not save manifest:",
      expect.any(Error),
    );
  });

  it("reads every collection page, stopping at an empty one", async () => {
    discogs.getCollectionPage
      .mockResolvedValueOnce({ ...page([1]), pagination: { page: 1, pages: 3 } })
      .mockResolvedValueOnce({ pagination: { page: 2, pages: 3 } });

    const body = await runSync();

    expect(discogs.getCollectionPage).toHaveBeenCalledTimes(2);
    expect(body).toContain("Page 2 - releases found: 0");
    expect(savedIds().at(-1)).toEqual(["1"]);
  });

  it("deletes removed releases and keeps them out of every checkpoint", async () => {
    const removed = ids(100, 111);
    manifest.getManifestReleaseIds.mockReturnValue(["1", ...removed]);
    discogs.getCollectionPage.mockResolvedValue(page([1, 2]));
    cleanup.cleanupDiscogsReleases.mockResolvedValueOnce({
      friendId: 4,
      deletedTracksCount: 30,
      deletedAlbumsCount: 12,
    });

    const body = await runSync();

    expect(body).toContain("Detected 12 releases removed");
    expect(body).toContain("Deleted local files 10/12...");
    expect(body).toContain("✅ Deleted 30 tracks and 12 albums for removed releases");
    expect(savedIds().every((saved) => !(saved as string[]).includes("100"))).toBe(true);
    expect(savedIds().at(-1)).toEqual(["1", "2"]);
  });

  it("counts only files actually deleted, and reports a failed DB cleanup", async () => {
    manifest.getManifestReleaseIds.mockReturnValue(["1", "100"]);
    discogs.getCollectionPage.mockResolvedValue(page([1]));
    manifest.deleteRelease.mockImplementation(() => false);
    cleanup.cleanupDiscogsReleases.mockRejectedValueOnce("db gone");

    const body = await runSync();

    expect(body).toContain("⚠️  Error deleting releases: db gone");
    expect(savedIds().at(-1)).toEqual(["1"]);
  });

  it("names an Error from the DB cleanup", async () => {
    manifest.getManifestReleaseIds.mockReturnValue(["100"]);
    discogs.getCollectionPage.mockResolvedValue(page([]));
    cleanup.cleanupDiscogsReleases.mockRejectedValueOnce(new Error("db gone"));

    expect(await runSync()).toContain("⚠️  Error deleting releases: db gone");
  });

  it.each([[new Error("bad album")], ["bad album"]])(
    "reports an album ingest failure (%s) and still queues embeddings",
    async (failure) => {
      discogs.getCollectionPage.mockResolvedValue(page([1]));
      albumUpsert.upsertAlbums.mockRejectedValueOnce(failure);

      const body = await runSync();

      expect(body).toContain("⚠️  Album ingest error: bad album");
      expect(embeddingSync.syncIdentityEmbeddings).toHaveBeenCalledTimes(1);
    },
  );

  it("names a non-Error ingest failure", async () => {
    discogs.getCollectionPage.mockResolvedValue(page([1]));
    trackUpsert.upsertTracks.mockRejectedValueOnce("db down");

    expect(await runSync()).toContain("❌ Auto-ingest error: db down");
  });

  it("names a non-Error sync failure", async () => {
    discogs.getCollectionPage.mockRejectedValue("offline");

    expect(await runSync()).toContain("Error: offline");
  });
});
