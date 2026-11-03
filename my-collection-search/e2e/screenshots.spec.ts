import { execFile } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
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
// Collection data is public; no privacy masks are applied. HIDE only removes
// developer controls and transient/live state for repeatable images.
test.skip(
  process.env.RUN_SCREENSHOTS !== "1",
  "Set RUN_SCREENSHOTS=1 (or run `just site-screenshots`) against a prod-seeded stack",
);

/** When the prod seed was taken. Move it with the seed, so the shots show recent activity. */
const CLOCK = new Date("2026-10-31T13:00:00-07:00");
const TIME_ZONE = "America/Los_Angeles";
/** The Spins page's month, from the seed. */
const SPINS_MONTH = "2026-10";
/** Now playing's queue: a playlist from the seed, playing its CURRENT-th track. */
const QUEUE_PLAYLIST_ID = 176;
/** The set sheet's playlist: "FLOW STATE", 59 tracks and 4h15m, every one with a library identifier. */
const SET_SHEET_PLAYLIST_ID = 175;
const SET_SHEET_ROWS = 10;
const QUEUE_LENGTH = 12;
const QUEUE_CURRENT = 3;
/** That track's length (Massive Attack, "(Exchange)", 4:11), and where it is paused. */
const QUEUE_SECONDS = 251;
const QUEUE_POSITION = 97;
const QUEUE_POSITION_LABEL = "1:37";

const OUT_DIR =
  process.env.SCREENSHOT_OUT ||
  fileURLToPath(new URL("../../site/src/assets/screenshots/", import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });
const ONLY = process.env.SCREENSHOT_ONLY;
const DEFAULT_PALETTE = "mono";
const PALETTE = process.env.SCREENSHOT_PALETTE || DEFAULT_PALETTE;
const MODE = process.env.SCREENSHOT_MODE as Mode | undefined;
const PALETTES = ["sleeve", "riso", "midnight", "mono"] as const;
if (!PALETTES.includes(PALETTE as (typeof PALETTES)[number])) {
  throw new Error(`Unknown screenshot palette: ${PALETTE}`);
}
if (MODE && MODE !== "light" && MODE !== "dark") {
  throw new Error(`Unknown screenshot mode: ${MODE} (use light or dark)`);
}
// Fixed entities from the prod seed; never choose the first search result.
const ALBUM_PATH = "/albums/5077187?friend_id=6";
const GENRE_PATH = "/genres/trip-hop";

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
function fileName(name: string, viewport: Viewport, mode: Mode, selectedPalette: string) {
  const palette = selectedPalette === DEFAULT_PALETTE ? "" : `-${selectedPalette}`;
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
  // System polls health and fetches remote storage metrics; it never becomes idle.
  if (new URL(page.url()).pathname !== "/system") await page.waitForLoadState("networkidle");
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

async function shoot(page: Page, file: string) {
  await settle(page);
  if (file.startsWith("system-phone")) {
    // Full-scroll reference artboard: put the fixed navigation at the end of the sheet.
    await page.addStyleTag({
      content: `body { position: relative; } [data-testid="mobile-tab-bar"] { width: 100%; } div:has(> [data-testid="mobile-tab-bar"]) { position: absolute !important; bottom: 0 !important; }`,
    });
  }
  await page.screenshot({
    path: path.join(OUT_DIR, file),
    animations: "disabled",
    caret: "hide",
    scale: "device",
    fullPage: file.startsWith("system-"),
  });
}

type Shot = {
  name: string;
  viewport: Viewport;
  mode: Mode;
  reference?: boolean;
  take: (page: Page) => Promise<void>;
  storage?: (request: APIRequestContext) => Promise<Record<string, string>>;
};

const shots: Shot[] = [
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
      await silentAudio(page);
      await page.goto("/");
      if (page.viewportSize()!.width >= 768) {
        await page
          .getByTestId("floating-player")
          .getByRole("button", { name: "Queue", exact: true })
          .click();
        await expect(page.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
        await expect(
          page.getByTestId("floating-player").getByText(QUEUE_POSITION_LABEL, { exact: true }),
        ).toBeVisible();
      } else {
        await page
          .getByTestId("floating-player")
          .getByRole("button", { name: "Open now playing" })
          .click();
        await expect(page.getByRole("button", { name: "Minimize player" })).toBeVisible();
        await expect(page.getByText(QUEUE_POSITION_LABEL, { exact: true })).toBeVisible();
      }
    },
  },
];

