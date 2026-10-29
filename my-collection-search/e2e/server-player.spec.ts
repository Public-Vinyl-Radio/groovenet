import { expect, test, type Page } from "@playwright/test";
import { player, device, workerA, workerB } from "../src/test/serverPlayerFixtures";
import type { ServerPlayerCommandInput } from "@groovenet/contracts";

// Server players in the main player (#793), against synthetic players: every
// /api/players request and the event stream are fixtures, so no worker,
// engine or speaker is involved and nothing is audible.
test.skip(
  !process.env.RUN_E2E_TESTS,
  "Run against the isolated Docker/worktree app with RUN_E2E_TESTS=1",
);

const LOCAL_KEY = "mcs:player";
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/test-results/server-${name}-${test.info().project.name}.png` });

function localTrack(id: string, n: number) {
  return {
    id: n,
    track_id: id,
    title: `Local ${id}`,
    artist: "Local artist",
    album: "E2E",
    year: 2024,
    duration: "1:00",
    position: "A1",
    discogs_url: "",
    apple_music_url: "",
    friend_id: 1,
    release_id: "1",
    local_audio_url: `${id}.wav`,
  };
}

/** Seeds this browser's own queue (two upcoming tracks after one played) through the player's persistence. */
async function seedLocalQueue(page: Page, ids = ["played", "now", "next"]) {
  const state = {
    playlist: ids.map(localTrack),
    currentTrackIndex: ids.length > 1 ? 1 : 0,
    isPlaying: false,
    volume: 1,
    currentTime: 0,
  };
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem(key, value);
    },
    [LOCAL_KEY, JSON.stringify(state)] as const,
  );
}

async function fixture(page: Page, { unlock = true, local = true } = {}) {
  const lounge = player();
  lounge.state.status = "playing";
  const aswitch = player("aswitch");
  aswitch.state.status = "stopped";
  aswitch.state.current_entry_id = null;
  aswitch.state.queue = [];
  aswitch.assigned_output = "speaker";
  const players = { lounge, aswitch };
  const commands: Array<{ id: string; command: ServerPlayerCommandInput }> = [];
  let authorized = false;
  await page.context().addInitScript(
    ({ initial, worker }) => {
      const sources: Array<{
        url: string;
        closed: boolean;
        listeners: Record<string, (event: { data: string }) => void>;
        onerror: (() => void) | null;
      }> = [];
      const state = { players: initial, worker, sources, sequence: 1 };
      Object.assign(window, { __serverPlayerFixture: state });
      class FixtureEventSource {
        url: string;
        closed = false;
        listeners: Record<string, (event: { data: string }) => void> = {};
        onerror: (() => void) | null = null;
        constructor(url: string) {
          this.url = url;
          sources.push(this);
          const id = url.split("/")[3] as keyof typeof initial;
          setTimeout(() => {
            if (!this.closed)
              this.listeners.snapshot?.({
                data: JSON.stringify({
                  type: "snapshot",
                  player: state.players[id],
                  worker_instance: state.worker,
                  sequence: ++state.sequence,
                }),
              });
          }, 0);
        }
        addEventListener(name: string, listener: (event: { data: string }) => void) {
          this.listeners[name] = listener;
        }
        close() {
          this.closed = true;
        }
      }
      Object.assign(window, { EventSource: FixtureEventSource });
    },
    { initial: players, worker: workerA },
  );
  await page.context().route("**/api/players**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path.endsWith("browser/session")) {
      if (request.method() === "POST") {
        expect(request.postDataJSON()).toEqual({ passphrase: "fixture-web-passphrase" });
        authorized = true;
      } else if (request.method() === "DELETE") authorized = false;
      return json({ authorized });
    }
    if (!authorized) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    if (path === "/api/players") return json({ players: Object.values(players) });
    const id = path.split("/")[3] as keyof typeof players;
    const p = players[id];
    const publish = async () => {
      await Promise.all(
        page
          .context()
          .pages()
          .map(async (client) => {
            await client
              .evaluate(
                ({ playerId, current }) => {
                  const state = (
                    window as unknown as {
                      __serverPlayerFixture?: {
                        players: Record<string, typeof current>;
                        worker: string;
                        sequence: number;
                        sources: Array<{
                          url: string;
                          closed: boolean;
                          listeners: Record<string, (event: { data: string }) => void>;
                        }>;
                      };
                    }
                  ).__serverPlayerFixture;
                  if (!state) return;
                  state.players[playerId] = current;
                  for (const source of state.sources) {
                    if (source.closed || !source.url.includes(`/players/${playerId}/events`))
                      continue;
                    source.listeners.snapshot?.({
                      data: JSON.stringify({
                        type: "snapshot",
                        player: current,
                        worker_instance: state.worker,
                        sequence: ++state.sequence,
                      }),
                    });
                  }
                },
                { playerId: id, current: structuredClone(p) },
              )
              .catch(() => {});
          }),
      );
    };
    if (path.endsWith("devices"))
      return json({
        devices: [
          { ...device, assigned_player_id: players.aswitch.assigned_output ? "aswitch" : null },
        ],
      });
    if (path.endsWith("commands")) {
      const command = request.postDataJSON() as ServerPlayerCommandInput;
      commands.push({ id, command });
      if ((command.type === "play" || command.type === "resume") && !command.allow_unknown)
        return json({ error: "Activity unknown", code: "AVAILABILITY_UNKNOWN" }, 409);
      switch (command.type) {
        case "queue.add":
          p.state.queue.splice(
            command.at ?? p.state.queue.length,
            0,
            ...command.tracks.map((track) => ({
              ...track,
              id: crypto.randomUUID(),
              title: `Server ${track.track_id}`,
              artist: "Fixture artist",
            })),
          );
          break;
        case "play":
          p.state.current_entry_id = command.entry_id ?? p.state.current_entry_id;
          p.state.status = "playing";
          break;
        case "resume":
          p.state.status = "playing";
          break;
        case "pause":
          p.state.status = "paused";
          break;
        case "seek":
          p.state.position = command.seconds;
          break;
        case "volume":
          p.state.volume = command.volume;
          break;
        case "queue.remove":
          p.state.queue = p.state.queue.filter((entry) => entry.id !== command.entry_id);
          break;
        case "queue.move": {
          const from = p.state.queue.findIndex((entry) => entry.id === command.entry_id);
          const [entry] = p.state.queue.splice(from, 1);
          p.state.queue.splice(command.to, 0, entry!);
          break;
        }
        case "queue.clear":
          p.state.queue = [];
          p.state.current_entry_id = null;
          p.state.position = 0;
          p.state.duration = null;
          p.state.status = "stopped";
          break;
        case "queue.replace": {
          p.state.queue = command.entries.map((entry) => ({
            ...entry,
            id: entry.id ?? crypto.randomUUID(),
            title: entry.track_id,
            artist: "Fixture artist",
          }));
          p.state.current_entry_id = command.current_entry_id ?? null;
          p.state.position = command.position ?? 0;
          p.state.status = command.play ? "playing" : "stopped";
          p.state.checkpoint = !command.play && p.state.current_entry_id !== null;
          break;
        }
        case "output.transfer": {
          expect(command.from_revision).toBe(players.aswitch.revision);
          players.aswitch.assigned_output = null;
          players.aswitch.revision++;
          p.state.desired_output = command.output_id;
          p.revision++;
          return json({
            player: p,
            transfer: {
              from_player: players.aswitch,
              detached: true,
              attached: false,
              error: { code: "TEST_ENGINE_FAILURE", message: "Fixture destination failed" },
            },
          });
        }
      }
      p.revision++;
      await publish();
      return json({ player: p });
    }
    return json(p);
  });
  if (local) await seedLocalQueue(page);
  await page.goto("/settings");
  // The dev stack's Next.js and TanStack devtools buttons sit over the player's corners.
  await page.addStyleTag({
    content: "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  if (unlock) {
    const picker = await openPicker(page);
    await picker.getByLabel("Household web passphrase").fill("fixture-web-passphrase");
    await picker.getByRole("button", { name: "Unlock music servers" }).click();
    await expect(picker.getByRole("radio", { name: /Lounge/ })).toBeAttached();
    await page.keyboard.press("Escape");
    await closeSheet(page);
  }
  return { players, commands };
}

/** The picker, from the player when it's showing, else from the nav. */
async function openPicker(page: Page) {
  const picker = page.getByRole("dialog", { name: "Choose where audio plays" });
  // A picker that just confirmed is still animating out.
  await expect(picker).toBeHidden();
  const bar = page.getByTestId("floating-player");
  if (await bar.isVisible()) {
    if (isMobile(page)) {
      await bar.getByRole("button", { name: "Open now playing" }).click();
      await page
        .getByRole("dialog", { name: "NOW PLAYING" })
        .getByRole("button", { name: /^Play on:/ })
        .click();
    } else await bar.getByRole("button", { name: /^Play on:/ }).click();
  } else if (isMobile(page)) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page
      .getByText(/^Playback:/)
      .first()
      .click();
  } else await page.getByRole("button", { name: /^Playback:/ }).click();
  await expect(picker).toBeVisible();
  await picker.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  return picker;
}

async function closeSheet(page: Page) {
  const sheet = page.getByRole("dialog", { name: "NOW PLAYING" });
  await expect(page.getByRole("dialog", { name: "Choose where audio plays" })).toBeHidden();
  if (await sheet.isVisible()) await sheet.getByRole("button", { name: "Minimize player" }).click();
  await expect(sheet).toBeHidden();
}

async function openQueue(page: Page) {
  if (isMobile(page)) {
    const sheet = page.getByRole("dialog", { name: "NOW PLAYING" });
    if (!(await sheet.isVisible()))
      await page
        .getByTestId("floating-player")
        .getByRole("button", { name: "Open now playing" })
        .click();
    await sheet.getByRole("button", { name: /^Open queue/ }).click();
    return page.getByRole("dialog", { name: "Queue" });
  }
  await page.getByTestId("floating-player").getByRole("button", { name: "Queue" }).click();
  return page.getByTestId("queue-panel");
}

for (const scheme of ["light", "dark"] as const) {
  test(`picker: locked, then live and idle servers with previews (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const f = await fixture(page, { unlock: false });
    const picker = await openPicker(page);
    await expect(picker.getByLabel("Household web passphrase")).toBeVisible();
    await expect(picker.getByRole("radio", { name: /This / })).toBeChecked();
    await shot(page, `picker-locked-${scheme}`);
    await picker.getByLabel("Household web passphrase").fill("fixture-web-passphrase");
    await picker.getByRole("button", { name: "Unlock music servers" }).click();
    await expect(picker.getByText("LIVE", { exact: true })).toBeVisible();
    await expect(picker.getByText("IDLE", { exact: true })).toBeVisible();
    await expect(
      picker.getByText("Playing here never stops a server. It keeps playing its queue."),
    ).toBeVisible();

    await picker.getByText("Lounge", { exact: true }).click();
    const live = picker.getByRole("region", { name: "Active session on the server" });
    await expect(live.getByText("ACTIVE SESSION · LOUNGE")).toBeVisible();
    await expect(live.getByText("1 up next")).toBeVisible();
    await expect(live.getByText("Your queue (2 tracks) joins the end of this one.")).toBeVisible();
    await expect(picker.getByRole("button", { name: "Join Lounge" })).toBeVisible();
    await shot(page, `picker-live-${scheme}`);

    await picker.getByText("Aswitch", { exact: true }).click();
    await expect(picker.getByRole("region", { name: "Idle server" })).toContainText(
      "Nothing playing on Aswitch. Joining starts a new session with your queue (2 tracks).",
    );
    await shot(page, `picker-idle-${scheme}`);
    // Choosing, closing and Escape send nothing.
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    expect(f.commands).toHaveLength(0);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`joining a live server appends the upcoming local tracks, never plays, and clears the local queue (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const f = await fixture(page);
    const picker = await openPicker(page);
    await picker.getByText("Lounge", { exact: true }).click();
    await picker.getByRole("button", { name: "Join Lounge" }).click();
    await expect.poll(() => f.commands.length).toBe(1);
    expect(f.commands[0]).toEqual({
      id: "lounge",
      command: {
        type: "queue.add",
        tracks: [
          { track_id: "now", friend_id: 1 },
          { track_id: "next", friend_id: 1 },
        ],
      },
    });
    await closeSheet(page);
    const bar = page.getByTestId("floating-player");
    if (isMobile(page)) await expect(bar.getByTestId("output-tag")).toHaveText("ON LOUNGE");
    else await expect(bar.getByRole("button", { name: "Play on: Lounge" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "{}").playlist?.length ?? 0,
          LOCAL_KEY,
        ),
      )
      .toBe(0);
    await shot(page, `mini-player-${scheme}`);

    const queue = await openQueue(page);
    const session = queue.getByRole("region", { name: "Server session" });
    await expect(session).toContainText("SERVER SESSION");
    await expect(session).toContainText("Lounge · shared queue");
    await expect(
      queue.getByRole("button", { name: "Play Server now by Fixture artist" }),
    ).toBeVisible();
    await shot(page, `queue-${scheme}`);
    if (isMobile(page)) {
      await queue.getByRole("button", { name: "Back to now playing" }).click();
      const sheet = page.getByRole("dialog", { name: "NOW PLAYING" });
      await expect(sheet.getByText("SERVER VOL")).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Play on: Lounge" })).toBeVisible();
      await shot(page, `now-playing-${scheme}`);
    } else {
      await page.getByTestId("queue-panel").getByRole("button", { name: "Close queue" }).click();
      await shot(page, `desktop-bar-${scheme}`);
    }
    expect(f.commands).toHaveLength(1);
  });
}

test("joining an idle server plays the first appended entry after an inline speaker confirm", async ({
  page,
}) => {
  const f = await fixture(page);
  const picker = await openPicker(page);
  await picker.getByText("Aswitch", { exact: true }).click();
  await picker.getByRole("button", { name: "Join Aswitch" }).click();
  await expect
    .poll(() => f.commands.map(({ command }) => command.type))
    .toEqual(["queue.add", "play"]);
  const added = f.players.aswitch.state.queue[0]!;
  expect(f.commands[1]!.command).toEqual({ type: "play", entry_id: added.id });
  await closeSheet(page);
  const notice = page.getByRole("alertdialog", { name: "Confirm playback" });
  await expect(notice).toContainText("Speaker status unknown");
  await shot(page, "speaker-confirm");
  expect(f.commands).toHaveLength(2);
  await notice.getByRole("button", { name: "Play anyway" }).click();
  await expect.poll(() => f.commands.length).toBe(3);
  expect(f.commands[2]!.command).toEqual({ type: "play", entry_id: added.id, allow_unknown: true });
  await expect(notice).toBeHidden();
});

test("joining with an empty local queue just switches; Play here sends the server nothing", async ({
  page,
}) => {
  const f = await fixture(page, { local: false });
  let picker = await openPicker(page);
  await picker.getByText("Lounge", { exact: true }).click();
  await expect(picker.getByText("Join to control its queue from here.")).toBeVisible();
  await picker.getByRole("button", { name: "Join Lounge" }).click();
  await expect(page.getByTestId("floating-player")).toBeVisible();
  const queue = await openQueue(page);
  await queue
    .getByRole("region", { name: "Server session" })
    .getByRole("button", { name: "Play here" })
    .click();
  await expect(page.getByTestId("floating-player")).toBeHidden();
  picker = await openPicker(page);
  await expect(picker.getByRole("radio", { name: /This / })).toBeChecked();
  await page.keyboard.press("Escape");
  // Reloading, navigating and losing the stream leave the server alone too.
  await page.reload();
  await page.goto("/settings/appearance");
  expect(f.commands).toHaveLength(0);
  expect(f.players.lounge.state.status).toBe("playing");
});

test("two devices on one server share its queue and status, without conflict prompts", async ({
  page,
}) => {
  const f = await fixture(page, { local: false });
  let picker = await openPicker(page);
  await picker.getByText("Lounge", { exact: true }).click();
  await picker.getByRole("button", { name: "Join Lounge" }).click();
  const second = await page.context().newPage();
  await second.goto("/settings");
  await second.addStyleTag({
    content: "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  // The same browser profile remembers Lounge: a second tab comes back to it on its own.
  picker = await openPicker(second);
  await expect(picker.getByRole("radio", { name: /Lounge/ })).toBeChecked();
  await picker.getByRole("button", { name: "Done" }).click();
  await closeSheet(second);

  const bar = page.getByTestId("floating-player");
  const otherBar = second.getByTestId("floating-player");
  await bar.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(otherBar.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const queue = await openQueue(second);
  await queue
    .getByRole("button", { name: /^Remove Track from queue/ })
    .first()
    .click();
  await expect(queue.getByRole("button", { name: /^Remove Track from queue/ })).toHaveCount(0);
  expect(f.commands.map(({ command }) => command.type)).toEqual(["pause", "queue.remove"]);
  expect(f.commands.every(({ command }) => command.expected_revision === undefined)).toBe(true);
  await expect(page.getByText(/revision conflict/i)).toHaveCount(0);
  await second.close();
});

test("clearing a server queue offers Undo with identical entries and saved position", async ({
  page,
}) => {
  const f = await fixture(page, { local: false });
  const picker = await openPicker(page);
  await picker.getByText("Lounge", { exact: true }).click();
  await picker.getByRole("button", { name: "Join Lounge" }).click();
  const before = structuredClone(f.players.lounge.state);
  const queue = await openQueue(page);
  await queue.getByRole("button", { name: isMobile(page) ? "Clear queue" : "Clear" }).click();
  await expect(queue.getByText("Queue is empty")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(queue.getByTestId("queue-now-playing")).toBeVisible();
  expect(f.commands.map((item) => item.command.type)).toEqual(["queue.clear", "queue.replace"]);
  expect(f.commands[1]!.command).toMatchObject({
    entries: before.queue.map(({ id, track_id, friend_id }) => ({ id, track_id, friend_id })),
    current_entry_id: before.current_entry_id,
    position: before.position,
    play: true,
  });
});

test("speaker details: a reviewed transfer exposes partial attachment", async ({ page }) => {
  const f = await fixture(page, { local: false });
  let picker = await openPicker(page);
  await picker.getByText("Lounge", { exact: true }).click();
  await picker.getByRole("button", { name: "Join Lounge" }).click();
  picker = await openPicker(page);
  await picker.getByRole("button", { name: "Speaker details" }).click();
  await expect(picker.getByText("Desired: speaker")).toBeVisible();
  await picker.getByRole("combobox", { name: "Output" }).selectOption("speaker");
  await picker.getByRole("button", { name: "Review transfer from aswitch" }).click();
  expect(f.commands).toHaveLength(0);
  await picker.getByRole("button", { name: "Confirm transfer without playback" }).click();
  await expect(picker.getByText(/destination attached=false/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Fixture destination failed/ })
      .first(),
  ).toBeVisible();
  expect(f.commands.map(({ command }) => command.type)).toEqual(["output.transfer"]);
});

test("a worker restart reconnect and stale position events send no playback commands", async ({
  page,
}) => {
  const f = await fixture(page, { local: false });
  const picker = await openPicker(page);
  await picker.getByText("Lounge", { exact: true }).click();
  await picker.getByRole("button", { name: "Join Lounge" }).click();
  await expect(page.getByTestId("floating-player")).toBeVisible();
  await page.evaluate(
    ({ worker, initial }) => {
      const state = (
        window as unknown as {
          __serverPlayerFixture: {
            players: Record<string, typeof initial>;
            worker: string;
            sources: Array<{
              closed: boolean;
              listeners: Record<string, (event: { data: string }) => void>;
              onerror: () => void;
            }>;
          };
        }
      ).__serverPlayerFixture;
      const source = state.sources.filter((s) => !s.closed).at(-1)!;
      const position = {
        type: "position",
        player_id: "lounge",
        revision: 3,
        current_entry_id: initial.state.current_entry_id,
        position: 30,
        duration: 100,
        observed_at: "now",
        worker_instance: state.worker,
        sequence: 50,
      };
      source.listeners.position!({
        data: JSON.stringify({
          ...position,
          current_entry_id: "22222222-2222-4222-8222-222222222222",
        }),
      });
      initial.revision = 0;
      initial.state.status = "stopped";
      initial.state.checkpoint = true;
      initial.state.position = 18;
      state.players.lounge = initial;
      state.worker = worker;
      source.onerror();
    },
    { worker: workerB, initial: f.players.lounge },
  );
  await expect(
    page.getByTestId("floating-player").getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  expect(f.commands).toHaveLength(0);
});
