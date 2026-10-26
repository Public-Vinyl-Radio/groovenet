import { expect, test, type Page } from "@playwright/test";

// Floating player coverage (#484, behaviour from #469/#483).
//
// Determinism: no collection data, downloads or real audio are used.
//  - The queue is seeded through the player's own localStorage persistence
//    (`mcs:player`) with synthetic tracks, so the Postgres contents are
//    irrelevant; any page that mounts the player works.
//  - `/api/audio` is fulfilled with a generated 1s silent WAV and artwork URLs
//    with a generated PNG, so nothing depends on /audio or the network.
//  - Queue completion is the audio element's own `ended` event, dispatched by
//    the test, rather than waiting on real playback.
test.skip(
  !process.env.RUN_E2E_TESTS,
  "Set RUN_E2E_TESTS=1 (or run `just player-e2e`) against a running app"
);

const STORAGE_KEY = "mcs:player";
const PLAYER_PAGE = "/settings";
const LONG_TITLE =
  "An Extraordinarily Long Track Title That Would Wrap Across Several Lines If It Were Not Truncated To A Single Line";
const LONG_ARTIST =
  "A Very Long Artist Name Collaborating With Many Other Equally Verbosely Named Guest Artists On This Record";

type SeedTrack = {
  track_id: string;
  title: string;
  artist: string;
  art?: string;
};

function track(t: SeedTrack, n: number) {
  return {
    id: n,
    track_id: t.track_id,
    title: t.title,
    artist: t.artist,
    album: "E2E Album",
    year: 2024,
    duration: "1:00",
    position: "A1",
    discogs_url: "",
    apple_music_url: "",
    friend_id: 1,
    release_id: "1",
    local_audio_url: `${t.track_id}.wav`,
    audio_file_album_art_url: t.art ?? null,
  };
}

const TRACK_A: SeedTrack = {
  track_id: "e2e-a",
  title: "Alpha Track",
  artist: "Alpha Artist",
  art: "/e2e-artwork.png",
};
const TRACK_B: SeedTrack = {
  track_id: "e2e-b",
  title: "Bravo Track",
  artist: "Bravo Artist",
};
const TRACK_LONG: SeedTrack = {
  track_id: "e2e-long",
  title: LONG_TITLE,
  artist: LONG_ARTIST,
  art: "/e2e-artwork.png",
};