async function silentAudio(page: Page) {
  const wav = silentWav(QUEUE_SECONDS);
  await page.route("**/api/audio?*", (route) =>
    route.fulfill(rangeResponse(wav, route.request().headers().range)),
  );
}

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

// Reuse the marketing recipe for the player: the queue stays paused and no
// audio, enrichment, sorting or database content is changed by these captures.
const playerShot = shots.find((shot) => shot.name === "now-playing")!;
const homeShot = shots.find((shot) => shot.name === "home")!;
const genresShot = shots.find((shot) => shot.name === "genres")!;

async function album(page: Page) {
  await page.goto(ALBUM_PATH);
  await expect(
    page.getByRole("heading", { name: "Mezzanine", level: 1, exact: true }),
  ).toBeVisible();
}

async function playlist(page: Page) {
  await page.goto(`/playlists/${QUEUE_PLAYLIST_ID}`);
  await expect(page.getByRole("button", { name: "Playlist actions", exact: true })).toBeVisible();
  await expect(page.getByText("(Exchange)", { exact: true }).first()).toBeVisible();
}

const ENTRY_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

/** A synthetic music server; no OwnTone engine, worker or speaker is involved. */
function fakePlayer(id: string, name: string, status: "playing" | "stopped") {
  const playing = status === "playing";
  return {
    id,
    name,
    engine_id: "primary",
    availability_policy: "ask",
    revision: 3,
    assigned_output: null,
    state: {
      queue: playing
        ? [
            {
              id: ENTRY_IDS[0],
              track_id: "1",
              friend_id: 6,
              title: "(Exchange)",
              artist: "Massive Attack",
            },
            {
              id: ENTRY_IDS[1],
              track_id: "2",
              friend_id: 6,
              title: "Teardrop",
              artist: "Massive Attack",
            },
            {
              id: ENTRY_IDS[2],
              track_id: "3",
              friend_id: 6,
              title: "Glory Box",
              artist: "Portishead",
            },
          ]
        : [],
      current_entry_id: playing ? ENTRY_IDS[0] : null,
      status,
      position: playing ? 97 : 0,
      duration: playing ? QUEUE_SECONDS : null,
      volume: 40,
      desired_output: "speaker",
      checkpoint: false,
      error: null,
    },
  };
}

/** Unlocked, with one live and one idle server. Faked, so the stack needs no player config. */
async function fakePlayers(page: Page) {
  const players = [
    fakePlayer("lounge", "Lounge", "playing"),
    fakePlayer("study", "Study", "stopped"),
  ];
  // The picker's list arrives on the all-players event stream. An EventSource
  // that delivers one `players` event and then stays open keeps it from
  // reconnecting (and flashing "updates disconnected") under the shot.
  await page.addInitScript(
    ({ list, worker }) => {
      class FakeEventSource {
        listeners: Record<string, (event: { data: string }) => void> = {};
        onerror: (() => void) | null = null;
        constructor(readonly url: string) {
          if (url !== "/api/players/events") return;
          setTimeout(
            () =>
              this.listeners.players?.({
                data: JSON.stringify({
                  type: "players",
                  players: list,
                  worker_instance: worker,
                  sequence: 1,
                }),
              }),
            0,
          );
        }
        addEventListener(name: string, listener: (event: { data: string }) => void) {
          this.listeners[name] = listener;
        }
        close() {}
      }
      Object.assign(window, { EventSource: FakeEventSource });
    },
    { list: players, worker: "44444444-4444-4444-8444-444444444444" },
  );
  await page.route("**/api/players**", (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("browser/session")) return route.fulfill({ json: { authorized: true } });
    if (pathname === "/api/players") return route.fulfill({ json: { players } });
    return route.fulfill({ status: 404, json: { error: "Not faked" } });
  });
}

