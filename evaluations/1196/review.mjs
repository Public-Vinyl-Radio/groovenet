#!/usr/bin/env node
/**
 * Terminal reviewer for the #1196 side-by-side sheet. Local only; saves after
 * every answer with a private atomic replace. It never reads the key.
 *
 *   node evaluations/1196/review.mjs --file eval-data/1196/review.json
 *
 * Type two answers, mix then set, each a, b or = (no real difference), then
 * an optional note: "a b b keeps the groove, a is all 7A". s skip,
 * p previous, q quit.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { KIND, QUESTIONS } from "./side-by-side.mjs";

const ANSWERS = { a: "a", b: "b", "=": "same" };
const LABEL = { a: "A", b: "B", same: "no difference" };

const line = (t) => {
  const meta = [t.bpm ? `${t.bpm} BPM` : "no BPM", t.key ?? "no key"].join(" · ");
  const styles = t.styles?.length ? `  [${t.styles.join(", ")}]` : "";
  return `${t.title} — ${t.artist} (${[t.album, t.year].filter(Boolean).join(", ")})  ${meta}${styles}`;
};

export function display(item, index, total) {
  const list = (tracks) =>
    tracks.length
      ? tracks.map((t, i) => `${t.in_both ? "=" : " "} ${String(i + 1).padStart(2)}. ${line(t)}`)
      : ["   (no suggestions)"];
  const seed =
    item.seed.playlist !== undefined
      ? `Playlist "${item.seed.playlist}" (${item.seed.tracks} tracks), ending on: ${line(item.seed)}`
      : `Seed: ${line(item.seed)}`;
  return [
    `#1196 suggestions — ${index + 1}/${total}`,
    seed,
    "",
    "── A ───────────────────────────────────",
    ...list(item.a),
    "",
    "── B ───────────────────────────────────",
    ...list(item.b),
    "",
    "(= marks a track in both lists)",
    `Current: mix ${LABEL[item.mix] ?? "–"} · set ${LABEL[item.set] ?? "–"}${item.note ? ` | ${item.note}` : ""}`,
    `1. ${QUESTIONS.mix}`,
    `2. ${QUESTIONS.set}`,
    "Answer both: [a] [b] [=] for each, e.g. `a b`, then an optional note.  [s] skip  [p] previous  [q] quit",
  ].join("\n");
}

/** Apply one typed line. Returns `{ index, saved }`; index null to quit. */
export function apply(items, index, input) {
  const [first = "", second = "", ...rest] = input.trim().split(/\s+/);
  const c = first.toLowerCase();
  const next = Math.min(items.length - 1, index + 1);
  if (c === "q") return { index: null, saved: false };
  if (c === "p") return { index: Math.max(0, index - 1), saved: false };
  if (c === "s" || c === "") return { index: next, saved: false };
  const mix = ANSWERS[c];
  const set = ANSWERS[second.toLowerCase()];
  if (!mix || !set) return { index, saved: false };
  items[index].mix = mix;
  items[index].set = set;
  items[index].note = rest.join(" ");
  return { index: next, saved: true };
}

export function save(file, sheet) {
  if (sheet?.kind !== KIND) throw new Error("Not a #1196 side-by-side sheet");
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(sheet, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(tmp, file);
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--file");
  if (i < 0) throw new Error("Usage: node evaluations/1196/review.mjs --file SHEET");
  const file = args[i + 1];
  const sheet = JSON.parse(readFileSync(file, "utf8"));
  if (sheet?.kind !== KIND) throw new Error("Not a #1196 side-by-side sheet");
  const items = sheet.items;
  let index = Math.max(
    0,
    items.findIndex((x) => !x.mix || !x.set),
  );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (index !== null) {
      stdout.write(`\n${display(items[index], index, items.length)}\n`);
      const step = apply(items, index, await rl.question("> "));
      if (step.saved) save(file, sheet);
      index = step.index;
      if (index !== null && step.saved && items.every((x) => x.mix && x.set))
        stdout.write("\nAll seeds reviewed. q to quit, p to revisit.\n");
    }
  } finally {
    rl.close();
  }
  console.log(`${items.filter((x) => x.mix && x.set).length}/${items.length} reviewed`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
