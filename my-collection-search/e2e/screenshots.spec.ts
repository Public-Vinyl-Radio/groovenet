import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

// The marketing site's product screenshots (#912), taken against a worktree
// stack restored from the prod seed. Run with `just site-screenshots`; the
// PNGs land in site/src/assets/screenshots/ and are committed.
//
// Stable images:
//  - The browser clock is fixed (CLOCK) and the time zone matches the app's
//    display zone, so relative dates ("added 3 days ago") don't move.
//  - Fixed entities: the Spins month, and the Now playing queue is a fixed
//    playlist's tracks loaded by id. Home and Genres are whole-collection pages.
//  - Fonts loaded, images decoded, reduced motion and `animations: "disabled"`.
//  - Hidden: the dev stack's Next.js and TanStack devtools, the Developer nav
//    link (dev-only), toasts, and Home's Now playing card (live state).
//
// Privacy (the prod seed is the real collection): none of these views shows
// another friend's username, notes, listener or source names, or settings.
// Re-check every PNG by eye after a refresh, and hide anything new here.
test.skip(
  !process.env.RUN_SCREENSHOTS,
  "Set RUN_SCREENSHOTS=1 (or run `just site-screenshots`) against a prod-seeded stack",
);

/** When the prod seed was taken. Move it with the seed, so the shots show recent activity. */
const CLOCK = new Date("2026-10-31T13:00:00-07:00");
const TIME_ZONE = "America/Los_Angeles";
/** The Spins page's month, from the seed. */
const SPINS_MONTH = "2026-10";
/** Now playing's queue: a playlist from the seed, playing its CURRENT-th track. */
const QUEUE_PLAYLIST_ID = 176;
const QUEUE_LENGTH = 12;
const QUEUE_CURRENT = 3;
/** That track's length (Massive Attack, "(Exchange)", 4:11), and where it is paused. */
const QUEUE_SECONDS = 251;
const QUEUE_POSITION = 97;
const QUEUE_POSITION_LABEL = "1:37";

const OUT_DIR = fileURLToPath(new URL("../../site/src/assets/screenshots/", import.meta.url));
const DEFAULT_PALETTE = "sleeve";
const PALETTE = process.env.SCREENSHOT_PALETTE || DEFAULT_PALETTE;
const MODE = process.env.SCREENSHOT_MODE as Mode | undefined;

type Mode = "light" | "dark";
type Viewport = "desktop" | "phone";

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  // An iPhone's user agent, so Now playing's "Play on" names the phone, not the host.
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
} as const;

const HIDE = [
  // Dev stack only; production has neither.
  "nextjs-portal",
  ".tsqd-parent-container",
  'a[href="/developer"]',
  // Transient or live.
  "[data-scope='toast']",
  "section[aria-labelledby='now-playing-heading']",
].join(", ");

type Appearance = Record<string, unknown>;

// The palette is app-wide, so the specs share it: one at a time.
test.describe.configure({ mode: "serial" });

let original: Appearance;

test.beforeAll(async ({ request }) => {
  const res = await request.get("/api/settings/appearance");
  expect(res.ok()).toBe(true);
  original = (await res.json()) as Appearance;
  await putAppearance(request, {
    palette: PALETTE,
    fonts: { display: "default", body: "default", label: "default" },
  });
});

test.afterAll(async ({ request }) => {
  if (original) await putAppearance(request, original);
});

async function putAppearance(request: APIRequestContext, body: Appearance) {
  const res = await request.put("/api/settings/appearance", { data: body });
  expect(res.ok(), await res.text()).toBe(true);
}

/** `<page>-<viewport>[-<palette>]-<mode>.png`; the palette only when it isn't the default. */
function fileName(name: string, viewport: Viewport, mode: Mode) {
  const palette = PALETTE === DEFAULT_PALETTE ? "" : `-${PALETTE}`;
  return `${name}-${viewport}${palette}-${mode}.png`;
}

async function openPage(
  browser: Browser,
  baseURL: string | undefined,
  viewport: Viewport,
  mode: Mode,
  storage: Record<string, string> = {},
) {
  const context = await browser.newContext({
    ...VIEWPORTS[viewport],
    baseURL,
    deviceScaleFactor: 2,
    colorScheme: mode,
    reducedMotion: "reduce",
    timezoneId: TIME_ZONE,
    locale: "en-US",
  });
  await context.addInitScript(
    (items) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
    },
    { theme: mode, ...storage },
  );
  const page = await context.newPage();
  await page.clock.setFixedTime(CLOCK);
  return page;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: `${HIDE} { display: none !important; }` });
  await page.evaluate(() => document.fonts.ready);
  // Covers can render after network idle (a store hydrating): wait until every
  // image has loaded and decoded, and no new one has appeared since the last look.
  let last = "";
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(async () => {
          const imgs = Array.from(document.images);
          await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
          const pending = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
          return `${imgs.length}:${pending.map((img) => img.currentSrc).join(",")}`;
        });
        const settled = state === last && state.endsWith(":");
        last = state;
        return settled ? "settled" : state;
      },
      { intervals: [250], timeout: 15_000 },
    )
    .toBe("settled");
}

