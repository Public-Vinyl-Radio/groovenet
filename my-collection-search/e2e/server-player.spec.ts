import { expect, test, type Page } from "@playwright/test";
import { player, device, workerA, workerB } from "../src/test/serverPlayerFixtures";
import type { ServerPlayerCommandInput } from "@groovenet/contracts";

test.skip(!process.env.RUN_E2E_TESTS, "Run against the isolated Docker/worktree app with RUN_E2E_TESTS=1");

async function openPlayback(page: Page, label: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: `Playback: ${label}`, exact: true }).click();
}

async function fixture(page: Page) {
  const players = { lounge: player(), aswitch: player("aswitch") };
  players.aswitch.assigned_output = "speaker";
  const commands: Array<{ id: string; command: ServerPlayerCommandInput }> = [];
  let authorized = false;
  let conflict = false;
  await page.addInitScript(({ initial, worker }) => {
    const sources: Array<{ url: string; closed: boolean; listeners: Record<string, (event: { data: string }) => void>; onerror: (() => void) | null }> = [];
    const state = { players: initial, worker, sources };
    Object.assign(window, { __serverPlayerFixture: state });
    class FixtureEventSource {
      url: string; closed = false; listeners: Record<string, (event: { data: string }) => void> = {}; onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url; sources.push(this);
        const id = url.split("/")[3] as keyof typeof initial;
        setTimeout(() => { if (!this.closed) this.listeners.snapshot?.({ data: JSON.stringify({ type: "snapshot", player: state.players[id], worker_instance: state.worker, sequence: 1 }) }); }, 0);
      }
      addEventListener(name: string, listener: (event: { data: string }) => void) { this.listeners[name] = listener; }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: FixtureEventSource });
  }, { initial: players, worker: workerA });
  await page.route("**/api/players**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path.endsWith("browser/session")) {
      if (request.method() === "POST") {
        expect(request.postDataJSON()).toEqual({ passphrase: "fixture-web-passphrase" }); authorized = true;
      } else if (request.method() === "DELETE") authorized = false;
      return json({ authorized });
    }
    if (!authorized) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    if (path === "/api/players") return json({ players: Object.values(players) });
    const id = path.split("/")[3] as keyof typeof players;
    const p = players[id];
    if (path.endsWith("devices")) return json({ devices: [{ ...device, assigned_player_id: players.aswitch.assigned_output ? "aswitch" : null }] });
    if (path.endsWith("commands")) {
      const command = request.postDataJSON() as ServerPlayerCommandInput;
      commands.push({ id, command });
      if (conflict) { conflict = false; p.revision++; return json({ error: "Player changed", code: "REVISION_CONFLICT" }, 409); }
      expect(command.expected_revision).toBe(p.revision);
      if ((command.type === "play" || command.type === "resume") && !command.allow_unknown) return json({ error: "Activity unknown", code: "AVAILABILITY_UNKNOWN" }, 409);
      switch (command.type) {
        case "play": p.state.current_entry_id = command.entry_id ?? p.state.current_entry_id; p.state.status = "playing"; break;
        case "resume": p.state.status = "playing"; break;
        case "pause": p.state.status = "paused"; break;
        case "seek": p.state.position = command.seconds; break;
        case "volume": p.state.volume = command.volume; break;
        case "queue.remove": p.state.queue = p.state.queue.filter(entry => entry.id !== command.entry_id); break;
        case "queue.move": { const from = p.state.queue.findIndex(entry => entry.id === command.entry_id); const [entry] = p.state.queue.splice(from, 1); p.state.queue.splice(command.to, 0, entry!); break; }
        case "queue.clear": p.state.queue = []; p.state.current_entry_id = null; p.state.position = 0; p.state.duration = null; p.state.status = "stopped"; break;
        case "queue.replace": {
          p.state.queue = command.entries.map(entry => ({ ...entry, id: entry.id ?? crypto.randomUUID(), title: entry.track_id, artist: "Fixture artist" }));
          p.state.current_entry_id = command.current_entry_id ?? null;
          p.state.position = command.position ?? 0;
          p.state.duration = null;
          p.state.status = command.play ? "playing" : "stopped";
          p.state.checkpoint = !command.play && p.state.current_entry_id !== null;
          break;
        }
        case "output.transfer": {
          expect(command.from_revision).toBe(players.aswitch.revision);
          players.aswitch.assigned_output = null; players.aswitch.revision++;
          p.state.desired_output = command.output_id; p.revision++;
          return json({ player: p, transfer: { from_player: players.aswitch, detached: true, attached: false, error: { code: "TEST_ENGINE_FAILURE", message: "Fixture destination failed" } } });
        }
      }
      p.revision++; return json({ player: p });
    }
    return json(p);
  });
  // Keep development tooling clear of navigation controls across reloads.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  await page.goto("/settings");
  await openPlayback(page, "Local browser");
  await page.getByLabel("Household web passphrase").fill("fixture-web-passphrase");
  await page.getByRole("button", { name: "Unlock server players" }).click();
  await page.getByRole("combobox", { name: "Control playback on" }).selectOption("lounge");
  await expect(page.getByText("Server: Lounge · paused")).toBeVisible();
  return { players, commands, conflictNext: () => { conflict = true; } };
}

