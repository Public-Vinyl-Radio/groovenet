import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPlayerCommands } from "./player.js";
const { api } = vi.hoisted(() => ({ api: { getServerPlayer: vi.fn(), commandServerPlayer: vi.fn(), listServerPlayers: vi.fn(), listServerPlayerDevices: vi.fn() } }));
vi.mock("./remotePlayer.js", async (original) => ({ ...await original<typeof import("./remotePlayer.js")>(), makeRemoteApi: () => api }));
const state = { id: "room", name: "Room", revision: 2, engine_id: "primary", availability_policy: "ask", assigned_output: null,
  state: { queue: [], current_entry_id: null, status: "stopped", position: 0, duration: null, volume: 50, error: null, desired_output: null, checkpoint: true } };
async function run(...args: string[]) {
  const program = new Command(); program.exitOverride(); addPlayerCommands(program);
  await program.parseAsync(["node", "test", "player", ...args]);
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); process.exitCode = 0; });
describe("remote player CLI", () => {
  it("sets a validated persistent availability policy with a revision", async () => {
    api.getServerPlayer.mockResolvedValue(state);
    api.commandServerPlayer.mockResolvedValue({ player: { ...state, availability_policy: "always" } });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await run("set", "room", "--availability", "always", "--json");
    expect(api.commandServerPlayer).toHaveBeenCalledExactlyOnceWith("room", { type: "availability.set", availability_policy: "always", expected_revision: 2 });
    await run("set", "room", "--availability", "ask");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("room", { type: "availability.set", availability_policy: "ask", expected_revision: 2 });
    await run("--remote", "room", "set", "room", "--availability", "always");
    expect(api.commandServerPlayer).toHaveBeenCalledTimes(2);
    await run("set", "room", "--availability", "invalid");
    expect(api.commandServerPlayer).toHaveBeenCalledTimes(2);
  });
  it("selects remote mode after subcommands and sends acknowledged policy flags", async () => {
    api.getServerPlayer.mockResolvedValue(state);
    api.commandServerPlayer.mockResolvedValue({ player: state });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await run("play", "--remote", "room", "--allow-unknown", "--takeover", "--json");
    expect(api.commandServerPlayer).toHaveBeenCalledWith("room", { type: "play", expected_revision: 2, allow_unknown: true, takeover: true });
    await run("--remote", "room", "queue", "clear", "--json");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("room", { type: "queue.clear", expected_revision: 2 });
    const entry = { id: "00000000-0000-4000-8000-000000000001", track_id: "track", friend_id: 1, artist: "Artist", title: "Song" };
    api.getServerPlayer.mockResolvedValue({ ...state, state: { ...state.state, queue: [entry] } });
    await run("--remote", "room", "play", entry.id, "--json");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("room", { type: "play", entry_id: entry.id, expected_revision: 2 });
    await run("--remote", "room", "play", "0", "--json");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("room", { type: "play", entry_id: entry.id, expected_revision: 2 });
    await run("--remote", "room", "queue", "move", "missing", "0");
    expect(process.exitCode).toBe(1);
  });
  it("lists persistent players and truthfully renders remote status and stop", async () => {
    api.listServerPlayers.mockResolvedValue([state]);
    api.getServerPlayer.mockResolvedValue(state);
    api.commandServerPlayer.mockResolvedValue({ player: state });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await run("list");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Room [room]"));
    await run("list", "--json");
    await run("--remote", "room", "status");
    api.getServerPlayer.mockResolvedValue({ ...state, assigned_output: "speaker", state: { ...state.state, desired_output: "speaker", checkpoint: false } });
    await run("--remote", "room", "status");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("saved checkpoint"));
    api.getServerPlayer.mockResolvedValue({ ...state, state: { ...state.state, error: { code: "PLAYBACK_INTERRUPTED", message: "Speaker lost" } } });
    await run("--remote", "room", "status");
    expect(log).toHaveBeenCalledWith("PLAYBACK_INTERRUPTED: Speaker lost");
    await run("--remote", "room", "stop");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("room", { type: "stop", expected_revision: 2 });
  });
  it("rejects local start in remote mode, and reports unreachable remote without fallback", async () => {
    const output = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await run("--remote", "room", "start");
    expect(output.mock.calls.flat().join("")).toContain("already run on the server");
    await run("--remote", "room", "_daemon");
    expect(output.mock.calls.flat().join("")).toContain("Cannot start a local daemon");
    api.getServerPlayer.mockRejectedValueOnce(new Error("remote unreachable"));
    await run("--remote", "room", "status");
    api.getServerPlayer.mockResolvedValue({ ...state, assigned_output: "speaker", state: { ...state.state, desired_output: "speaker", checkpoint: false } });
    await run("--remote", "room", "status");
    expect(output.mock.calls.flat().join("")).toContain("remote unreachable");
    expect(process.exitCode).toBe(1);
  });
  it("requires remote selection for transfer and reports partial failure", async () => {
    const output = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await run("queue", "move", "entry", "0");
    await run("queue", "clear");
    await run("devices", "transfer", "speaker");
    expect(output.mock.calls.flat().join("")).toContain("requires --remote");
    api.getServerPlayer.mockResolvedValue(state);
    api.listServerPlayerDevices.mockResolvedValue([{ id: "speaker", assigned_player_id: "source" }]);
    api.commandServerPlayer.mockResolvedValue({ player: state, transfer: { detached: true, attached: false, error: { code: "DEVICE_BUSY", message: "busy" } } });
    await run("--remote", "room", "devices", "transfer", "speaker", "--json");
    expect(output.mock.calls.flat().join("")).toContain("detached=true, attached=false");
    expect(process.exitCode).toBe(1);
  });
});

it("replaces a remote queue atomically and rejects malformed/local replacements", async () => {
  api.getServerPlayer.mockResolvedValue(state); api.commandServerPlayer.mockResolvedValue({ player: state });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const replacement = { entries: [{ track_id: "track", friend_id: 1 }], position: 42, play: true };
  await run("--remote", "room", "--allow-unknown", "queue", "replace", JSON.stringify(replacement), "--json");
  expect(api.commandServerPlayer).toHaveBeenCalledExactlyOnceWith("room", { type: "queue.replace", expected_revision: 2, ...replacement, allow_unknown: true, takeover: false });
  const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  for (const value of ["[]", "null", "1", "{", '{"entries":[{"track_id":"t","friend_id":0}]}']) await run("--remote", "room", "queue", "replace", value);
  await run("queue", "replace", JSON.stringify(replacement));
  expect(api.commandServerPlayer).toHaveBeenCalledTimes(1);
  expect(error.mock.calls.flat().join("")).toContain("requires --remote");
});
