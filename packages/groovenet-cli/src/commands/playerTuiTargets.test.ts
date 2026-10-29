import { describe, expect, it, vi } from "vitest";
import type { ServerPlayer } from "@groovenet/contracts";
import { upcomingLocal } from "./playerTuiTargets.js";
import { fixture, server, ref } from "../../test/targets.js";
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("runtime targets", () => {
  it("extracts upcoming entries, preserving order, duplicates and each library", () => {
    const f = fixture();
    expect(upcomingLocal(f.snapshot())).toEqual([ref, ref, { ...ref, friend_id: 3 }]);
    expect(upcomingLocal({ ...f.snapshot(), current: null })).toHaveLength(4);
    expect(upcomingLocal({ ...f.snapshot(), current: null, status: "ended" })).toEqual([]);
  });
  it.each(["playing", "stopped"] as const)(
    "joins a %s server atomically and finalizes local only on success",
    async (status) => {
      const f = fixture();
      f.states.set("lounge", server("lounge", status));
      await f.preview();
      expect(await f.targets.select("lounge")).toBe(true);
      expect(f.api.commandServerPlayer).toHaveBeenCalledExactlyOnceWith("lounge", {
        type: "session.join",
        expected_revision: 3,
        tracks: [ref, ref, { ...ref, friend_id: 3 }],
      });
      expect(f.control.request.mock.calls.map((call) => call[0])).toEqual([
        "status",
        "pause",
        "status",
        "status",
        "stop",
        "queue.remove",
        "queue.remove",
        "queue.remove",
        "queue.remove",
      ]);
      expect(f.snapshot().queue).toEqual([]);
      expect(await f.targets.select("lounge")).toBe(true);
      expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
      await f.targets.close();
    },
  );
  it.each(["stopped", "ended"] as const)("handles a %s local queue", async (status) => {
    const f = fixture(status);
    await f.preview();
    await f.targets.select("lounge");
    expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(status === "ended" ? 0 : 1);
    if (status === "stopped")
      expect(f.api.commandServerPlayer.mock.calls[0]![1]).toMatchObject({
        tracks: f.local.snapshot.queue.map((e) => ({
          track_id: e.track.track_id,
          friend_id: e.track.friend_id,
        })),
      });
    await f.targets.close();
  });
  it("attaches empty queues, switches server to server, and returns local without audio commands", async () => {
    const f = fixture("stopped", true);
    await f.preview();
    await f.targets.select("lounge");
    const old = f.remotes[0]!;
    const close = vi.spyOn(old, "close");
    await f.preview("study");
    await f.targets.select("study");
    expect(close).toHaveBeenCalledOnce();
    expect(f.targets.active.id).toBe("study");
    await f.targets.select("");
    expect(f.targets.active.id).toBe("");
    expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
    expect(f.control.request).toHaveBeenCalledExactlyOnceWith("status");
    await f.targets.close();
  });
  it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED"])(
    "requires explicit acknowledgement of %s and preserves the exact join",
    async (code) => {
      const f = fixture();
      await f.preview();
      f.api.commandServerPlayer.mockRejectedValueOnce(
        Object.assign(new Error("Speaker needs confirmation"), { data: { code } }),
      );
      expect(await f.targets.select("lounge")).toBe(false);
      expect(f.snapshot().queue).toHaveLength(4);
      expect(f.targets.active.id).toBe("");
      expect(f.targets.confirmation?.code).toBe(code);
      expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
      expect(await f.targets.acknowledge()).toBe(true);
      expect(f.api.commandServerPlayer.mock.lastCall?.[1]).toEqual({
        type: "session.join",
        expected_revision: 3,
        tracks: [ref, ref, { ...ref, friend_id: 3 }],
        [code === "AVAILABILITY_UNKNOWN" ? "allow_unknown" : "takeover"]: true,
      });
      await f.targets.close();
    },
  );
  it("cancels acknowledgement without losing local tracks or replaying", async () => {
    const f = fixture();
    await f.preview();
    f.api.commandServerPlayer.mockRejectedValueOnce(
      Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }),
    );
    await f.targets.select("lounge");
    await f.targets.cancel();
    expect(await f.targets.acknowledge()).toBe(false);
    expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
    expect(f.snapshot().queue).toHaveLength(4);
    await f.targets.close();
  });
  it.each(["queue", "revision"])("fences acknowledgement after %s changes", async (change) => {
    const f = fixture();
    await f.preview();
    f.api.commandServerPlayer.mockRejectedValueOnce(
      Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }),
    );
    await f.targets.select("lounge");
    if (change === "queue") f.update({ ...f.snapshot(), queue: f.snapshot().queue.slice(1) });
    else {
      f.states.set("lounge", { ...server(), revision: 4 });
      await f.remotes[0]!.refresh();
    }
    expect(await f.targets.acknowledge()).toBe(false);
    expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
    expect(f.targets.problem).toContain("changed");
    await f.targets.close();
  });
  it("never loses a queue on command refusal, discovery failure or disconnected preview", async () => {
    const f = fixture();
    expect(await f.targets.select("lounge")).toBe(false);
    f.api.getServerPlayer.mockRejectedValueOnce(new Error("Denied"));
    await f.preview();
    expect(f.targets.problem).toBe("Denied");
    await f.preview();
    f.api.commandServerPlayer.mockRejectedValueOnce(new Error("DEVICE_BUSY"));
    expect(await f.targets.select("lounge")).toBe(false);
    expect(f.snapshot().queue).toHaveLength(4);
    f.observers.get("lounge")!.disconnect();
    await tick();
    expect(await f.targets.select("lounge")).toBe(false);
    expect(f.targets.problem).toContain("fresh target preview");
    await f.targets.close();
  });
  it("fences rapid previews, late responses and close during a request", async () => {
    const f = fixture();
    let resolve!: (value: ServerPlayer) => void;
    f.api.getServerPlayer.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const old = f.targets.previewTarget("lounge");
    await tick();
    await f.preview("study");
    resolve(server());
    await old;
    expect(f.targets.preview?.player?.id).toBe("study");
    await f.targets.close();
    expect(await f.targets.select("study")).toBe(false);
    expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
  });
  it("fences repeated submissions and preserves committed joins if local cleanup fails", async () => {
    const f = fixture();
    await f.preview();
    let resolve!: (value: { player: ServerPlayer }) => void;
    f.api.commandServerPlayer.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const joining = f.targets.select("lounge");
    await tick();
    expect(await f.targets.select("lounge")).toBe(false);
    expect(await f.targets.cancel()).toBe(false);
    f.control.request.mockRejectedValueOnce(new Error("Local unavailable"));
    resolve({ player: { ...server(), revision: 4 } });
    expect(await joining).toBe(true);
    expect(f.targets.active.id).toBe("lounge");
    expect(f.targets.problem).toContain("Local cleanup needs review");
    await f.targets.select("lounge");
    expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
    await f.targets.close();
  });
});

