import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { RESPONSIVE, responsiveThemeShots, themeScreenshots } from "./theme-screenshots.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "shots-"));
for (const f of ["a-light.png", "a-dark.png", "lonely-light.png", "logo.png"]) writeFileSync(path.join(dir, f), "");

/** Runs the plugin's image visitor on one image and records what it asks the context to do. */
function run(url, { options, alt = "Alt text", fileURL = pathToFileURL(path.join(dir, "page.md")) } = {}) {
  const node = { type: "image", url, alt, title: null };
  const calls = { set: [], inserted: [] };
  const localImagePaths = new Set();
  themeScreenshots(options).image(node, {
    fileURL,
    data: { astro: { localImagePaths } },
    setProperty: (_node, key, value) => calls.set.push([key, value]),
    insertAfter: (_node, inserted) => calls.inserted.push(inserted),
  });
  return { ...calls, localImagePaths };
}

test("a light image with a dark sibling gets a dark twin with the same alt", () => {
  const { set, inserted, localImagePaths } = run("./a-light.png");
  assert.deepEqual(set, [["data", { hProperties: { class: "shot shot-light" } }]]);
  assert.equal(inserted.length, 1);
  const [dark] = inserted;
  assert.equal(dark.type, "image");
  assert.equal(dark.url, "./a-dark.png");
  assert.equal(dark.alt, "Alt text");
  assert.deepEqual(dark.data.hProperties, { class: "shot shot-dark" });
  assert.deepEqual([...localImagePaths], ["./a-dark.png"]);
});

test("the visible image keeps its alt text and existing data", () => {
  const node = { type: "image", url: "./a-light.png", alt: "Keep me", data: { hProperties: { id: "x" }, other: 1 } };
  let data;
  themeScreenshots().image(node, {
    fileURL: pathToFileURL(path.join(dir, "page.md")),
    data: {},
    setProperty: (_n, _k, value) => (data = value),
    insertAfter: () => {},
  });
  assert.equal(node.alt, "Keep me");
  assert.deepEqual(data, { other: 1, hProperties: { id: "x", class: "shot shot-light" } });
});

test("an unpaired light image renders unchanged", () => {
  const { set, inserted } = run("./lonely-light.png");
  assert.deepEqual([set, inserted], [[], []]);
});

test("non-screenshot images are left alone", () => {
  for (const url of ["./logo.png", "https://example.com/a-light.png", "/a-light.png", "./a-dark.png", undefined]) {
    const { set, inserted } = run(url);
    assert.deepEqual([set, inserted], [[], []], String(url));
  }
});

test("the sibling is looked up next to the document, and a missing context is tolerated", () => {
  const seen = [];
  run("./a-light.png", { options: { exists: (p) => (seen.push(p), false) } });
  assert.deepEqual(seen, [path.join(dir, "a-dark.png")]);
  const noFile = run("./a-light.png", { fileURL: undefined, options: { exists: () => false } });
  assert.deepEqual(noFile.inserted, []);
});

test("responsiveThemeShots sizes every screenshot and nothing else", () => {
  const visit = responsiveThemeShots().element.visit;
  const set = [];
  const ctx = { setProperty: (_n, key, value) => set.push([key, value]) };
  const responsive = Object.entries(RESPONSIVE);
  visit({ properties: { className: ["shot", "shot-dark"] } }, ctx);
  assert.deepEqual(set.splice(0), responsive);
  visit({ properties: { className: "shot shot-light" } }, ctx);
  assert.deepEqual(set.splice(0), responsive);
  visit({ properties: { className: ["other"] } }, ctx);
  visit({ properties: {} }, ctx);
  assert.deepEqual(set, []);
});
