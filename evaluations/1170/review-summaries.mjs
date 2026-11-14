#!/usr/bin/env node
/**
 * Terminal reviewer for the #1170 summary-quality sheet. Local only; saves
 * after every verdict with a private atomic replace.
 *
 *   node evaluations/1170/review-summaries.mjs --file eval-data/1170-quality.json
 *
 * f faithful · m minor (note) · h hallucinated (note) · s skip · b back · q quit
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { tally } from "./quality-sample.mjs";

const KEYS = { f: "faithful", m: "minor", h: "hallucinated" };

export function display(item, index, total) {
  const s = item.summary;
  return [
    `#1170 summary review — ${index + 1}/${total} (${item.stratum})`,
    `${item.title} — ${item.artist}`,
    "",
    "── Lyrics ──────────────────────────────",
    item.lyrics.trim(),
    "",
    "── Summary ─────────────────────────────",
    `themes:   ${s.themes.join(", ") || "(none)"}`,
    `mood:     ${s.mood.join(", ")}`,
    `language: ${s.languages.join(", ")}`,
    `vocals:   ${s.vocal_presence}`,
    "",
    `Current: ${item.verdict ?? "unreviewed"}${item.note ? ` | ${item.note}` : ""}`,
    "[f] faithful  [m] minor (note)  [h] hallucinated (note)  [s] skip  [b] back  [q] quit",
  ].join("\n");
}

/**
 * Apply one command. Returns the next index, or null to quit. `note` is the
 * note typed for m/h; a missing note leaves the item unchanged.
 */
export function apply(items, index, command, note = "") {
  const c = command.trim().toLowerCase();
  if (c === "q") return null;
  if (c === "b") return Math.max(0, index - 1);
  if (c === "s" || c === "") return Math.min(items.length - 1, index + 1);
  const verdict = KEYS[c];
  if (!verdict) return index;
  if (verdict !== "faithful" && !note.trim()) return index;
  items[index].verdict = verdict;
  items[index].note = verdict === "faithful" ? "" : note.trim();
  return Math.min(items.length - 1, index + 1);
}

export function save(file, review) {
  tally(review);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(review, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(tmp, file);
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--file");
  if (i < 0) throw new Error("Usage: node evaluations/1170/review-summaries.mjs --file SHEET");
  const file = args[i + 1];
  const review = JSON.parse(readFileSync(file, "utf8"));
  tally(review);
  const items = review.items;
  let index = Math.max(
    0,
    items.findIndex((x) => !x.verdict),
  );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (index !== null) {
      stdout.write(`\n${display(items[index], index, items.length)}\n`);
      const command = await rl.question("> ");
      const key = command.trim().toLowerCase();
      const note = key === "m" || key === "h" ? await rl.question("note (required): ") : "";
      const next = apply(items, index, command, note);
      if (KEYS[key]) save(file, review);
      index = next;
      if (index !== null && items.every((x) => x.verdict) && KEYS[key])
        stdout.write("\nAll items reviewed. q to quit, b to revisit.\n");
    }
  } finally {
    rl.close();
  }
  console.log(JSON.stringify(tally(review), null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
