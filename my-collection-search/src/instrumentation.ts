import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { startBackupScheduler } = await import(
      "@/server/services/backupRunnerService"
    );
    startBackupScheduler();

    // Raw vinyl audio is transient: without this the ingest volume grows until
    // the disk fills (#269).
    const { startIngestSweeper } = await import(
      "@/server/services/ingestSweeperService"
    );
    startIngestSweeper();

    // Without this a crashed worker strands its chunk in `processing` forever
    // and the sweeper will not release the file until its age backstop (#276).
    const { startIngestReaper } = await import(
      "@/server/services/ingestLifecycleService"
    );
    startIngestReaper();

    // Backstop for #303: catches audio that gained a fingerprint job outside
    // the PATCH /api/tracks transition trigger, or missed it because
    // fingerprint-service had no engine registered at the time.
    const { startFingerprintBackfill } = await import(
      "@/server/services/fingerprintBackfillService"
    );
    startFingerprintBackfill();

    // Backstop for #304: `ingestLifecycleService.report()` aggregates a
    // source's detections into spins immediately, but nothing previously
    // re-ran that pass — this catches whatever the immediate trigger missed.
    const { startPlayAggregation } = await import(
      "@/server/services/playAggregationService"
    );
    startPlayAggregation();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