it("retries an ambiguous join with its original revision, even after reopening", async () => {
  const f = fixture();
  await f.preview();
  f.api.commandServerPlayer.mockImplementationOnce(async () => {
    f.states.set("lounge", { ...server(), revision: 4 });
    throw new Error("Reply lost");
  });
  expect(await f.targets.select("lounge")).toBe(false);
  await f.targets.cancel();
  await f.preview();
  expect(await f.targets.select("lounge")).toBe(false);
  expect(f.api.commandServerPlayer.mock.calls.map((call) => call[1].expected_revision)).toEqual([
    3, 3,
  ]);
  expect(f.snapshot().queue).toHaveLength(4);
  expect(f.targets.problem).toBe("REVISION_CONFLICT");
  await f.targets.close();
});
it("blocks remerging retained entries after a committed join and failed cleanup", async () => {
  const f = fixture();
  await f.preview();
  f.control.request
    .mockImplementationOnce(async () => f.snapshot())
    .mockImplementationOnce(async () => f.snapshot())
    .mockImplementationOnce(async () => f.snapshot())
    .mockRejectedValueOnce("socket gone");
  expect(await f.targets.select("lounge")).toBe(true);
  expect(f.targets.problem).toContain("socket gone");
  await f.targets.select("");
  await f.preview();
  expect(await f.targets.select("lounge")).toBe(false);
  expect(f.targets.problem).toContain("Previously joined entries");
  expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
  await f.targets.close();
});
it("retains queues changed during pause or after join, and handles local request failures", async () => {
  const f = fixture();
  await f.preview();
  f.control.request
    .mockImplementationOnce(async () => f.snapshot())
    .mockImplementationOnce(async () => {
      f.update({ ...f.snapshot(), queue: f.snapshot().queue.slice(1) });
      return f.snapshot();
    });
  expect(await f.targets.select("lounge")).toBe(false);
  expect(f.targets.problem).toContain("Local queue changed");
  expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
  f.api.commandServerPlayer.mockImplementationOnce(async () => {
    f.update({ ...f.snapshot(), queue: f.snapshot().queue.slice(1) });
    return { player: { ...server(), revision: 4 } };
  });
  expect(await f.targets.select("lounge")).toBe(true);
  expect(f.targets.problem).toContain("Local queue changed after Join");
  await f.targets.close();
});
it("preserves only explicitly configured join policies", async () => {
  const f = fixture("loading");
  await f.preview();
  Object.assign(f.remotes[0]!.policy, { allow_unknown: true, takeover: false });
  await f.targets.select("lounge");
  expect(f.api.commandServerPlayer.mock.lastCall?.[1]).toMatchObject({
    type: "session.join",
    allow_unknown: true,
    takeover: false,
  });
  await f.targets.close();
});
it("handles non-Error preview/select/ack failures and fences close during Join", async () => {
  const f = fixture();
  f.api.getServerPlayer.mockRejectedValueOnce("offline");
  await f.preview();
  expect(f.targets.problem).toBe("offline");
  await f.preview();
  f.control.request.mockRejectedValueOnce("local offline");
  expect(await f.targets.select("lounge")).toBe(false);
  expect(f.targets.problem).toBe("local offline");
  f.api.commandServerPlayer.mockRejectedValueOnce(
    Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }),
  );
  await f.targets.select("lounge");
  f.control.request.mockRejectedValueOnce("status unavailable");
  expect(await f.targets.acknowledge()).toBe(false);
  expect(f.targets.problem).toBe("status unavailable");
  await f.targets.cancel();
  await f.preview();
  let resolve!: (value: { player: ServerPlayer }) => void;
  f.api.commandServerPlayer.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const joining = f.targets.select("lounge");
  await tick();
  await f.targets.close();
  resolve({ player: server() });
  expect(await joining).toBe(false);
  expect(f.snapshot().queue).toHaveLength(4);
});
it("ignores previews while joining or after closure, and closes a pending preview response", async () => {
  const f = fixture();
  let resolve!: (value: ServerPlayer) => void;
  f.api.getServerPlayer.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const preview = f.targets.previewTarget("lounge");
  await tick();
  await f.targets.close();
  resolve(server());
  await preview;
  await f.targets.previewTarget("study");
  expect(f.remotes).toHaveLength(1);
  const g = fixture();
  await g.preview();
  let commit!: (value: { player: ServerPlayer }) => void;
  g.api.commandServerPlayer.mockImplementationOnce(
    () =>
      new Promise((done) => {
        commit = done;
      }),
  );
  const join = g.targets.select("lounge");
  await tick();
  await g.targets.previewTarget("study");
  expect(g.remotes).toHaveLength(1);
  commit({ player: server() });
  await join;
  await g.targets.close();
});
it("fences an interactive transport response when the target is closed", async () => {
  const f = fixture("stopped", true);
  await f.preview();
  await f.targets.select("lounge");
  const remote = f.remotes[0]!;
  let resolve!: (value: { player: ServerPlayer }) => void;
  f.api.commandServerPlayer.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const command = remote.request("next");
  await tick();
  await f.targets.close();
  resolve({ player: server() });
  await expect(command).rejects.toThrow("Remote command did not complete");
});
it("refuses Join if pausing local audio fails", async () => {
  const f = fixture();
  await f.preview();
  f.control.request
    .mockResolvedValueOnce(f.snapshot())
    .mockRejectedValueOnce(new Error("Pause failed"));
  expect(await f.targets.select("lounge")).toBe(false);
  expect(f.api.commandServerPlayer).not.toHaveBeenCalled();
  expect(f.snapshot().queue).toHaveLength(4);
  await f.targets.close();
});
it("fences the preview boundary even if its controller returns after closure", async () => {
  const { RemotePlayerController } = await import("./remotePlayer.js");
  const f = fixture();
  let resolve!: () => void;
  const refresh = vi.spyOn(RemotePlayerController.prototype, "refresh").mockImplementationOnce(() =>
    new Promise<void>((done) => {
      resolve = done;
    }).then(() => ({ ...f.snapshot(), remote: { player: server(), connected: true } })),
  );
  const events = vi.spyOn(RemotePlayerController.prototype, "startEvents");
  try {
    const preview = f.targets.previewTarget("lounge");
    await tick();
    await f.targets.close();
    resolve();
    await preview;
    expect(events).not.toHaveBeenCalled();
  } finally {
    refresh.mockRestore();
    events.mockRestore();
  }
});
it("reviews an acknowledgement that disappears before the queued confirmation runs", async () => {
  const f = fixture();
  await f.preview();
  f.api.commandServerPlayer.mockRejectedValueOnce(
    Object.assign(new Error("Unknown"), { data: { code: "AVAILABILITY_UNKNOWN" } }),
  );
  await f.targets.select("lounge");
  f.remotes[0]!.session.dismissAcknowledgement();
  expect(await f.targets.acknowledge()).toBe(false);
  expect(f.targets.problem).toBe("Review the target and repeat Join.");
  expect(f.api.commandServerPlayer).toHaveBeenCalledTimes(1);
  expect(f.snapshot().queue).toHaveLength(4);
  await f.targets.close();
});