/** The Play on picker with the live Lounge server selected, from the player or the nav. */
async function playOn(page: Page) {
  await fakePlayers(page);
  await page.goto("/");
  const picker = page.getByRole("dialog", { name: "Choose where audio plays" });
  if (page.viewportSize()!.width >= 768) {
    await page
      .getByTestId("floating-player")
      .getByRole("button", { name: /^Play on:/ })
      .click();
  } else {
    await page
      .getByTestId("floating-player")
      .getByRole("button", { name: "Open now playing" })
      .click();
    await page
      .getByRole("dialog", { name: "NOW PLAYING" })
      .getByRole("button", { name: /^Play on:/ })
      .click();
  }
  await expect(picker).toBeVisible();
  await picker.getByText("Lounge", { exact: true }).click();
  await expect(picker.getByRole("radio", { name: /Lounge/ })).toBeChecked();
  await expect(picker.getByText("MUSIC SERVERS")).toBeVisible();
  // Let the sheet finish sliding in.
  await picker.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

const docs: Array<Omit<Shot, "mode">> = [
  {
    name: "play-on",
    viewport: "desktop",
    storage: playerShot.storage,
    take: async (page) => {
      await silentAudio(page);
      await playOn(page);
    },
  },
  {
    ...playerShot,
    name: "play-on",
    viewport: "phone",
    take: async (page) => {
      await silentAudio(page);
      await playOn(page);
    },
  },
  { ...homeShot, viewport: "phone" },
  { ...genresShot },
  { ...playerShot, viewport: "desktop" },
  {
    name: "tracks-rows",
    viewport: "desktop",
    storage: async () => ({ searchViewMode: "row" }),
    take: async (page) => {
      await page.goto("/tracks");
      await expect(page.getByRole("heading", { name: "Tracks", exact: true })).toBeVisible();
    },
  },
  {
    name: "tracks-grid",
    viewport: "desktop",
    storage: async () => ({ searchViewMode: "card" }),
    take: async (page) => {
      await page.goto("/tracks");
      await expect(page.getByRole("heading", { name: "Tracks", exact: true })).toBeVisible();
    },
  },
  {
    name: "tracks",
    viewport: "phone",
    take: async (page) => {
      await page.goto("/tracks");
      await expect(page.getByRole("heading", { name: "Tracks", exact: true })).toBeVisible();
    },
  },
  { name: "album", viewport: "desktop", take: album },
  { name: "playlist", viewport: "desktop", take: playlist },
  {
    name: "optimiser",
    viewport: "desktop",
    take: async (page) => {
      await playlist(page);
      await page.getByRole("button", { name: "Playlist actions", exact: true }).click();
      await expect(
        page.getByRole("menuitem", { name: "Genetic Order", exact: true }),
      ).toBeVisible();
      // Show the available ordering tools without running or saving a sort.
    },
  },
  {
    name: "enrichment",
    viewport: "desktop",
    take: async (page) => {
      await album(page);
      await page.getByRole("button", { name: "Album actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Enrich Album", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Enrich", exact: true })).toBeVisible();
      // Capture setup, without invoking external providers or saving metadata.
    },
  },
  {
    name: "genre",
    viewport: "desktop",
    take: async (page) => {
      await page.goto(GENRE_PATH);
      await expect(page.getByRole("heading", { name: "Trip Hop", exact: true })).toBeVisible();
    },
  },
  {
    name: "appearance",
    viewport: "desktop",
    take: async (page) => {
      await page.goto("/settings?section=appearance");
      await expect(page.getByRole("tab", { name: "Appearance", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    },
  },
];

// Reference captures only: service values come from the running stack. No backup actions.
shots.push(
  ...(["desktop", "phone"] as const).map((viewport) => ({
    name: "system",
    viewport,
    reference: true,
    mode: "light" as const,
    take: async (page: Page) => {
      await page.goto("/system");
      await expect(page.getByRole("heading", { name: "System", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "RUN BACKUP NOW" })).toBeVisible();
      await expect(page.getByText(/OF 7 SERVICES UP/)).toBeVisible();
      if (viewport === "desktop")
        await page.getByRole("button", { name: "Expand sidebar" }).click();
    },
  })),
);

const captures = [
  // Every page in Mono light and dark. Marketing names remain unchanged.
  ...[...shots, ...docs].flatMap((shot) =>
    (MODE ? [MODE] : (["light", "dark"] as const)).map((mode) => ({
      ...shot,
      mode,
      palette: PALETTE,
    })),
  ),
  // One Home hero per other palette for docs; explicit --palette selects only that palette.
  ...(process.env.SCREENSHOT_PALETTE
    ? []
    : PALETTES.filter((palette) => palette !== DEFAULT_PALETTE).map((palette) => ({
        ...homeShot,
        mode: MODE ?? "light",
        palette,
      }))),
];

const files = new Set<string>();
for (const shot of captures) {
  const file = fileName(shot.name, shot.viewport, shot.mode, shot.palette);
  if (files.has(file) || (ONLY ? shot.name !== ONLY : shot.reference)) continue;
  files.add(file);
  test(file, async ({ browser, baseURL, request }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(testInfo.project.name !== "desktop", "Each shot sets its own viewport");
    await putAppearance(request, { palette: shot.palette });
    const storage = shot.storage ? await shot.storage(request) : {};
    const page = await openPage(browser, baseURL, shot.viewport, shot.mode, storage);
    try {
      await shot.take(page);
      await shoot(page, file);
    } finally {
      await page.context().close();
    }
  });
}

// The set sheet (#939): the app's own PDF export, driven through its menu so it
// is the same code path the UI uses, then page 1 rasterised and cropped to the
// header and the first rows. The PDF is black on white in either theme, so one
// bordered image serves both.
const run = promisify(execFile);
test("set-sheet-pdf.png", async ({ browser, baseURL, request }, testInfo) => {
  test.skip(Boolean(ONLY), "Page filter excludes the PDF export");
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop", "Each shot sets its own viewport");
  await putAppearance(request, { palette: DEFAULT_PALETTE });
  const page = await openPage(browser, baseURL, "desktop", "light");
  try {
    await page.goto(`/playlists/${SET_SHEET_PLAYLIST_ID}`);
    await expect(page.getByRole("button", { name: "Playlist actions", exact: true })).toBeVisible();
    await settle(page);
    await page.getByRole("button", { name: "Playlist actions", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Export PDF", exact: true }).click();
    const pdf = testInfo.outputPath("set-sheet.pdf");
    await (await download).saveAs(pdf);

    // 288 dpi: 2x a 144 dpi screen. Page 1 only, as a PNG named <prefix>-1.png.
    const prefix = testInfo.outputPath("set-sheet");
    await run("pdftoppm", ["-r", "288", "-f", "1", "-l", "1", "-png", pdf, prefix]);
    const png = readdirSync(testInfo.outputDir).filter((f) => /^set-sheet-\d+\.png$/.test(f))[0]!;
    const raster = sharp(testInfo.outputPath(png));
    const { width, height } = await raster.metadata();
    // Landscape A4, 10 mm margins, 4 mm rows: the header block plus the column
    // header and SET_SHEET_ROWS rows end this far below the crop's 6 mm top.
    const px = (mm: number) => Math.round((mm / 25.4) * 288);
    const crop = {
      left: px(6),
      top: px(6),
      width: width! - px(12),
      height: Math.min(height! - px(6), px(12 + 6 + 4 * SET_SHEET_ROWS + 5)),
    };
    await raster
      .extract(crop)
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: "#888888" })
      .png()
      .toFile(path.join(OUT_DIR, "set-sheet-pdf.png"));
  } finally {
    await page.context().close();
  }
});
