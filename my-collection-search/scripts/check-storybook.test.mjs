import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkStorybook } from "./check-storybook.mjs";

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "groovenet-storybook-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "index.html": '<link href="./assets/main.css"><script src="./manager.js"></script>',
    "iframe.html": '<script type="module" src="./assets/preview.js?v=1#preview"></script>',
    "index.json": JSON.stringify({ entries: { example: { type: "story" } } }),
    "manager.js": 'console.log("manager")',
    "assets/main.css": 'body { background: url("./image.svg"); }',
    "assets/image.svg": "<svg/>",
    "assets/preview.js": 'import { story } from "./shared.js"; import("./story.js");',
    "assets/shared.js": "export const story = true;",
    "assets/story.js": 'import "./shared.js";',
    ...overrides,
  };
  for (const [file, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

test("verifies manager, preview, fonts/images, shared chunks and lazy stories under /storybook/", (t) => {
  assert.equal(checkStorybook(fixture(t)), 9);
});

test("follows literal template imports and re-exports, ignoring code examples and computed/package imports", (t) => {
  const root = fixture(t, {
    "assets/preview.js":
      'import(`./story.js`); export { story } from "./shared.js"; export const value = 1; import("pkg"); import("./" + value); import();',
    "manager.js": 'console.log("example: import(\\\"./missing.js\\\")");',
  });
  assert.equal(checkStorybook(root), 9);
});

for (const file of [
  "index.html",
  "iframe.html",
  "index.json",
  "manager.js",
  "assets/shared.js",
  "assets/story.js",
  "assets/image.svg",
]) {
  test(`rejects a missing ${file}, not just an empty output directory`, (t) => {
    assert.throws(() => checkStorybook(fixture(t, { [file]: null })), /ENOENT/);
  });
}

test("rejects an empty referenced asset", (t) => {
  assert.throws(
    () => checkStorybook(fixture(t, { "assets/story.js": "" })),
    /Empty Storybook asset/,
  );
});

for (const index of ["{}", '{"entries":{}}', '{"entries":{"doc":{"type":"docs"}}}']) {
  test(`rejects an index without stories: ${index}`, (t) => {
    assert.throws(() => checkStorybook(fixture(t, { "index.json": index })), /contains no stories/);
  });
}

test("rejects invalid story index JSON", (t) => {
  assert.throws(() => checkStorybook(fixture(t, { "index.json": "{" })), SyntaxError);
});

test("rejects a page with no scripts", (t) => {
  assert.throws(
    () => checkStorybook(fixture(t, { "index.html": "<h1>Storybook</h1>" })),
    /no JavaScript assets/,
  );
});

for (const reference of ["/assets/preview.js", "../../preview.js"]) {
  test(`rejects assets served outside /storybook/: ${reference}`, (t) => {
    assert.throws(
      () => checkStorybook(fixture(t, { "iframe.html": `<script src="${reference}"></script>` })),
      /escapes/,
    );
  });
}

test("allows external resources, data URLs and encoded local filenames", (t) => {
  const root = fixture(t, {
    "manager.js": 'import "./assets/file%20name.js";',
    "assets/file name.js": 'console.log("ok")',
    "assets/main.css": "body { background: url(data:image/svg+xml;base64,AAAA); }",
    "index.html": '<script src="./manager.js"></script><link href="https://example.com/style.css">',
  });
  assert.equal(checkStorybook(root), 8);
});

test("CLI resolves the default output from the script, independently of cwd", (t) => {
  const bundle = fixture(t);
  const root = mkdtempSync(join(tmpdir(), "groovenet-storybook-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scriptDir = join(root, "scripts");
  mkdirSync(scriptDir);
  // A copy has the same relative layout as the app, without a real generated bundle.
  const script = fileURLToPath(new URL("./check-storybook.mjs", import.meta.url));
  const copiedScript = join(scriptDir, "check-storybook.mjs");
  cpSync(script, copiedScript);
  symlinkSync(
    fileURLToPath(new URL("../node_modules/", import.meta.url)),
    join(root, "node_modules"),
  );
  mkdirSync(join(root, "public"));
  cpSync(bundle, join(root, "public/storybook"), { recursive: true });
  const result = execFileSync(process.execPath, [copiedScript], {
    cwd: tmpdir(),
    encoding: "utf8",
  });
  assert.match(result, /Storybook verified: 9 files/);
});

test("CLI accepts an explicit directory and fails for a broken bundle", (t) => {
  const script = fileURLToPath(new URL("./check-storybook.mjs", import.meta.url));
  assert.match(
    execFileSync(process.execPath, [script, fixture(t)], { encoding: "utf8" }),
    /verified: 9 files/,
  );
  const result = spawnSync(process.execPath, [script, fixture(t, { "iframe.html": null })], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
});

test("CLI default uses the real app output rather than the working directory", (t) => {
  const script = fileURLToPath(new URL("./check-storybook.mjs", import.meta.url));
  const directory = fileURLToPath(new URL("../public/storybook/", import.meta.url));
  const result = spawnSync(process.execPath, [script], { cwd: fixture(t), encoding: "utf8" });
  // A fresh checkout has no bundle; a local build may already exist. Either way
  // the CLI must inspect the app output, never this cwd's valid fixture bundle.
  assert.ok((result.stdout + result.stderr).includes(directory));
});
