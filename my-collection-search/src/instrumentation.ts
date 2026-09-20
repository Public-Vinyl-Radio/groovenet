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
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
