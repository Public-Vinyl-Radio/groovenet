import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.skip(!process.env.RUN_E2E_TESTS, "Run against a seeded worktree stack");

// Run both configured viewports; captures are opt-in review artifacts for #1141.
test("page scopes preserve track filters and expose track actions", async ({
  page,
  request,
}, info) => {
  const response = await request.get("/api/tracks/search?limit=100");
  expect(response.ok()).toBe(true);
  const { hits } = await response.json();
  expect(hits.length).toBeGreaterThan(0);
  const track = hits.find((hit: { local_audio_url?: string }) => hit.local_audio_url) ?? hits[0];
  const screenshot = async (name: string) => {
    if (!process.env.PALETTE_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.PALETTE_SCREENSHOT_DIR);
    mkdirSync(dir, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(dir, `${name}-${info.project.name}.png`),
      animations: "disabled",
    });
  };
  await page.goto("/tracks?mode=semantic&bpm_min=120&missingAudio=1");
  await page.getByRole("heading", { name: "Tracks", exact: true }).waitFor();
  await page.addStyleTag({
    content: "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await expect(dialog.getByText("Tracks ›", { exact: true })).toBeVisible();
  await dialog.getByRole("combobox").fill("warm percussion");
  await expect(dialog.getByRole("option").first()).toHaveText(
    'Search Tracks for "warm percussion"',
  );
  await screenshot("tracks-scope");
  await dialog.getByRole("combobox").press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/q=warm\+percussion/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("mode")).toBe("semantic");
  expect(params.get("bpm_min")).toBe("120");
  expect(params.get("missingAudio")).toBe("1");

  await page.goto(`/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.addStyleTag({
    content: "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  await page.keyboard.press("Control+k");
  await expect(dialog.getByText("Track ›", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: "Add to playlist", exact: true })).toBeVisible();
  await screenshot("track-actions");
  await dialog.getByRole("combobox").press("Escape");
  await expect(dialog).not.toBeVisible();
});
