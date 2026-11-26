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