test("server selection, explicit acknowledgement, revisioned controls, conflicts and duplicate queue entries", async ({ page }) => {
  const f = await fixture(page);
  expect(f.commands).toHaveLength(0);
  await expect(page.getByText("Desired output: speaker")).toBeVisible();
  await expect(page.getByText("Actual assignment: None")).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Speaker activity is unknown. Connecting may interrupt another sender.")).toBeVisible();
  expect(f.commands).toHaveLength(1);
  await page.getByRole("button", { name: "Acknowledge unknown activity and continue" }).click();
  await expect(page.getByText("Server: Lounge · playing")).toBeVisible();
  f.conflictNext(); await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText(/State refreshed; review it/).first()).toBeVisible();
  expect(f.commands.filter(item => item.command.type === "pause")).toHaveLength(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Server: Lounge · paused")).toBeVisible();
  await page.getByLabel("Seek to seconds").fill("36"); await page.getByRole("button", { name: "Seek", exact: true }).click();
  await expect(page.getByText("36 / 100 seconds")).toBeVisible();
  await page.getByLabel("Requested sender volume (%)").fill("45"); await page.getByRole("button", { name: "Set volume" }).click();
  await page.getByRole("button", { name: "Move queue entry 2 up" }).click();
  await page.getByRole("button", { name: "Remove queue entry 1" }).click();
  await expect(page.getByText("Queue · 1")).toBeVisible();
  expect(f.players.lounge.state.queue[0]!.friend_id).toBe(1);
  await page.getByRole("combobox", { name: "Control playback on" }).selectOption("aswitch");
  await expect(page.getByText("Server: Aswitch · paused")).toBeVisible();
  await expect(page.getByText("Queue · 2")).toBeVisible();
  const count = f.commands.length;
  await page.getByRole("button", { name: "Close playback panel" }).click();
  await openPlayback(page, "Server · Aswitch");
  expect(f.commands).toHaveLength(count);
  expect(await page.evaluate(() => localStorage.getItem("mcs:playback-target"))).toBe("aswitch");
  await page.reload();
  await openPlayback(page, "Server · Aswitch");
  await expect(page.getByText("Server: Aswitch · paused")).toBeVisible();
  expect(f.commands).toHaveLength(count);
  await page.goto("/settings/appearance");
  await openPlayback(page, "Server · Aswitch");
  await expect(page.getByText("Server: Aswitch · paused")).toBeVisible();
  expect(f.commands).toHaveLength(count);
  await page.getByRole("dialog", { name: "Playback target" }).evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.screenshot({ path: `e2e/test-results/server-controls-${test.info().project.name}.png`, fullPage: true });
});

test("explicit transfer exposes partial attachment and remains visible after closing controls", async ({ page }) => {
  const f = await fixture(page);
  await page.getByRole("combobox", { name: "Output", exact: true }).selectOption("speaker");
  await page.getByRole("button", { name: "Review transfer from aswitch" }).click();
  await expect(page.getByRole("button", { name: "Confirm transfer without playback" })).toBeVisible();
  expect(f.commands).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm transfer without playback" }).click();
  await expect(page.getByText(/destination attached=false/).first()).toBeVisible();
  await page.getByRole("button", { name: "Close playback panel" }).click();
  await expect(page.getByRole("dialog", { name: "Playback target" })).toBeHidden();
  await expect(page.getByRole("region", { name: /Notifications/ }).getByText(/Fixture destination failed/)).toBeVisible();
  expect(f.commands).toHaveLength(1); expect(f.commands[0]!.command.type).toBe("output.transfer");
});

test("position fencing and worker restart reconnect do not send playback commands", async ({ page }) => {
  const f = await fixture(page);
  await page.evaluate(({ worker, initial }) => {
    const state = (window as unknown as { __serverPlayerFixture: { players: Record<string, typeof initial>; worker: string; sources: Array<{ listeners: Record<string, (event: { data: string }) => void>; onerror: () => void }> } }).__serverPlayerFixture;
    const source = state.sources.at(-1)!;
    const position = { type: "position", player_id: "lounge", revision: 3, current_entry_id: initial.state.current_entry_id, position: 30, duration: 100, observed_at: "now", worker_instance: state.worker, sequence: 2 };
    source.listeners.position!({ data: JSON.stringify({ ...position, current_entry_id: "22222222-2222-4222-8222-222222222222" }) });
    source.listeners.position!({ data: JSON.stringify({ ...position, sequence: 3 }) });
    initial.revision = 0; initial.state.status = "stopped"; initial.state.checkpoint = true; initial.state.position = 18;
    state.players.lounge = initial; state.worker = worker; source.onerror();
    source.listeners.snapshot!({ data: JSON.stringify({ type: "snapshot", player: { ...initial, revision: 99 }, worker_instance: worker, sequence: 99 }) });
  }, { worker: workerB, initial: f.players.lounge });
  await expect(page.getByText("Server: Lounge · stopped")).toBeVisible();
  await expect(page.getByText(/18 \/ 100 seconds · Saved checkpoint/)).toBeVisible();
  expect(f.commands).toHaveLength(0);
  await page.getByRole("combobox", { name: "Control playback on" }).selectOption("");
  expect(f.commands).toHaveLength(0);
});

test("clearing a server queue offers Undo with identical entries and saved playback position", async ({ page }) => {
  const f = await fixture(page);
  const before = structuredClone(f.players.lounge.state);
  await page.getByRole("button", { name: "Clear server queue" }).click();
  await expect(page.getByText("Queue · 0")).toBeVisible();
  await expect(page.getByText("Queue cleared", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Queue · 2")).toBeVisible();
  expect(f.commands.map(item => item.command.type)).toEqual(["queue.clear", "queue.replace"]);
  expect(f.commands[1]!.command).toMatchObject({ entries: before.queue.map(({ id, track_id, friend_id }) => ({ id, track_id, friend_id })), current_entry_id: before.current_entry_id, position: before.position, play: false });
  await expect(page.getByText("12 / unknown seconds · Saved checkpoint")).toBeVisible();
});
