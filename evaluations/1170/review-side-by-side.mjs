#!/usr/bin/env node
/**
 * Terminal reviewer for the #1170 side-by-side sheet. Local only; saves after
 * every verdict with a private atomic replace. It never reads the key.
 *
 *   node evaluations/1170/review-side-by-side.mjs --file eval-data/1170-side-by-side.json
 *
 * a · b · = (no real difference), each optionally followed by a note
 * ("b more latin, fewer filler tracks") · s skip · p previous · q quit
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const KIND = "1170-side-by-side";
const COMMANDS = { a: "a", b: "b", "=": "same" };

const line = (t) => {
  const styles = t.styles?.length ? `  [${t.styles.slice(0, 3).join(", ")}]` : "";
  return `${t.title} — ${t.artist} (${[t.album, t.year].filter(Boolean).join(", ")})${styles}`;
};

export function display(item, index, total) {
  const list = (tracks) =>
    tracks.map((t, i) => `${t.in_both ? "=" : " "} ${String(i + 1).padStart(2)}. ${line(t)}`);
  const verdict = { a: "A", b: "B", same: "no difference" }[item.verdict] ?? "unreviewed";
  return [
    `#1170 similar tracks — ${index + 1}/${total}`,
    `Seed: ${line(item.seed)}${item.seed.tags ? `  tags: ${item.seed.tags}` : ""}`,
    "",
    "── A ───────────────────────────────────",
    ...list(item.a),
    "",
    "── B ───────────────────────────────────",
    ...list(item.b),
    "",
    "(= marks a track in both lists)",
    `Current: ${verdict}${item.note ? ` | ${item.note}` : ""}`,
    "Which would you rather dig through from this seed?",
    "[a] A  [b] B  [=] no real difference  (add a note after the key)  [s] skip  [p] previous  [q] quit",
  ].join("\n");
}

/** Apply one typed line. Returns the next index, or null to quit. */
export function apply(items, index, input) {
  const text = input.trim();
  const [head = "", ...rest] = text.split(/\s+/);
  const c = head.toLowerCase();
  if (c === "q") return null;
  if (c === "p") return Math.max(0, index - 1);
  if (c === "s" || c === "") return Math.min(items.length - 1, index + 1);
  const verdict = COMMANDS[c];
  if (!verdict) return index;
  items[index].verdict = verdict;
  items[index].note = rest.join(" ");
  return Math.min(items.length - 1, index + 1);
}

export function save(file, sheet) {
  if (sheet?.kind !== KIND) throw new Error("Not a #1170 side-by-side sheet");
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(sheet, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(tmp, file);
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--file");
  if (i < 0) throw new Error("Usage: node evaluations/1170/review-side-by-side.mjs --file SHEET");
  const file = args[i + 1];
  const sheet = JSON.parse(readFileSync(file, "utf8"));
  if (sheet?.kind !== KIND) throw new Error("Not a #1170 side-by-side sheet");
  const items = sheet.items;
  let index = Math.max(
    0,
    items.findIndex((x) => !x.verdict),
  );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (index !== null) {
      stdout.write(`\n${display(items[index], index, items.length)}\n`);
      const input = await rl.question("> ");
      const judged = COMMANDS[input.trim().split(/\s+/)[0]?.toLowerCase()];
      index = apply(items, index, input);
      if (judged) save(file, sheet);
      if (index !== null && judged && items.every((x) => x.verdict))
        stdout.write("\nAll seeds reviewed. q to quit, p to revisit.\n");
    }
  } finally {
    rl.close();
  }
  const done = items.filter((x) => x.verdict).length;
  console.log(`${done}/${items.length} reviewed`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
