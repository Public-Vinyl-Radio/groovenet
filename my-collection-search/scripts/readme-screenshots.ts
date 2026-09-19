import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const host = process.env.GROOVENET_URL;

if (!host) {
  throw new Error("GROOVENET_URL is required (for example, https://groovenet.example.com).");
}

let baseUrl: URL;
try {
  baseUrl = new URL(host);
} catch {
  throw new Error("GROOVENET_URL must be a valid absolute URL.");
}

if (!["http:", "https:"].includes(baseUrl.protocol)) {
  throw new Error("GROOVENET_URL must use http or https.");
}

const outputDir = path.resolve(
  process.env.SCREENSHOT_OUTPUT_DIR ?? path.join(process.cwd(), "docs", "screenshots"),
);
const storageState = process.env.SCREENSHOT_STORAGE_STATE;

function parseDimension(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.round(parsed);
}

const viewportWidth = parseDimension(process.env.SCREENSHOT_WIDTH, 1280, "SCREENSHOT_WIDTH");
const viewportHeight = parseDimension(process.env.SCREENSHOT_HEIGHT, 960, "SCREENSHOT_HEIGHT");

const routes = [
  { name: "collection", path: "/" },
  { name: "albums", path: "/albums" },
  { name: "playlists", path: "/playlists" },
  { name: "spins", path: "/spins" },
  { name: "settings", path: "/settings" },
  { name: "enrich", path: "/enrich" },
] as const;

const requestedRoutes = process.env.SCREENSHOT_ROUTES?.split(",").map((name) => name.trim()).filter(Boolean);
const activeRoutes = requestedRoutes
  ? routes.filter((route) => requestedRoutes.includes(route.name))
  : routes;
const unknownRoutes = requestedRoutes?.filter((name) => !routes.some((route) => route.name === name)) ?? [];

if (unknownRoutes.length > 0) {
  throw new Error(`Unknown SCREENSHOT_ROUTES value(s): ${unknownRoutes.join(", ")}.`);
}

if (activeRoutes.length === 0) {
  throw new Error("SCREENSHOT_ROUTES did not select any pages.");
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: 1,
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();
  const failures: string[] = [];

  try {
    for (const route of activeRoutes) {
      const target = new URL(route.path, baseUrl).toString();
      process.stdout.write(`Capturing ${route.name}... `);

      try {
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(750);
        await page.screenshot({
          path: path.join(outputDir, `${route.name}.png`),
          clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
        });
        console.log("done");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${route.name}: ${message}`);
        console.log("failed");
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (failures.length > 0) {
    throw new Error(`Could not capture all screenshots:\n${failures.join("\n")}`);
  }

  console.log(`Screenshots saved to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
