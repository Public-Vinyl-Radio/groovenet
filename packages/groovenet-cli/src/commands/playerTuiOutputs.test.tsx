import React, { act } from "react";
import { render, cleanup } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture, server } from "../../test/targets.js";
import { PlayerTui } from "./playerTui.js";
import { PlayOnView, DevicesView } from "./playerTuiOutputs.js";
import { buildKeymap } from "./playerKeymap.js";
import { forceTerminal, resizeTerminal } from "../tui/testing.js";
import { displayWidth } from "../tui/text.js";
import type { GroovenetClient } from "@groovenet/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { await act(async () => { await tick(); }); };
beforeEach(() => forceTerminal(120, 40));
afterEach(async () => { await act(async () => cleanup()); vi.useRealTimers(); vi.restoreAllMocks(); });
const actions = async (app: ReturnType<typeof render>, ...keys: string[]) => { for (const key of keys) await act(async () => { app.stdin.write(key); if (key === "\u001b") await new Promise(resolve => setTimeout(resolve, 30)); await tick(); }); };
function mount(f = fixture(), props: Partial<React.ComponentProps<typeof PlayerTui>> = {}) {
  const api = Object.assign(f.api, { searchTracks: vi.fn(async () => ({ tracks: [] })), searchAlbums: vi.fn(async () => ({ hits: [], estimatedTotalHits: 0 })), listPlaylists: vi.fn(async () => []), batchGetTracks: vi.fn(async () => []) });
  return { ...f, app: render(<PlayerTui control={f.local.control} api={api as unknown as GroovenetClient} initialSnapshot={f.snapshot()} targets={f.targets} options={{}} {...props} />) };
}

