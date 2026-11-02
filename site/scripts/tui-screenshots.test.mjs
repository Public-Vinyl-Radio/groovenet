import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRICS,
  SHOTS,
  cellsToPixels,
  checkReport,
  containBox,
  coverUrl,
  gifFilter,
  grow,
  measureFrame,
  sameGrid,
} from "./tui-screenshots.mjs";

const grid = { columns: 4, rows: 2, originX: 10, originY: 5, cellWidth: 9.5, cellHeight: 20.25 };

test("converts cells to pixels on a fractional grid, rounding each edge", () => {
  assert.deepEqual(cellsToPixels({ x: 0, y: 0, width: 1, height: 1 }, grid), { left: 10, top: 5, width: 10, height: 20 });
  // 10 + 1×9.5 = 19.5 → 20; 10 + 3×9.5 = 38.5 → 39. Adjacent slots share edges.
  assert.deepEqual(cellsToPixels({ x: 1, y: 1, width: 2, height: 1 }, grid), { left: 20, top: 25, width: 19, height: 21 });
});

test("the calibrated grid puts the full-window art slot where the capture shows it", () => {
  assert.deepEqual(cellsToPixels({ x: 2, y: 3, width: 18, height: 8 }), { left: 78, top: 151, width: 327, height: 322 });
  const whole = cellsToPixels({ x: 0, y: 0, width: METRICS.columns, height: METRICS.rows });
  assert.deepEqual(whole, { left: 42, top: 30, width: 2176, height: 1612 });
});

test("fits a cover inside its slot, centred, as the TUI does", () => {
  const box = { left: 100, top: 50, width: 300, height: 200 };
  assert.deepEqual(containBox(box, 600, 600), { left: 150, top: 50, width: 200, height: 200 });
  assert.deepEqual(containBox(box, 900, 300), { left: 100, top: 100, width: 300, height: 100 });
  assert.deepEqual(containBox(box, 1, 1000), { left: 249, top: 50, width: 1, height: 200 });
});

test("grows a box and clamps it to the image", () => {
  assert.deepEqual(grow({ left: 10, top: 10, width: 20, height: 20 }, 1, 100, 100), { left: 9, top: 9, width: 22, height: 22 });
  assert.deepEqual(grow({ left: 0, top: 0, width: 100, height: 50 }, 2, 100, 50), { left: 0, top: 0, width: 100, height: 50 });
});

test("accepts a report on the calibrated grid with the expected slots", () => {
  const slot = { x: 2, y: 3, width: 18, height: 8, sources: ["/a.jpg"] };
  assert.doesNotThrow(() => checkReport("hero", { columns: 120, rows: 40, slots: [slot] }, 1));
  assert.throws(() => checkReport("hero", { columns: 127, rows: 40, slots: [slot] }, 1), /127×40, calibrated for 120×40/);
  assert.throws(() => checkReport("hero", { columns: 120, rows: 40, slots: [] }, 1), /expected 1 art slot\(s\), the TUI reported 0/);
  assert.throws(() => checkReport("hero", { columns: 120, rows: 40, slots: [{ ...slot, x: 110 }] }, 1), /off screen/);
  assert.throws(() => checkReport("hero", { columns: 120, rows: 40, slots: [{ ...slot, sources: [] }] }, 1), /no cover/);
});

test("measures the grid from a capture of the calibration frame", () => {
  // A 4×2 grid of 3×5 cells at (2, 1) in a 20×14 image; the frame lights every edge cell.
  const width = 20;
  const height = 14;
  const grey = new Uint8Array(width * height);
  for (let y = 1; y < 11; y++) for (let x = 2; x < 14; x++) if (y < 6 || y >= 6 || x < 5 || x >= 11) grey[y * width + x] = 230;
  const measured = measureFrame(grey, width, height, { columns: 4, rows: 2 });
  assert.deepEqual(measured, { columns: 4, rows: 2, originX: 2, originY: 1, cellWidth: 3, cellHeight: 5 });
  assert.throws(() => measureFrame(new Uint8Array(4), 2, 2, { columns: 1, rows: 1 }), /no frame/);
});

test("compares a measured grid with METRICS to half a pixel at the far edges", () => {
  assert.ok(sameGrid({ ...METRICS }));
  assert.ok(sameGrid({ ...METRICS, originX: 42.4, cellWidth: METRICS.cellWidth - 0.4 / 120 }));
  assert.ok(!sameGrid({ ...METRICS, cellWidth: METRICS.cellWidth + 0.01 }));
  assert.ok(!sameGrid({ ...METRICS, originY: 31 }));
  assert.ok(!sameGrid({ ...METRICS, columns: 121 }));
});

test("resolves app-relative covers against the app and keeps absolute ones", () => {
  assert.equal(coverUrl("/uploads/album-covers/a.jpg", "http://127.0.0.1:34004"), "http://127.0.0.1:34004/uploads/album-covers/a.jpg");
  assert.equal(coverUrl("https://i.discogs.com/x.jpeg", "http://127.0.0.1:34004"), "https://i.discogs.com/x.jpeg");
});

test("overlays the clip's cover at its slot before scaling", () => {
  assert.match(gifFilter({ left: 77, top: 150 }, 1520), /^\[0\]\[1\]overlay=77:150,fps=12,scale=1520:-1/);
});

test("every shot has a tape and the clip is the last", () => {
  assert.deepEqual(SHOTS.map((s) => s.name), ["now-playing", "queue", "search", "playlists", "devices", "queue-browse"]);
  assert.ok(SHOTS.every((s) => s.slots === 1));
});
