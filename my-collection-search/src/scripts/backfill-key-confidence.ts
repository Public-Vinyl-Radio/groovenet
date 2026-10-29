#!/usr/bin/env node
/**
 * Recompute tracks.key/key_confidence from already-saved Essentia analysis
 * JSON, using the consensus vote among key_edma/key_krumhansl/key_temperley
 * (#524) instead of re-running Essentia (CPU-bound, no batch endpoint) or
 * trusting whatever was stored by earlier, less careful logic.
 *
 * `key` has no provenance tracking — a manual correction made through the
 * edit form and an Essentia-derived value look identical in the database.
 * So this is careful by default:
 *
 *   - A confidence-only refresh (the consensus key agrees with what's
 *     already stored, just a different confidence number) is safe and
 *     always applied under --apply.
 *   - A key CHANGE (the consensus key differs from what's stored) is only
 *     ever reported, never written, unless --apply-key-changes is also
 *     given — review the printed list first.
 *
 * Usage:
 *   npm run backfill-key-confidence                              # dry run: report only, no writes
 *   npm run backfill-key-confidence -- --apply                   # write confidence-only refreshes
 *   npm run backfill-key-confidence -- --apply --apply-key-changes  # also write key changes
 *   npm run backfill-key-confidence -- --friend_id=6 --limit=500
 */

import { trackRepository } from "../server/repositories/trackRepository";
import { readEssentiaAnalysis } from "../lib/essentia-storage";
import { extractKeyAnalysis, type EssentiaTonal } from "../lib/essentiaKey";

type Options = {
  friend_id?: number;
  limit?: number;
  apply?: boolean;
  applyKeyChanges?: boolean;
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
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--apply-key-changes") {
      options.applyKeyChanges = true;
    } else if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.split("=")[1], 10);
      if (Number.isNaN(value) || value <= 0) {
        console.error("Invalid --limit value");
        process.exit(1);
      }
      options.limit = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: npm run backfill-key-confidence [options]

Options:
  --friend_id=N        Only process tracks for this friend_id
  --limit=N             Max number of candidate tracks to inspect
  --apply               Write confidence-only refreshes (default: dry run, nothing written)
  --apply-key-changes   Also write key changes (requires --apply); always reported either way
  --help, -h            Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const opts = parseArgs();

  console.log("Starting key/key_confidence recompute (consensus vote, #524)...");
  console.log("Options:", opts);
  console.log(
    opts.apply
      ? "Writing confidence-only refreshes." +
          (opts.applyKeyChanges
            ? " Also writing key changes."
            : " Key changes will only be reported.")
      : "Dry run — nothing will be written. Pass --apply to write confidence-only refreshes.",
  );

  const rows = await trackRepository.findTracksWithKeyForRecompute(
    opts.friend_id ?? null,
    opts.limit,
  );

  let confidenceOnlyChanges = 0;
  let keyChangedChanges = 0;
  let keyChangeNeedsReview = 0;
  let unchanged = 0;
  let skippedNoFile = 0;
  let skippedNoEstimate = 0;
  const keyChanges: {
    track_id: string;
    friend_id: number;
    old_key: string | null | undefined;
    new_key: string;
  }[] = [];
  const errors: { track_id: string; friend_id: number; error: string }[] = [];

  for (const row of rows) {
    try {
      const saved = readEssentiaAnalysis(row.track_id, row.friend_id);
      if (!saved) {
        skippedNoFile += 1;
        continue;
      }

      const payload = saved.payload as { analysis?: { tonal?: EssentiaTonal } };
      const { key: newKey, key_confidence: newConfidence } = extractKeyAnalysis(
        payload?.analysis?.tonal,
      );
      if (newKey === null) {
        skippedNoEstimate += 1;
        continue;
      }

      const keyIsChanging = newKey !== row.key;
      if (keyIsChanging) {
        keyChanges.push({
          track_id: row.track_id,
          friend_id: row.friend_id,
          old_key: row.key,
          new_key: newKey,
        });
      }

      if (!keyIsChanging && newConfidence === row.key_confidence) {
        unchanged += 1;
        continue;
      }

      const canWriteKeyChange = keyIsChanging && opts.apply && opts.applyKeyChanges;
      if (keyIsChanging && !canWriteKeyChange) {
        keyChangeNeedsReview += 1;
        continue;
      }

      if (opts.apply) {
        await trackRepository.updateTrackFields({
          track_id: row.track_id,
          friend_id: row.friend_id,
          ...(keyIsChanging ? { key: newKey } : {}),
          key_confidence: newConfidence,
        });
      }
      if (keyIsChanging) keyChangedChanges += 1;
      else confidenceOnlyChanges += 1;
    } catch (err) {
      errors.push({
        track_id: row.track_id,
        friend_id: row.friend_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const writesHappened = Boolean(opts.apply);
  console.log("Done.");
  console.log({
    total_candidates: rows.length,
    [writesHappened ? "confidence_only_updated" : "confidence_only_pending"]: confidenceOnlyChanges,
    // keyChangedChanges only ever increments once both --apply and
    // --apply-key-changes gated it through, so it's always an actual write.
    key_changed_updated: keyChangedChanges,
    key_change_needs_review: keyChangeNeedsReview,
    unchanged,
    skipped_no_file: skippedNoFile,
    skipped_no_estimate: skippedNoEstimate,
    errors: errors.length,
    apply: writesHappened,
    apply_key_changes: Boolean(opts.applyKeyChanges),
  });

  if (keyChanges.length > 0) {
    console.log(
      `\n${keyChanges.length} track(s) would get a different key under the new consensus logic:`,
    );
    keyChanges.slice(0, 50).forEach((c) => {
      console.log(`  ${c.track_id}:${c.friend_id}  "${c.old_key}" -> "${c.new_key}"`);
    });
    if (keyChanges.length > 50) {
      console.log(`  ...and ${keyChanges.length - 50} more`);
    }
    if (!(opts.apply && opts.applyKeyChanges)) {
      console.log(
        "\nKey changes were NOT written. Re-run with --apply --apply-key-changes to write them.\n" +
          "Review this list first — a manually-corrected key looks identical to an\n" +
          "Essentia-derived one in the database, so this can't tell the two apart.",
      );
    }
  }

  if (errors.length > 0) {
    errors.slice(0, 10).forEach((error) => {
      console.error(`Failed to recompute ${error.track_id}:${error.friend_id} ${error.error}`);
    });
  }
}

main().catch((err) => {
  console.error("key_confidence recompute script failed:", err);
  process.exit(1);
});