async function shoot(page: Page, file: string, mask: Locator[] = []) {
  await settle(page);
  await page.screenshot({
    path: path.join(OUT_DIR, file),
    animations: "disabled",
    caret: "hide",
    scale: "device",
    mask,
  });
  await page.context().close();
}

const shots: Array<{
  name: string;
  viewport: Viewport;
  mode: Mode;
  take: (page: Page) => Promise<void>;
  storage?: (request: APIRequestContext) => Promise<Record<string, string>>;
}> = [
  {
    name: "home",
    viewport: "desktop",
    mode: "light",
    take: async (page) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    },
  },
  {
    name: "genres",
    viewport: "desktop",
    mode: "light",
    take: async (page) => {
      await page.goto("/genres");
      await expect(page.getByRole("heading", { name: "Genres" })).toBeVisible();
    },
  },
  {
    name: "spins",
    viewport: "phone",
    mode: "light",
    take: async (page) => {
      await page.goto(`/spins?month=${SPINS_MONTH}`);
      await expect(page.getByText("SESSION").first()).toBeVisible();
    },
  },
  {
    name: "spins",
    viewport: "phone",
    mode: "dark",
    take: async (page) => {
      await page.goto(`/spins?month=${SPINS_MONTH}`);
      await expect(page.getByText("SESSION").first()).toBeVisible();
    },
  },
  {
    name: "now-playing",
    viewport: "phone",
    mode: "dark",
    storage: async (request) => ({ "mcs:player": JSON.stringify(await queue(request)) }),
    take: async (page) => {
      // The seed has no audio: serve silence as long as the track, so the
      // player shows its real length and the restored position.
      const wav = silentWav(QUEUE_SECONDS);
      await page.route("**/api/audio?*", (route) =>
        route.fulfill(rangeResponse(wav, route.request().headers().range)),
      );
      await page.goto("/");
      await page
        .getByTestId("floating-player")
        .getByRole("button", { name: "Open now playing" })
        .click();
      await expect(page.getByRole("button", { name: "Minimize player" })).toBeVisible();
      await expect(page.getByText(`${QUEUE_POSITION_LABEL}`, { exact: true })).toBeVisible();
    },
  },
];

/** `seconds` of 8 kHz, 8-bit mono silence. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples, 0x80);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples, 40);
  return buf;
}

/** A 206 for `range` (`bytes=a-b`), which the browser needs before it will seek. */
function rangeResponse(body: Buffer, range: string | undefined): Parameters<Route["fulfill"]>[0] {
  const match = range?.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return { status: 200, contentType: "audio/wav", body, headers: { "accept-ranges": "bytes" } };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : body.length - 1;
  return {
    status: 206,
    contentType: "audio/wav",
    body: body.subarray(start, end + 1),
    headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${body.length}` },
  };
}

/** The player's persisted state (`mcs:player`): QUEUE_PLAYLIST_ID's tracks, paused. */
async function queue(request: APIRequestContext) {
  const refs = await request.get(`/api/playlists/${QUEUE_PLAYLIST_ID}/tracks`);
  const { tracks } = (await refs.json()) as { tracks: Array<{ track_id: string }> };
  const res = await request.post("/api/tracks/batch", {
    data: { tracks: tracks.slice(0, QUEUE_LENGTH) },
  });
  const playlist = (await res.json()) as unknown[];
  expect(playlist).toHaveLength(QUEUE_LENGTH);
  return {
    playlist,
    currentTrackIndex: QUEUE_CURRENT,
    isPlaying: false,
    volume: 1,
    currentTime: QUEUE_POSITION,
  };
}

const files = new Set<string>();
for (const shot of shots) {
  const mode = MODE ?? shot.mode;
  const file = fileName(shot.name, shot.viewport, mode);
  // --mode turns a shot's light and dark variants into the same file: take it once.
  if (files.has(file)) continue;
  files.add(file);
  test(file, async ({ browser, baseURL, request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Each shot sets its own viewport");
    const storage = shot.storage ? await shot.storage(request) : {};
    const page = await openPage(browser, baseURL, shot.viewport, mode, storage);
    await shot.take(page);
    await shoot(page, file);
  });
}