describe("Play on and devices rendering", () => {
  it.each([[120, 40], [80, 24], [40, 50], [32, 30], [120, 5], [60, 5], [30, 10]])("fits %ix%i and snapshots the picker", async (width, height) => {
    forceTerminal(width!, height!); const f = mount(); await settle(); await actions(f.app, "o", "j");
    const frame = f.app.lastFrame()!;
    expect(frame.split("\n").length).toBeLessThanOrEqual(height!);
    for (const line of frame.split("\n")) expect(displayWidth(line)).toBeLessThanOrEqual(width!);
    expect(frame).toMatchSnapshot(); await f.targets.close();
  });
  it("previews live/idle, current and local targets and retains selection through resize and cancellation", async () => {
    const f = mount(); f.states.set("study", server("study", "stopped")); await settle();
    await actions(f.app, "o"); expect(f.app.lastFrame()).toContain("Playing here never stops a server");
    await actions(f.app, "j"); expect(f.app.lastFrame()).toContain("Blue Train · John Coltrane"); expect(f.app.lastFrame()).toContain("0:12 · 0 up next");
    expect(f.app.lastFrame()).toContain("3 upcoming tracks join the end");
    await actions(f.app, "j"); expect(f.app.lastFrame()).toContain("Nothing playing"); expect(f.app.lastFrame()).toContain("start a session on an idle server");
    await act(async () => resizeTerminal(f.app.stdout, 40, 50)); expect(f.app.lastFrame()).toContain("STUDY · IDLE");
    await actions(f.app, "\u001b"); expect(f.app.lastFrame()).not.toContain("Choose where audio plays");
    await actions(f.app, "o", "j", "\r"); expect(f.targets.active.id).toBe("lounge"); expect(f.app.lastFrame()).toContain("LOUNGE");
    await actions(f.app, "o"); expect(f.app.lastFrame()).toContain("controlling this server");
    await f.targets.close();
  });
  it("uses custom picker, cancel and confirmation bindings, and sends transport to the selected target", async () => {
    const f = mount(fixture(), { keymap: buildKeymap({ "play-on.open": "v", "target.confirm": "c", "target.cancel": "b", "list.down": "J" }) }); await settle();
    f.api.commandServerPlayer.mockRejectedValueOnce(Object.assign(new Error("Unknown speaker activity"), { data: { code: "AVAILABILITY_UNKNOWN" } }));
    await actions(f.app, "v", "J", "\r"); expect(f.app.lastFrame()).toContain("c play anyway · b cancel");
    expect(f.control.request.mock.calls.some(call => call[0] === "stop")).toBe(false);
    await actions(f.app, "y"); expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
    await actions(f.app, "c"); expect(f.targets.active.id).toBe("lounge");
    await actions(f.app, "n"); expect(f.api.commandServerPlayer.mock.lastCall?.[1].type).toBe("next");
    await actions(f.app, "v", "k", "\r"); expect(f.targets.active.id).toBe("");
    const calls = f.api.commandServerPlayer.mock.calls.length; await actions(f.app, "n"); expect(f.control.request).toHaveBeenLastCalledWith("next", undefined);
    expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(calls); await f.targets.close();
  });
  it("shows occupied confirmation for regular transport and cancels without acknowledging", async () => {
    const f = mount(fixture("stopped", true)); await settle(); await actions(f.app, "o", "j", "\r");
    f.api.commandServerPlayer.mockRejectedValueOnce(Object.assign(new Error("Occupied"), { data: { code: "SPEAKER_OCCUPIED" } }));
    await actions(f.app, "r"); expect(f.app.lastFrame()).toContain("y take over"); expect(f.app.lastFrame()).toContain("Esc cancel");
    await actions(f.app, "\u001b"); expect(f.app.lastFrame()).not.toContain("y take over");
    expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1); await f.targets.close();
  });
  it("keeps local usable when credentials or discovery fail, and ignores late discoveries after closing", async () => {
    const f = mount(); await settle(); f.api.listServerPlayers.mockRejectedValueOnce(new Error("Configure player_api_key"));
    await actions(f.app, "o"); expect(f.app.lastFrame()).toContain("Configure player_api_key");
    await actions(f.app, "\r"); expect(f.app.lastFrame()).not.toContain("Choose where audio plays");
    await actions(f.app, "n"); expect(f.control.request).toHaveBeenLastCalledWith("next", undefined);
    let resolve!: (value: ReturnType<typeof server>[]) => void;
    f.api.listServerPlayers.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await actions(f.app, "o"); expect(f.app.lastFrame()).toContain("Loading server players");
    await actions(f.app, "\u001b"); await act(async () => resolve([server("late")]));
    expect(f.app.lastFrame()).not.toContain("LATE"); await f.targets.close();
  });
  it("preserves typed search text and protects printable picker bindings", async () => {
    const f = mount(); await settle(); await actions(f.app, "/", "o");
    expect(f.app.lastFrame()).not.toContain("Choose where audio plays");
    expect(f.app.lastFrame()).toContain("o▏");
    await actions(f.app, "\r", "o", "\u001b"); expect(f.app.lastFrame()).toContain("o"); await f.targets.close();
  });
  it("opens the full view from a strip without submitting a hidden target", async () => {
    forceTerminal(120, 5); const fullView = vi.fn(async () => "Expand the pane"); const f = mount(fixture(), { fullView }); await settle();
    await actions(f.app, "o", "\r"); expect(fullView).toHaveBeenCalledOnce(); expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
    await act(async () => resizeTerminal(f.app.stdout, 120, 40)); expect(f.app.lastFrame()).toContain("Choose where audio plays"); await f.targets.close();
  });
  it("fences old controller events and delayed status responses after switching", async () => {
    const state = fixture("stopped", true);
    let resolve!: (value: ReturnType<typeof state.snapshot>) => void;
    state.control.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const f = mount(state); await settle();
    // A harmless late transport status response must not overwrite the new server.
    await actions(f.app, "o", "j");
    await actions(f.app, "\r"); expect(f.targets.active.id).toBe("lounge");
    await act(async () => { resolve({ ...f.snapshot(), volume: 7 }); f.control.emit("event", { event: "state", data: { ...f.snapshot(), volume: 8 } }); });
    expect(f.app.lastFrame()).toContain("50%"); expect(f.app.lastFrame()).not.toContain("8%"); await f.targets.close();
  });
  it("renders an empty discovery and unavailable selected preview within a short body", async () => {
    const props = { players: [], chosen: "gone", current: "", count: 0, loading: false, problem: "Target vanished", area: { width: 32, rows: 5 } };
    const app = render(<PlayOnView {...props} />); expect(app.lastFrame()).toContain("Target vanished");
    app.rerender(<PlayOnView {...props} chosen="" problem="" />); expect(app.lastFrame()).toContain("No server players");
  });
  it("restyles selected outputs and retains observations in narrow layouts", async () => {
    const app = render(<DevicesView devices={[{ id: "speaker", name: "Lounge · activity=unknown · assigned=study · desired=study", description: "Observed output" }, { id: "local", name: "This machine" }]} selected={0} area={{ width: 40, rows: 8 }} />);
    expect(app.lastFrame()).toContain("Lounge [speaker]"); expect(app.lastFrame()).toContain("activity=unknown");
    app.rerender(<DevicesView devices={[]} selected={0} area={{ width: 32, rows: 5 }} />); expect(app.lastFrame()).toContain("No outputs available");
  });
});

