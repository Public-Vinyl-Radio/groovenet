// Puts the real covers into the player TUI captures (#931). VHS draws the TUI
// through xterm.js, which has no Kitty graphics, so the tapes in tui-tapes/
// capture it with GROOVENET_TUI_ART=off and GROOVENET_TUI_ART_SLOTS, and the
// TUI reports each art slot as a cell rectangle. This turns cells into pixels,
// fetches the cover from the app and pastes it in, at full capture resolution.
//
//   node scripts/tui-screenshots.mjs composite <raw-dir> <app-url>
//   node scripts/tui-screenshots.mjs calibrate <raw-dir>
//
// `just site-tui-screenshots` runs both steps; see site/CLAUDE.md.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The cell grid tui-tapes/config.tape produces: JetBrains Mono 30px, line
 * height 1.0, letter spacing 0, 30px padding, 2260×1672 → 120×40 cells.
 * Measured once with `just site-tui-screenshots --calibrate`, which draws an
 * inverse frame round the whole terminal: it spans x 42–2218 and y 30–1642,
 * so a cell is 2176/120 = 18.133px wide and 1612/40 = 40.3px tall. xterm.js
 * lays cells out at fractional pixels, so keep the fractions.
 */
export const METRICS = {
  columns: 120,
  rows: 40,
  originX: 42,
  originY: 30,
  cellWidth: 2176 / 120,
  cellHeight: 1612 / 40,
};

/** One tape per shot (tui-tapes/<name>.tape), and the art slots it must show. A clip records an mp4. */
export const SHOTS = [
  { name: "now-playing", slots: 1 },
  { name: "queue", slots: 1 },
  { name: "search", slots: 1 },
  { name: "playlists", slots: 1 },
  { name: "devices", slots: 1 },
  // A short GIF of browsing the queue: the cover is overlaid with ffmpeg.
  { name: "queue-browse", slots: 1, clip: true },
];

/** A cell rectangle as pixels, edges rounded to the nearest pixel. */
export function cellsToPixels({ x, y, width, height }, metrics = METRICS) {
  const left = Math.round(metrics.originX + x * metrics.cellWidth);
  const top = Math.round(metrics.originY + y * metrics.cellHeight);
  const right = Math.round(metrics.originX + (x + width) * metrics.cellWidth);
  const bottom = Math.round(metrics.originY + (y + height) * metrics.cellHeight);
  return { left, top, width: right - left, height: bottom - top };
}

/** The largest `imageWidth`×`imageHeight` box that fits in `box`, centred, as the TUI fits covers. */
export function containBox(box, imageWidth, imageHeight) {
  const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
  const width = Math.max(1, Math.round(imageWidth * scale));
  const height = Math.max(1, Math.round(imageHeight * scale));
  return {
    left: box.left + Math.floor((box.width - width) / 2),
    top: box.top + Math.floor((box.height - height) / 2),
    width,
    height,
  };
}

/** `box` grown by `by` pixels on every side, clamped to the image. */
export function grow(box, by, imageWidth, imageHeight) {
  const left = Math.max(0, box.left - by);
  const top = Math.max(0, box.top - by);
  return {
    left,
    top,
    width: Math.min(imageWidth, box.left + box.width + by) - left,
    height: Math.min(imageHeight, box.top + box.height + by) - top,
  };
}

/** Throws unless a shot's report matches the calibrated grid and the slots it should show. */
export function checkReport(name, report, expectedSlots, metrics = METRICS) {
  if (report.columns !== metrics.columns || report.rows !== metrics.rows)
    throw new Error(
      `${name}: terminal was ${report.columns}×${report.rows}, calibrated for ${metrics.columns}×${metrics.rows}. Is JetBrains Mono installed? Otherwise recalibrate (--calibrate).`,
    );
  if (report.slots.length !== expectedSlots)
    throw new Error(`${name}: expected ${expectedSlots} art slot(s), the TUI reported ${report.slots.length}`);
  for (const slot of report.slots) {
    if (slot.x < 0 || slot.y < 0 || slot.x + slot.width > report.columns || slot.y + slot.height > report.rows)
      throw new Error(`${name}: art slot ${JSON.stringify(slot)} is off screen`);
    if (!slot.sources.length) throw new Error(`${name}: an art slot has no cover to show`);
  }
}

/**
 * The calibration frame's grid, from a greyscale capture of calibrate.sh:
 * the bright pixels' bounds divided by the terminal's cells.
 */
export function measureFrame(grey, width, height, { columns, rows }) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (grey[y * width + x] > 128) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < 0) throw new Error("calibration capture has no frame");
  return {
    columns,
    rows,
    originX: left,
    originY: top,
    cellWidth: (right + 1 - left) / columns,
    cellHeight: (bottom + 1 - top) / rows,
  };
}

/** Whether a measured grid puts every cell edge within half a pixel of `metrics`. */
export function sameGrid(measured, metrics = METRICS) {
  if (measured.columns !== metrics.columns || measured.rows !== metrics.rows) return false;
  const edge = (origin, cell, count) => origin + cell * count;
  return (
    Math.abs(measured.originX - metrics.originX) <= 0.5 &&
    Math.abs(measured.originY - metrics.originY) <= 0.5 &&
    Math.abs(edge(measured.originX, measured.cellWidth, metrics.columns) - edge(metrics.originX, metrics.cellWidth, metrics.columns)) <= 0.5 &&
    Math.abs(edge(measured.originY, measured.cellHeight, metrics.rows) - edge(metrics.originY, metrics.cellHeight, metrics.rows)) <= 0.5
  );
}

