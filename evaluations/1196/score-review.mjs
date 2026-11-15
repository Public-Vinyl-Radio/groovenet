#!/usr/bin/env node
/**
 * Scores the owner's completed #1196 side-by-side sheet against its key:
 * per question, how many seeds each profile won, no-difference answers,
 * automatic ties (identical lists) and unreviewed items, with an exact sign
 * test over the decided ones. Partial sheets score too, and say so.
 *
 *   node evaluations/1196/score-review.mjs --sheet eval-data/1196/review.json \
 *     --key eval-data/1196/review-key.json [--output eval-data/1196/review-score.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tallySideBySide } from "./side-by-side.mjs";

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const sheet = JSON.parse(readFileSync(opt("--sheet", "eval-data/1196/review.json"), "utf8"));
  const key = JSON.parse(readFileSync(opt("--key", "eval-data/1196/review-key.json"), "utf8"));
  const score = tallySideBySide(sheet, key);
  const out = JSON.stringify(score, null, 2) + "\n";
  writeFileSync(opt("--output", "eval-data/1196/review-score.json"), out, { mode: 0o600 });
  process.stdout.write(out);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
