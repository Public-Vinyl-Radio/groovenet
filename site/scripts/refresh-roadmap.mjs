// Rewrites src/data/roadmap.yml (the build's fallback) from GitHub issue labels.
// Run through `just site-roadmap`. Leaves the file alone if nothing is labelled.
import { writeFileSync } from "node:fs";
import { fetchRoadmap } from "../src/lib/roadmap.mjs";

const file = new URL("../src/data/roadmap.yml", import.meta.url);
const columns = await fetchRoadmap({ timeoutMs: 30000 });
if (columns.length === 0) {
  console.log("No issues carry a roadmap:* label; leaving roadmap.yml as it is.");
  process.exit(0);
}

// JSON strings are valid YAML double-quoted scalars.
const q = JSON.stringify;
const lines = [
  "# The landing page's Roadmap section: the build's fallback when GitHub is",
  "# unreachable or nothing is labelled. Refresh with `just site-roadmap`.",
];
for (const col of columns) {
  lines.push(`- id: ${col.id}`, `  label: ${col.label}`, "  items:");
  for (const it of col.items) {
    lines.push(`    - title: ${q(it.title)}`, `      note: ${q(it.note)}`, `      url: ${q(it.url)}`);
  }
}
writeFileSync(file, lines.join("\n") + "\n");
console.log(`Wrote ${columns.reduce((n, c) => n + c.items.length, 0)} items to src/data/roadmap.yml`);
