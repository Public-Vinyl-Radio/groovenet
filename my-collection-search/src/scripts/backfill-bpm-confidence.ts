#!/usr/bin/env node
/**
 * Fill tracks.bpm_confidence for tracks analysed before the column existed
 * (#531), by reading the beat-histogram out of the Essentia JSON that every
 * analysis run already saved under ESSENTIA_DATA_DIR — no re-analysis.
 *
 * Unlike the key backfill this never touches `bpm`: it only writes the
 * confidence, and only where it is still NULL, so it is safe to re-run and
 * cannot clobber a manually corrected BPM. Tracks whose JSON is gone (or
 * predates the histogram fields) are counted and left NULL, which the UI
 * shows as "no confidence" rather than as a confident estimate.
 *
 * Usage:
 *   npm run backfill-bpm-confidence                       # dry run: report only
 *   npm run backfill-bpm-confidence -- --apply            # write
 *   npm run backfill-bpm-confidence -- --friend_id=6 --limit=500
 */

import { trackRepository } from "../server/repositories/trackRepository";
import { readEssentiaAnalysis } from "../lib/essentia-storage";
import { extractBpmConfidence, type EssentiaRhythm } from "../lib/essentiaBpm";

type Options = {
  friend_id?: number;
  limit?: number;
  apply?: boolean;
};

function parsePositiveInt(arg: string, flag: string): number {
  const value = Number.parseInt(arg.split("=")[1], 10);
  if (Number.isNaN(value) || value <= 0) {
    console.error(`Invalid ${flag} value`);
    process.exit(1);
  }
  return value;
}

function parseArgs(): Options {
  const options: Options = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--friend_id=")) options.friend_id = parsePositiveInt(arg, "--friend_id");
    else if (arg.startsWith("--limit=")) options.limit = parsePositiveInt(arg, "--limit");
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: npm run backfill-bpm-confidence [options]

Options:
  --friend_id=N   Only process tracks for this friend_id
  --limit=N       Max number of candidate tracks to inspect
  --apply         Write bpm_confidence (default: dry run, nothing written)
  --help, -h      Show this help message
      `);
      process.exit(0);
    }
  }
  return options;
}

async function main() {
  const opts = parseArgs();
  console.log("Starting bpm_confidence backfill (#531)...");
  console.log("Options:", opts);
  console.log(
    opts.apply
      ? "Writing bpm_confidence."
      : "Dry run — nothing will be written. Pass --apply to write.",
  );

  const rows = await trackRepository.findTracksWithBpmForConfidence(
    opts.friend_id ?? null,
    opts.limit,
  );

  let updated = 0;
  let skippedNoFile = 0;
  let skippedNoHistogram = 0;
  const errors: { track_id: string; friend_id: number; error: string }[] = [];

  for (const row of rows) {
    try {
      const saved = readEssentiaAnalysis(row.track_id, row.friend_id);
      if (!saved) {
        skippedNoFile += 1;
        continue;
      }
      const payload = saved.payload as { analysis?: { rhythm?: EssentiaRhythm } };
      const confidence = extractBpmConfidence(payload?.analysis?.rhythm);
      if (confidence === null) {
        skippedNoHistogram += 1;
        continue;
      }
      if (opts.apply) {
        await trackRepository.updateTrackFields({
          track_id: row.track_id,
          friend_id: row.friend_id,
          bpm_confidence: confidence,
        });
      }
      updated += 1;
    } catch (err) {
      errors.push({
        track_id: row.track_id,
        friend_id: row.friend_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("Done.");
  console.log({
    total_candidates: rows.length,
    [opts.apply ? "updated" : "pending"]: updated,
    skipped_no_file: skippedNoFile,
    skipped_no_histogram: skippedNoHistogram,
    errors: errors.length,
    apply: Boolean(opts.apply),
  });
  errors.slice(0, 10).forEach((e) => {
    console.error(`Failed to backfill ${e.track_id}:${e.friend_id} ${e.error}`);
  });
}

main().catch((err) => {
  console.error("bpm_confidence backfill script failed:", err);
  process.exit(1);
});