/** A slot's source as a URL: relative ones are the app's own uploads. */
export const coverUrl = (source, appUrl) => new URL(source, appUrl).href;

async function fetchCover(sources, appUrl) {
  const problems = [];
  // In the TUI's order: a stale URL falls through to the next.
  for (const source of sources) {
    try {
      const response = await fetch(coverUrl(source, appUrl), { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      problems.push(`${source}: ${error.message}`);
    }
  }
  throw new Error(`no cover could be fetched (${problems.join("; ")})`);
}

/** One slot's layers, in capture pixels: the theme background over the placeholder, then the cover. */
async function slotLayers(sharp, slot, appUrl, background, size) {
  const box = cellsToPixels(slot);
  // Cover the placeholder's shading completely, a pixel past its fractional cell edges.
  const fill = grow(box, 1, size.width, size.height);
  const source = sharp(await fetchCover(slot.sources, appUrl), { limitInputPixels: 16_000_000, animated: false }).rotate();
  const meta = await source.metadata();
  const upright = (meta.orientation ?? 1) >= 5;
  const fit = containBox(box, upright ? meta.height : meta.width, upright ? meta.width : meta.height);
  const cover = await source.resize(fit.width, fit.height, { fit: "fill", kernel: "lanczos3" }).toColourspace("srgb").png().toBuffer();
  return {
    fill,
    layers: [
      { input: { create: { width: fill.width, height: fill.height, channels: 3, background } }, left: fill.left, top: fill.top },
      { input: cover, left: fit.left, top: fit.top },
    ],
  };
}

async function composite(rawDir, appUrl, outDir) {
  const { default: sharp } = await import("sharp");
  for (const { name, slots, clip } of SHOTS) {
    const capture = path.join(rawDir, `${name}.png`);
    // A clip's art slot never moves (one track, one view), so its last frame stands for all of them.
    if (clip) execFileSync("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.2", "-i", path.join(rawDir, `${name}.mp4`), "-frames:v", "1", capture]);
    const report = JSON.parse(await readFile(path.join(rawDir, `${name}.slots.json`), "utf8"));
    checkReport(name, report, slots);
    const size = await sharp(capture).metadata();
    // Behind a cover that doesn't fill its slot. Sampled from the padding, not
    // the theme: xterm.js renders the theme's #141414 as #121212.
    const data = await sharp(capture).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    const background = { r: data[0], g: data[1], b: data[2] };
    const slotsLayers = await Promise.all(report.slots.map((slot) => slotLayers(sharp, slot, appUrl, background, size)));
    const where = report.slots.map((s) => `${s.width}×${s.height}@${s.x},${s.y}`).join(" ");
    if (!clip) {
      await sharp(capture).composite(slotsLayers.flatMap((s) => s.layers)).png().toFile(path.join(outDir, `tui-${name}.png`));
      console.log(`tui-${name}.png: ${report.slots.length} cover(s) at ${where}`);
      continue;
    }
    const [{ fill, layers }] = slotsLayers;
    const overlay = path.join(rawDir, `${name}.overlay.png`);
    await sharp(capture).extract(fill).composite(layers.map((layer) => ({ ...layer, left: layer.left - fill.left, top: layer.top - fill.top }))).png().toFile(overlay);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(rawDir, `${name}.mp4`), "-i", overlay, "-filter_complex", gifFilter(fill, CLIP_WIDTH), path.join(outDir, `tui-${name}.gif`)]);
    console.log(`tui-${name}.gif: cover overlaid at ${where}`);
  }
}

/**
 * The clip's GIF is the docs column's 2x (760px shown, so 1520), at 12 fps
 * with one 64-colour palette: the TUI is greys plus one cover.
 */
export const CLIP_WIDTH = 1520;
export const gifFilter = (at, width) =>
  `[0][1]overlay=${at.left}:${at.top},fps=12,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;

async function calibrate(rawDir) {
  const { default: sharp } = await import("sharp");
  const size = JSON.parse(await readFile(path.join(rawDir, "calibrate.size.json"), "utf8"));
  const { data, info } = await sharp(path.join(rawDir, "calibrate.png")).greyscale().raw().toBuffer({ resolveWithObject: true });
  const measured = measureFrame(data, info.width, info.height, size);
  console.log("measured  ", measured);
  console.log("calibrated", METRICS);
  if (!sameGrid(measured)) {
    console.error("The grid differs from METRICS: update METRICS (and its comment) from the measured values.");
    process.exitCode = 1;
  } else console.log("METRICS match the tape's grid.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, rawDir, appUrl] = process.argv.slice(2);
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/assets/screenshots");
  if (command === "composite" && rawDir && appUrl) await composite(rawDir, appUrl, outDir);
  else if (command === "calibrate" && rawDir) await calibrate(rawDir);
  else {
    console.error("usage: tui-screenshots.mjs composite <raw-dir> <app-url> | calibrate <raw-dir>");
    process.exitCode = 2;
  }
}
