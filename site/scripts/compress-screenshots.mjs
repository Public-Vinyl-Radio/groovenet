// Recompress the Playwright screenshots in src/assets/screenshots losslessly
// (zlib level 9, adaptive filtering, no palette quantisation), so the committed
// 2x PNGs stay small. sharp comes with Astro, which uses it for astro:assets.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/assets/screenshots");

for (const name of (await readdir(dir)).filter((f) => f.endsWith(".png")).sort()) {
  const file = path.join(dir, name);
  const before = await readFile(file);
  const after = await sharp(before)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 10 })
    .toBuffer();
  if (after.length < before.length) await writeFile(file, after);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`${name}: ${kb(before.length)} → ${kb(Math.min(before.length, after.length))}`);
}
