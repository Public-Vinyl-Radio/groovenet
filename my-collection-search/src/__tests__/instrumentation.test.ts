import { afterEach, describe, expect, it, vi } from "vitest";
const { seed, queue } = vi.hoisted(() => ({ seed: vi.fn(), queue: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("../../sentry.server.config", () => ({}));
vi.mock("../../sentry.edge.config", () => ({}));
vi.mock("@/lib/embeddings/config", () => ({ seedEmbeddingModelDefaults: seed }));
vi.mock("@/server/services/embeddingQueueService", () => ({ startEmbeddingQueueWorker: queue }));
vi.mock("@/server/services/backupRunnerService", () => ({ startBackupScheduler: vi.fn() }));
vi.mock("@/server/services/ingestSweeperService", () => ({ startIngestSweeper: vi.fn() }));
vi.mock("@/server/services/ingestLifecycleService", () => ({ startIngestReaper: vi.fn() }));
vi.mock("@/server/services/fingerprintBackfillService", () => ({
  startFingerprintBackfill: vi.fn(),
}));
vi.mock("@/server/services/playAggregationService", () => ({ startPlayAggregation: vi.fn() }));
vi.mock("@/server/services/nowPlayingTrackerService", () => ({ startNowPlayingTracker: vi.fn() }));
vi.mock("@/server/services/genreSimilarityService", () => ({
  startGenreSimilarityRefresh: vi.fn(),
}));
import { register } from "../instrumentation";
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("embedding startup", () => {
  it("awaits default initialization before starting the queue", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    seed.mockImplementationOnce(async () => {
      expect(queue).not.toHaveBeenCalled();
    });
    await register();
    expect(seed).toHaveBeenCalledOnce();
    expect(queue).toHaveBeenCalledOnce();
  });
  it("does not start a queue if initialization fails", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    seed.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(register()).rejects.toThrow("db unavailable");
    expect(queue).not.toHaveBeenCalled();
  });
  it("does not initialize database settings in edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(seed).not.toHaveBeenCalled();
  });
});