it("keeps startup playlist actions once across runtime switches", async () => {
  const f = mount(fixture("stopped", true), { options: { playlist: "7" } }); await settle();
  await actions(f.app, "o", "j", "\r", "o", "k", "\r");
  expect(f.control.request.mock.calls.filter(call => call[0] === "queue.add")).toEqual([["queue.add", { playlistId: "7" }]]); await f.targets.close();
});
it("acknowledges regular remote playback explicitly and shows picker help", async () => {
  const f = mount(fixture("stopped", true)); await settle(); await actions(f.app, "o", "?", "?", "j", "\r");
  f.api.commandServerPlayer.mockRejectedValueOnce(Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }));
  await actions(f.app, "r", "y"); expect(f.app.lastFrame()).not.toContain("Unknown"); expect(f.api.commandServerPlayer.mock.lastCall?.[1]).toMatchObject({ type: "play", allow_unknown: true });
  await actions(f.app, "o", "q"); await f.targets.close();
});
it("invalidates a pending join when discovery removes its target", async () => {
  const interval = vi.spyOn(globalThis, "setInterval");
  const f = mount(); await settle(); await actions(f.app, "o", "j");
  f.api.commandServerPlayer.mockRejectedValueOnce(Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }));
  await actions(f.app, "\r"); expect(f.targets.confirmation).toBeTruthy();
  f.api.listServerPlayers.mockResolvedValue([]);
  const poll = interval.mock.calls.find(call => call[1] === 5000)![0] as () => void;
  await act(async () => { poll(); await tick(); });
  expect(f.targets.confirmation).toBeFalsy(); await actions(f.app, "\r", "y"); expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
  expect(f.snapshot().queue).toHaveLength(4); await f.targets.close();
});
it("keeps Enter for expansion during a strip acknowledgement", async () => {
  const f = mount(fixture("stopped", true), { fullView: vi.fn(async () => "Expand") }); await settle(); await actions(f.app, "o", "j", "\r");
  f.api.commandServerPlayer.mockRejectedValueOnce(Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }));
  await actions(f.app, "r"); await act(async () => resizeTerminal(f.app.stdout, 120, 5));
  await actions(f.app, "\r"); expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1); await f.targets.close();
});
it("uses only theme roles for selection, preserves state across all layouts, and shows device descriptions", async () => {
  const f = mount(); await settle(); await actions(f.app, "o", "j");
  for (const [w,h] of [[80,24],[40,50],[120,5],[30,10],[120,40]]) await act(async () => resizeTerminal(f.app.stdout, w!, h!));
  expect(f.app.lastFrame()).toContain("› ○ LOUNGE · LIVE"); await f.targets.close();
  const props = { devices: [{ id: "x", name: "Local", description: "CoreAudio" }], selected: 0, area: { width: 40, rows: 5 } };
  const app = render(<DevicesView {...props} />); expect(app.lastFrame()).toContain("CoreAudio");
  app.rerender(<DevicesView {...props} selected={9} />); expect(app.lastFrame()).toContain("Local [x]");
});

