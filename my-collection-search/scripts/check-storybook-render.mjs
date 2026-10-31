import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// check-storybook.mjs proves the bundle is well formed; it cannot tell that a
// story throws when it renders (#681). This loads every story's iframe in a
// real browser and fails on Storybook's error display or an uncaught page
// error. It needs Chromium, so it runs from `just check-storybook-render` and
// CI rather than inside the image build.

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const mountPath = "/storybook/";
const colorSchemes = ["light", "dark"];
const settleMs = 100;

// Serve the built output under /storybook/, as the app does.
export async function serveStorybook(directory) {
  const root = resolve(directory);
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, "http://localhost");
    const file = normalize(join(root, decodeURIComponent(pathname.slice(mountPath.length))));
    const inside = pathname.startsWith(mountPath) && file.startsWith(root + sep);
    if (!inside || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${server.address().port}${mountPath}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

export function storyIds(directory) {
  const index = JSON.parse(readFileSync(resolve(directory, "index.json"), "utf8"));
  return Object.values(index.entries ?? {})
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);
}

// Resolves to a failure message, or null when the story rendered cleanly.
export async function checkStory(page, baseUrl, id) {
  const pageErrors = [];
  const onError = (error) => pageErrors.push(error.message);
  page.on("pageerror", onError);
  try {
    await page.goto(`${baseUrl}iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
    await page.waitForFunction(
      () => /\bsb-show-(main|errordisplay)\b/.test(document.body.className),
      undefined,
      { timeout: 30_000 },
    );
    // An error thrown just after first paint still counts.
    await page.waitForTimeout(settleMs);
    const display = await page.evaluate(() =>
      document.body.classList.contains("sb-show-errordisplay")
        ? (document.querySelector("#error-message")?.textContent ?? "story failed to render")
        : null,
    );
    return display ?? pageErrors[0] ?? null;
  } catch (error) {
    return pageErrors[0] ?? error.message;
  } finally {
    page.off("pageerror", onError);
  }
}

// Returns the failures as "<id> (<scheme>): <message>" lines.
export async function checkStorybookRender(directory, { launch, concurrency = 4 }) {
  const ids = storyIds(directory);
  if (!ids.length) throw new Error("Storybook index contains no stories");
  const server = await serveStorybook(directory);
  const browser = await launch();
  const failures = [];
  try {
    for (const colorScheme of colorSchemes) {
      const context = await browser.newContext({ colorScheme });
      const queue = [...ids];
      const worker = async () => {
        const page = await context.newPage();
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          const failure = await checkStory(page, server.url, id);
          if (failure) failures.push(`${id} (${colorScheme}): ${failure}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return { stories: ids.length, failures };
}

// Prints the outcome and returns the process exit code.
export async function run(directory, options, log = console) {
  const { stories, failures } = await checkStorybookRender(directory, options);
  if (failures.length) {
    log.error(`${failures.length} Storybook render failure(s):\n${failures.sort().join("\n")}`);
    return 1;
  }
  log.log(`Storybook render verified: ${stories} stories in ${colorSchemes.join(" and ")}`);
  return 0;
}

if (import.meta.main) {
  const { chromium } = await import("@playwright/test");
  const directory =
    process.argv[2] ?? fileURLToPath(new URL("../public/storybook/", import.meta.url));
  process.exitCode = await run(directory, { launch: () => chromium.launch() });
}
