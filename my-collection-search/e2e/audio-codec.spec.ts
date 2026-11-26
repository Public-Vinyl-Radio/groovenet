import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

test.skip(!process.env.RUN_E2E_TESTS, "Requires the running worktree stack and ffmpeg");

test("ALAC decode failure is visible and stops the player", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "groovenet-codec-"));
  try {
    const sample = join(dir, "sample.m4a");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=96000:duration=2",
      "-c:a",
      "alac",
      "-sample_fmt",
      "s32p",
      sample,
    ]);
    await page.route("**/api/audio?*", (route) =>
      route.fulfill({ contentType: "audio/mp4", body: readFileSync(sample) }),
    );
    await page.addInitScript(() =>
      localStorage.setItem(
        "mcs:player",
        JSON.stringify({
          playlist: [
            {
              track_id: "synthetic-alac",
              friend_id: 1,
              title: "Generated ALAC",
              artist: "Codec test",
              local_audio_url: "synthetic.m4a",
              audio_codec: "alac",
            },
          ],
          currentTrackIndex: 0,
          isPlaying: false,
          volume: 1,
          currentTime: 0,
        }),
      ),
    );
    await page.goto("/settings");
    await expect(page.getByTestId("floating-player").getByRole("alert")).toContainText(
      "This browser can't play ALAC",
    );
    await expect(
      page.getByTestId("floating-player").getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    expect(
      await page.locator("#playlist-audio").evaluate((el: HTMLAudioElement) => el.error?.code),
    ).toBe(4);
    expect(
      await page.locator("#playlist-audio").evaluate((el: HTMLAudioElement) => el.paused),
    ).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("converted FLAC 24/96 plays and File info identifies it", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "groovenet-flac-"));
  try {
    const alac = join(dir, "sample.m4a");
    const flac = join(dir, "sample.flac");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=96000:duration=10",
      "-c:a",
      "alac",
      "-sample_fmt",
      "s32p",
      alac,
    ]);
    execFileSync("ffmpeg", ["-v", "error", "-i", alac, "-c:a", "flac", flac]);
    await page.route("**/api/audio?*", (route) =>
      route.fulfill({ contentType: "audio/flac", body: readFileSync(flac) }),
    );
    await page.addInitScript(() =>
      localStorage.setItem(
        "mcs:player",
        JSON.stringify({
          playlist: [
            {
              track_id: "synthetic-flac",
              friend_id: 1,
              title: "Generated FLAC",
              artist: "Codec test",
              local_audio_url: "synthetic.flac",
              audio_codec: "flac",
              audio_lossless: true,
              audio_bit_depth: 24,
              audio_sample_rate: 96000,
            },
          ],
          currentTrackIndex: 0,
          isPlaying: false,
          volume: 1,
          currentTime: 0,
        }),
      ),
    );
    await page.goto("/settings");
    await page.addStyleTag({
      content: "nextjs-portal, .tsqd-parent-container { display: none !important; }",
    });
    const player = page.getByTestId("floating-player");
    await player.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() =>
        page.locator("#playlist-audio").evaluate((el: HTMLAudioElement) => el.currentTime),
      )
      .toBeGreaterThan(0);
    expect(
      await page.locator("#playlist-audio").evaluate((el: HTMLAudioElement) => el.error),
    ).toBeNull();
    // File info lives in the desktop bar and in phone Now playing.
    if (test.info().project.name === "mobile")
      await player.getByRole("button", { name: "Open now playing" }).click();
    await page.getByRole("button", { name: "File info: FLAC 24/96" }).click();
    await expect(page.getByText("FLAC", { exact: true })).toBeVisible();
    await expect(page.getByText("24 bit", { exact: true })).toBeVisible();
    await expect(page.getByText("96 kHz", { exact: true })).toBeVisible();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
