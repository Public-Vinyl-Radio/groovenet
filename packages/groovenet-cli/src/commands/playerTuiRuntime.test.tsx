import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayerProtocolError, type PlayerControlClient, type PlayerDaemon } from "@groovenet/player";
import type { GroovenetClient } from "@groovenet/client";
import { fixture } from "../../test/targets.js";
import { runPlayerTui, type PlayerTui } from "./playerTui.js";
import { RemotePlayerController } from "./remotePlayer.js";
const tick = () => new Promise(resolve => setImmediate(resolve));
const propsOf = (node: React.ReactElement) => node.props as React.ComponentProps<typeof PlayerTui>;

describe("TUI target ownership", () => {
  it.each([false, true])("attaches local lazily from --remote, owns daemon only if created=%s", async created => {
    const f = fixture("stopped", true);
    const dead = fixture().control; dead.request.mockRejectedValue(new PlayerProtocolError("DAEMON_UNAVAILABLE", "No daemon"));
    const createControl = vi.fn().mockReturnValueOnce(created ? dead : f.control).mockReturnValue(f.control);
    const daemon = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const createDaemon = vi.fn(() => daemon as unknown as PlayerDaemon);
    const remotes: RemotePlayerController[] = [];
    await runPlayerTui({ remote: "lounge" }, {
      createApi: () => f.api as unknown as GroovenetClient,
      createRemote: id => { const control = new RemotePlayerController(f.api as unknown as GroovenetClient, id); vi.spyOn(control, "close"); remotes.push(control); return control; },
      createControl: createControl as () => PlayerControlClient, createDaemon,
      render: node => ({ waitUntilExit: async () => {
        const targets = propsOf(node).targets!; expect(createControl).not.toHaveBeenCalled();
        expect(await targets.select("")).toBe(true); expect(targets.active.id).toBe("");
        await targets.previewTarget("study"); await tick(); await targets.select("study"); await targets.select("");
        expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
      } }),
    });
    expect(f.control.close).toHaveBeenCalledOnce(); expect(remotes.every(control => vi.mocked(control.close).mock.calls.length === 1)).toBe(true);
    expect(createDaemon).toHaveBeenCalledTimes(created ? 1 : 0); expect(daemon.stop).toHaveBeenCalledTimes(created ? 1 : 0);
  });
  it("waits for an owned local startup when quitting during a target switch", async () => {
    const f = fixture("stopped", true); const dead = fixture().control;
    dead.request.mockRejectedValue(new PlayerProtocolError("DAEMON_UNAVAILABLE", "No daemon"));
    let start!: () => void;
    const daemon = { start: vi.fn(() => new Promise<void>(resolve => { start = resolve; })), stop: vi.fn(async () => {}) };
    const controls = vi.fn().mockReturnValueOnce(dead).mockReturnValue(f.control);
    let switching: Promise<boolean>;
    await runPlayerTui({ remote: "lounge" }, {
      createApi: () => f.api as unknown as GroovenetClient,
      createRemote: id => new RemotePlayerController(f.api as unknown as GroovenetClient, id),
      createControl: controls as () => PlayerControlClient, createDaemon: () => daemon as unknown as PlayerDaemon,
      render: node => ({ waitUntilExit: async () => {
        switching = propsOf(node).targets!.select(""); await tick(); start();
      } }),
    });
    await switching!; expect(daemon.stop).toHaveBeenCalledOnce(); expect(f.control.close).toHaveBeenCalledOnce();
    expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
  });
  it("cleans up a failed lazy local startup and preserves remote selection", async () => {
    const f = fixture("stopped", true); const dead = fixture().control;
    dead.request.mockRejectedValue(new PlayerProtocolError("DAEMON_UNAVAILABLE", "No daemon"));
    const daemon = { start: vi.fn(async () => { throw new Error("mpv unavailable"); }), stop: vi.fn(async () => {}) };
    await runPlayerTui({ remote: "lounge" }, {
      createApi: () => f.api as unknown as GroovenetClient,
      createRemote: id => new RemotePlayerController(f.api as unknown as GroovenetClient, id),
      createControl: () => dead as unknown as PlayerControlClient, createDaemon: () => daemon as unknown as PlayerDaemon,
      render: node => ({ waitUntilExit: async () => {
        const targets = propsOf(node).targets!; expect(await targets.select("")).toBe(false); expect(targets.active.id).toBe("lounge"); expect(targets.problem).toBe("mpv unavailable");
      } }),
    });
    expect(dead.close).toHaveBeenCalledOnce(); expect(daemon.stop).toHaveBeenCalledOnce(); expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
  });
});