function silentWav(): Buffer {
  const rate = 8000;
  const samples = rate; // 1 second, 8-bit mono
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

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function openPlayer(
  page: Page,
  tracks: SeedTrack[],
  currentTrackIndex: number | null
) {
  await page.route("**/api/audio?*", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() })
  );
  await page.route("**/e2e-artwork.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 })
  );
  const state = {
    playlist: tracks.map(track),
    currentTrackIndex,
    isPlaying: false,
    volume: 1,
    currentTime: 0,
  };
  // Seed once per tab: the init script runs again on a reload, which must not
  // overwrite the state the player has saved since.
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(state)] as const
  );
  await page.goto(PLAYER_PAGE);
  // The dev stack's Next.js and TanStack devtools buttons sit over the bottom
  // corners, where the player's controls are; production has neither.
  await page.addStyleTag({
    content: "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  const player = page.getByTestId("floating-player");
  await expect(player).toBeVisible();
  return player;
}

async function endCurrentTrack(page: Page) {
  await page.evaluate(() =>
    document.getElementById("playlist-audio")?.dispatchEvent(new Event("ended"))
  );
}

test.describe("floating player", () => {
  test("shows artwork when a track has it", async ({ page }) => {
    const player = await openPlayer(page, [TRACK_A], 0);
    const img = player.getByRole("img", { name: "Alpha Artist - Alpha Track" });
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("shows the icon placeholder, not a broken image, without artwork", async ({
    page,
  }) => {
    const player = await openPlayer(page, [TRACK_B], 0);
    await expect(player.getByText("Bravo Track")).toBeVisible();
    await expect(player.locator("img")).toHaveCount(0);
    await expect(player.locator("svg").first()).toBeVisible();
  });

  test("falls back to the placeholder when artwork fails to load", async ({
    page,
  }) => {
    await page.route("**/e2e-broken.png", (route) => route.abort());
    const player = await openPlayer(
      page,
      [{ ...TRACK_A, art: "/e2e-broken.png" }],
      0
    );
    await expect(player.locator("img")).toHaveCount(0);
  });

  test("shows 'Queue finished' when the queue ends and Play restarts from the top", async ({
    page,
  }) => {
    const player = await openPlayer(page, [TRACK_A, TRACK_B], 1);
    await endCurrentTrack(page);

    await expect(player.getByText("Queue finished")).toBeVisible();
    await expect(player.getByText("No track playing")).toHaveCount(0);
    // The last-played track is still shown, with its icon placeholder.
    await expect(player.locator("img")).toHaveCount(0);

    await player.getByRole("button", { name: "Play", exact: true }).click();
    await expect(player.getByText("Queue finished")).toHaveCount(0);
    await expect(player.getByText("Alpha Track")).toBeVisible();
    await expect(player.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  });

  test("keeps long title and artist on a single line", async ({
    page,
  }, testInfo) => {
    const shortPage = await page.context().newPage();
    const short = await openPlayer(shortPage, [TRACK_A], 0);
    const shortHeight = (await short.boundingBox())!.height;

    const player = await openPlayer(page, [TRACK_LONG], 0);
    // The full player shows the text blocks at md+; the compact one at mobile.
    // The artist is a link inside the clamped <p>; measure the <p>.
    const clamped = (text: string) =>
      player.getByText(text, { exact: true }).locator("xpath=ancestor-or-self::p[1]");
    const title = clamped(LONG_TITLE);
    const artist = clamped(LONG_ARTIST);

    for (const el of [title, artist]) {
      await expect(el).toBeVisible();
      const m = await el.evaluate((node) => {
        const cs = getComputedStyle(node);
        return {
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          lineHeight: parseFloat(cs.lineHeight),
        };
      });
      // One line tall, with the overflow clipped rather than wrapped.
      expect(m.clientHeight).toBeLessThanOrEqual(Math.ceil(m.lineHeight));
      expect(m.scrollHeight).toBeGreaterThan(m.clientHeight);
    }

    if (testInfo.project.name === "desktop") {
      await expect(title).toHaveAttribute("title", LONG_TITLE);
    }
    expect((await player.boundingBox())!.height).toBeLessThanOrEqual(
      shortHeight + 1
    );
  });

  test("mobile: the mini player has no close button and every control is at least 44px", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mini player is mobile-only");
    const player = await openPlayer(page, [TRACK_A, TRACK_B], 0);
    await expect(player.getByRole("button", { name: "Close player" })).toHaveCount(0);
    for (const button of await player.getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("mobile: Now playing, the queue, and Clear with Undo", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Now playing is mobile-only");
    const player = await openPlayer(page, [TRACK_A, TRACK_B], 0);

    await player.getByRole("button", { name: "Open now playing" }).click();
    const sheet = page.getByRole("dialog", { name: "NOW PLAYING" });
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("floating-player")).toHaveCount(0);
    await expect(sheet.getByRole("group", { name: "Transport" })).toBeVisible();
    await expect(sheet.getByRole("slider", { name: "Seek" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Play on: This / })).toBeVisible();

    // Sliders take the keyboard.
    const volume = sheet.getByRole("slider", { name: "Volume" });
    await volume.focus();
    await page.keyboard.press("Home");
    await expect(volume).toHaveAttribute("aria-valuenow", "0");

    await sheet.getByRole("button", { name: "Open queue, 1 up next" }).click();
    const queue = page.getByRole("dialog", { name: "Queue" });
    await expect(queue.getByTestId("queue-now-playing")).toContainText("Alpha Track");
    await expect(queue.getByRole("button", { name: "Play Bravo Track by Bravo Artist" })).toBeVisible();
    for (const name of ["Back to now playing", "Save", "Clear queue", "Reorder Bravo Track", "Remove Bravo Track from queue"]) {
      const box = (await queue.getByRole("button", { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }

    // One tap, no dialog; Undo puts the queue back.
    await queue.getByRole("button", { name: "Clear queue" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByTestId("floating-player")).toHaveCount(0);
    await expect(page.getByText("Queue cleared")).toBeVisible();
    const toastBox = (await page.getByText("Queue cleared").boundingBox())!;
    expect(toastBox.x).toBeGreaterThanOrEqual(0);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Undo" }).click();
    const restored = page.getByTestId("floating-player");
    await expect(restored).toBeVisible();
    await expect(restored.getByText("Alpha Track")).toBeVisible();
  });

  test("desktop: docked bar and the 400px queue panel, which the content makes room for", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the queue panel is desktop-only");
    const player = await openPlayer(page, [TRACK_A, TRACK_B], 0);
    const viewport = page.viewportSize()!;
    const bar = (await player.boundingBox())!;
    expect(bar.x).toBe(0);
    expect(bar.width).toBe(viewport.width);
    expect(bar.y + bar.height).toBe(viewport.height);
    await expect(player.getByRole("group", { name: "Transport" })).toBeVisible();

    const toggle = player.getByRole("button", { name: "Queue", exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const panel = page.getByRole("complementary", { name: "Queue" });
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.width).toBe(400);
    expect(box.x + box.width).toBe(viewport.width);
    // The panel ends on the bar, which stays visible.
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
    await expect(player).toBeVisible();
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--queue-w").trim())
    ).toBe("400px");

    await panel.getByRole("button", { name: "Play Bravo Track by Bravo Artist" }).click();
    await expect(panel.getByTestId("queue-now-playing")).toContainText("Bravo Track");

    await panel.getByRole("button", { name: "Close queue" }).click();
    await expect(panel).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await page.getByRole("complementary", { name: "Queue" }).getByRole("button", { name: "Clear" }).click();
    await expect(page.getByTestId("floating-player")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("floating-player")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Queue" })).toHaveCount(0);
  });
});