it("supports an embedded local TUI's target factory and returns to its attached local controller", async () => {
  const { GroovenetClient } = await import("@groovenet/client");
  const f = fixture("stopped", true);
  vi.spyOn(GroovenetClient.prototype, "getServerPlayer").mockImplementation(f.api.getServerPlayer);
  vi.spyOn(GroovenetClient.prototype, "commandServerPlayer").mockImplementation(f.api.commandServerPlayer);
  vi.spyOn(GroovenetClient.prototype, "serverPlayerEvents").mockImplementation(f.api.serverPlayerEvents as never);
  vi.spyOn(GroovenetClient.prototype, "listServerPlayerDevices").mockResolvedValue([]);
  const app = render(<PlayerTui control={f.local.control} api={f.api as unknown as GroovenetClient} initialSnapshot={f.snapshot()} options={{}} />);
  await settle(); await actions(app, "o", "j", "\r", "o", "k", "\r"); expect(app.lastFrame()).toContain("local daemon");
  await act(async () => app.unmount());
});
it("reports the missing local runtime in an embedded remote TUI without sending an audio command", async () => {
  const f = fixture("stopped", true); await f.preview(); await f.targets.select("lounge");
  const control = f.targets.active.control;
  const app = render(<PlayerTui control={control} api={f.api as unknown as GroovenetClient} initialSnapshot={f.targets.active.snapshot} options={{ remote: "lounge" }} />);
  await settle(); await actions(app, "o", "k", "\r"); expect(app.lastFrame()).toContain("Local target is unavailable");
  expect(f.api.commandServerPlayer).not.toHaveBeenCalled(); await f.targets.close();
});
it("explains remote-to-remote switching, empty local queues, and live previews with no current entry", () => {
  const base = { players: [server()], chosen: "lounge", current: "study", preview: server(), count: 0, loading: false, problem: "", area: { width: 80, rows: 12 } };
  const app = render(<PlayOnView {...base} />); expect(app.lastFrame()).toContain("Switch to control this server");
  app.rerender(<PlayOnView {...base} area={{ width: 32, rows: 5 }} />); expect(app.lastFrame()).toContain("Switch; departing queue stays");
  app.rerender(<PlayOnView {...base} current="" preview={{ ...server(), state: { ...server().state, current_entry_id: null } }} />);
  expect(app.lastFrame()).toContain("1 up next"); expect(app.lastFrame()).toContain("No local tracks to send");
  app.rerender(<PlayOnView {...base} chosen="study" area={{ width: 32, rows: 5 }} />); expect(app.lastFrame()).toContain("Controlling this shared queue");
});
it.each([[120,40],[80,24],[40,50],[32,30],[120,5]])("fits and snapshots devices at %ix%i", async (width, height) => {
  forceTerminal(width!, height!); const f = mount(fixture("stopped", true));
  f.api.listServerPlayerDevices.mockResolvedValue([{ id: "speaker", name: "Lounge Room Audio", assigned_player_id: "study", desired_by: ["lounge"], observed: { availability: "unknown", observed_at: null, source: "unconfigured", sender_identity: "unknown", entity_id: null } }]);
  await settle();
  // Select through the state helper so a strip keeps its Enter-to-expand behavior.
  await act(async () => { await f.targets.previewTarget("lounge"); await tick(); await f.targets.select("lounge"); });
  await actions(f.app, "d");
  const frame = f.app.lastFrame()!;
  expect(frame.split("\n").length).toBeLessThanOrEqual(height!);
  for (const line of frame.split("\n")) expect(displayWidth(line)).toBeLessThanOrEqual(width!);
  expect(frame).toMatchSnapshot(); await f.targets.close();
});
it("ignores a late discovery rejection after cancellation and reports startup status errors", async () => {
  const state = fixture(); state.control.request.mockRejectedValueOnce(new Error("Status unavailable"));
  const f = mount(state); await settle(); expect(f.app.lastFrame()).toContain("Status unavailable");
  let reject!: (error: Error) => void;
  f.api.listServerPlayers.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
  await actions(f.app, "o", "\u001b"); await act(async () => reject(new Error("Late denied")));
  expect(f.app.lastFrame()).not.toContain("Late denied"); await f.targets.close();
});
it("disables opening the picker during pending local commands and never applies late responses to a new target", async () => {
  const f = mount(fixture("stopped", true)); await settle();
  let resolve!: (value: ReturnType<typeof f.snapshot>) => void;
  f.control.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await actions(f.app, "r", "o"); expect(f.app.lastFrame()).toContain("Wait for the queue update"); expect(f.app.lastFrame()).not.toContain("Choose where audio plays");
  await act(async () => { await f.targets.previewTarget("lounge"); await tick(); await f.targets.select("lounge"); resolve({ ...f.snapshot(), volume: 9 }); await tick(); });
  expect(f.app.lastFrame()).toContain("50%"); await f.targets.close();
});
it("retains the pending join on a failed acknowledgement and refuses cancel during an in-flight join", async () => {
  const f = mount(); await settle(); await actions(f.app, "o", "j");
  f.api.commandServerPlayer.mockRejectedValueOnce(Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }));
  await actions(f.app, "\r"); f.api.commandServerPlayer.mockRejectedValueOnce(new Error("Denied"));
  await actions(f.app, "y"); expect(f.targets.active.id).toBe(""); expect(f.snapshot().queue).toHaveLength(4);
  let resolve!: (value: { player: ReturnType<typeof server> }) => void;
  f.api.commandServerPlayer.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await actions(f.app, "\r", "\u001b"); expect(f.app.lastFrame()).toContain("Joining…");
  await act(async () => resolve({ player: server() })); await f.targets.close();
});
it("previews fresh stream state over older discovery and rejects stale revisions and departed targets", async () => {
  const f = mount(); await settle(); await actions(f.app, "o", "j");
  const old = f.observers.get("lounge")!;
  await act(async () => { old.event({ type: "snapshot", player: { ...server(), revision: 4, state: { ...server().state, current_entry_id: null, status: "ended" } }, worker_instance: "worker", sequence: 2 }); await tick(); });
  expect(f.app.lastFrame()).toContain("LOUNGE · IDLE");
  await act(async () => { f.observers.get("lounge")!.event({ type: "snapshot", player: server(), worker_instance: "worker", sequence: 3 }); await tick(); });
  expect(f.app.lastFrame()).toContain("LOUNGE · IDLE");
  await actions(f.app, "j");
  await act(async () => { old.event({ type: "snapshot", player: { ...server(), revision: 99 }, worker_instance: "worker", sequence: 99 }); await tick(); });
  expect(f.targets.preview?.player?.id).toBe("study"); await f.targets.close();
});
