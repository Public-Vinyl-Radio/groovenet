import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkStory,
  checkStorybookRender,
  run,
  serveStorybook,
  storyIds,
} from "./check-storybook-render.mjs";

function bundle(t, entries) {
  const root = mkdtempSync(join(tmpdir(), "groovenet-storybook-render-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.json"), JSON.stringify({ entries }));
  writeFileSync(join(root, "assets/app.js"), "export {};");
  writeFileSync(join(root, "assets/blob.bin"), "x");
  return root;
}

// A page whose body class and error text are set by the test.
function fakePage({ bodyClass = "sb-show-main", message = null, pageError, gotoError } = {}) {
  const listeners = new Set();
  return {
    listeners,
    on: (_event, listener) => listeners.add(listener),
    off: (_event, listener) => listeners.delete(listener),
    goto: async () => {
      if (gotoError) throw new Error(gotoError);
      if (pageError) for (const listener of listeners) listener(new Error(pageError));
    },
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    evaluate: async (fn) => {
      const classList = { contains: (name) => bodyClass.split(" ").includes(name) };
      const document = {
        body: { classList },
        querySelector: () => message && { textContent: message },
      };
      globalThis.document = document;
      try {
        return fn();
      } finally {
        delete globalThis.document;
      }
    },
  };
}

test("storyIds lists stories and skips docs entries", (t) => {
  const root = bundle(t, {
    a: { id: "a", type: "story" },
    b: { id: "b", type: "docs" },
    c: { id: "c", type: "story" },
  });
  assert.deepEqual(storyIds(root), ["a", "c"]);
});

test("storyIds tolerates an index without entries", (t) => {
  const root = bundle(t, undefined);
  assert.deepEqual(storyIds(root), []);
});

test("serveStorybook serves files under /storybook/ only", async (t) => {
  const root = bundle(t, {});
  const server = await serveStorybook(root);
  t.after(() => server.close());
  const js = await fetch(`${server.url}assets/app.js`);
  assert.equal(js.status, 200);
  assert.equal(js.headers.get("content-type"), "text/javascript");
  assert.equal(
    (await fetch(`${server.url}assets/blob.bin`)).headers.get("content-type"),
    "application/octet-stream",
  );
  assert.equal((await fetch(`${server.url}assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${server.url}assets`)).status, 404);
  const origin = new URL(server.url).origin;
  assert.equal((await fetch(`${origin}/assets/app.js`)).status, 404);
  assert.equal((await fetch(`${origin}/storybook/..%2Findex.json`)).status, 404);
});

test("checkStory passes a story that renders", async () => {
  assert.equal(await checkStory(fakePage(), "http://x/storybook/", "a"), null);
});

test("checkStory reports Storybook's error display", async () => {
  const page = fakePage({ bodyClass: "sb-show-errordisplay", message: "boom" });
  assert.equal(await checkStory(page, "http://x/storybook/", "a"), "boom");
});

test("checkStory falls back when the error display has no message", async () => {
  const page = fakePage({ bodyClass: "sb-show-errordisplay" });
  assert.equal(await checkStory(page, "http://x/storybook/", "a"), "story failed to render");
});

test("checkStory reports an uncaught page error and detaches its listener", async () => {
  const page = fakePage({ pageError: "late" });
  assert.equal(await checkStory(page, "http://x/storybook/", "a"), "late");
  assert.equal(page.listeners.size, 0);
});

test("checkStory reports a navigation failure", async () => {
  const page = fakePage({ gotoError: "net::ERR" });
  assert.equal(await checkStory(page, "http://x/storybook/", "a"), "net::ERR");
});

test("checkStorybookRender checks every story in light and dark", async (t) => {
  const root = bundle(t, { a: { id: "a", type: "story" }, b: { id: "b", type: "story" } });
  const schemes = [];
  let closed = false;
  const browser = {
    newContext: async ({ colorScheme }) => {
      schemes.push(colorScheme);
      return {
        newPage: async () =>
          fakePage(
            colorScheme === "dark"
              ? { bodyClass: "sb-show-errordisplay", message: "dark only" }
              : {},
          ),
        close: async () => {},
      };
    },
    close: async () => {
      closed = true;
    },
  };
  const result = await checkStorybookRender(root, { launch: async () => browser, concurrency: 1 });
  assert.deepEqual(schemes, ["light", "dark"]);
  assert.equal(result.stories, 2);
  assert.deepEqual(result.failures.sort(), ["a (dark): dark only", "b (dark): dark only"]);
  assert.ok(closed);
});

test("checkStorybookRender refuses an index with no stories", async (t) => {
  const root = bundle(t, {});
  await assert.rejects(
    checkStorybookRender(root, { launch: async () => assert.fail("launched") }),
    /no stories/,
  );
});

test("run exits non-zero and lists failures, zero when clean", async (t) => {
  const root = bundle(t, { a: { id: "a", type: "story" } });
  const launchWith = (options) => async () => ({
    newContext: async () => ({ newPage: async () => fakePage(options), close: async () => {} }),
    close: async () => {},
  });
  const lines = [];
  const log = { log: (m) => lines.push(m), error: (m) => lines.push(m) };
  assert.equal(await run(root, { launch: launchWith({}) }, log), 0);
  assert.match(lines.pop(), /verified: 1 stories in light and dark/);
  const broken = { bodyClass: "sb-show-errordisplay", message: "boom" };
  assert.equal(await run(root, { launch: launchWith(broken) }, log), 1);
  assert.match(
    lines.pop(),
    /2 Storybook render failure\(s\):\na \(dark\): boom\na \(light\): boom/,
  );
});
