import { chromium, devices } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "mobile-screenshots");

const VIEWPORTS = [
  {
    name: "phone",
    context: {
      ...devices["iPhone 15 Pro"],
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
    },
  },
  {
    name: "tablet",
    context: {
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      userAgent: devices["iPad Pro 11"].userAgent,
    },
  },
  {
    name: "desktop-sm",
    context: {
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    },
  },
  {
    name: "desktop-lg",
    context: {
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    },
  },
];

const ROUTES: { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "albums", path: "/albums" },
  { name: "album-detail", path: "/albums/24882152?friend_id=6" },
  { name: "track-detail", path: "/tracks/24882152-B6?friend_id=6" },
  { name: "playlists", path: "/playlists" },
  { name: "playlist-detail", path: "/playlists/162" },
  { name: "spins", path: "/spins?friend_id=6" },
  { name: "settings", path: "/settings" },
  { name: "enrich", path: "/enrich" },
];

// Allow filtering via env: VIEWPORTS=phone,tablet or ROUTES=home,albums
const vpFilter = process.env.VIEWPORTS?.split(",");
const routeFilter = process.env.ROUTES?.split(",");

const activeViewports = vpFilter ? VIEWPORTS.filter((v) => vpFilter.includes(v.name)) : VIEWPORTS;

const activeRoutes = routeFilter ? ROUTES.filter((r) => routeFilter.includes(r.name)) : ROUTES;

async function main() {
  const browser = await chromium.launch();

  for (const vp of activeViewports) {
    const dir = path.join(OUT_DIR, vp.name);
    fs.mkdirSync(dir, { recursive: true });

    console.log(`\n── ${vp.name} (${vp.context.viewport.width}×${vp.context.viewport.height})`);
    const context = await browser.newContext(vp.context);
    const page = await context.newPage();

    for (const route of activeRoutes) {
      process.stdout.write(`   ${route.name}...`);
      try {
        await page.goto(`${BASE_URL}${route.path}`, {
          waitUntil: "load",
          timeout: 15000,
        });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(dir, `${route.name}.png`),
          fullPage: true,
        });
        console.log(" ✓");
      } catch (err) {
        console.log(` ⚠ ${err instanceof Error ? err.message : err}`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log(`\nScreenshots saved to: ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
