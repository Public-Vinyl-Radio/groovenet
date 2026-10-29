#!/usr/bin/env node
/**
 * Queue analyze-local jobs for tracks with local audio.
 *
 * Usage:
 *   npm run backfill-essentia
 *   npm run backfill-essentia -- --friend_id=6
 *   npm run backfill-essentia -- --force
 */

import { trackOpsService } from "../server/services/trackOpsService";

type Options = {
  friend_id?: number;
  force?: boolean;
  limit?: number;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {};

  for (const arg of args) {
    if (arg.startsWith("--friend_id=")) {
      const value = Number.parseInt(arg.split("=")[1], 10);
      if (Number.isNaN(value) || value <= 0) {
        console.error("Invalid --friend_id value");
        process.exit(1);
      }
      options.friend_id = value;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.split("=")[1], 10);
      if (Number.isNaN(value) || value <= 0) {
        console.error("Invalid --limit value");
        process.exit(1);
      }
      options.limit = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: npm run backfill-essentia [options]

Options:
  --friend_id=N   Only process tracks for this friend_id
  --force         Queue jobs even when Essentia JSON already exists
  --limit=N       Max number of candidate tracks to inspect
  --help, -h      Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const opts = parseArgs();

  console.log("Starting Essentia backfill queue...");
  console.log("Options:", opts);

  const result = await trackOpsService.queueEssentiaBackfillJobs({
    friend_id: opts.friend_id ?? null,
    force: Boolean(opts.force),
    limit: opts.limit,
  });

  console.log("Done.");
  console.log({
    total_candidates: result.total_candidates,
    queued: result.queued,
    skipped_existing: result.skipped_existing,
    errors: result.errors.length,
    force: result.force,
  });

  if (result.errors.length > 0) {
    result.errors.slice(0, 10).forEach((error) => {
      console.error(`Failed to queue ${error.track_id}:${error.friend_id} ${error.error}`);
    });
  }
}

main().catch((err) => {
  console.error("Essentia backfill script failed:", err);
  process.exit(1);
});
