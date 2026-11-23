// Lost-output recovery (#1241): naming the speaker that went away, saying when
// it is back, reclaiming it on play, and the single retry on a quick return.
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerPlayer, ServerPlayerState, SpeakerObservation } from "@groovenet/contracts";
import type { Track } from "@groovenet/client";
import type { AudioDevice, PlaybackBackend, PlaybackSource } from "../types.js";
import { PlayerError } from "../types.js";
import {
  LOST_OUTPUT_RETRY_SETTLE_MS,
  LOST_OUTPUT_RETRY_WINDOW_MS,
  LOST_OUTPUT_WATCH_MS,
  ServerPlayerManager,
  lostOutputMessage,
  unknownSpeaker,
  type ServerPlayerErrorEvent,
  type ServerPlayerRecoveryEvent,
} from "./manager.js";
import { ServerPlayerError, type PlayerStore } from "./store.js";

const LOUNGE = "202481586338774";
const NAME = "Lounge Room Audio";

/** What OwnTone lists right now, shared by every backend the worker creates. */
class Engine {
  outputs: AudioDevice[] = [{ id: LOUNGE, name: NAME }];
  /** Makes every listing time out, like an engine stuck on the receiver. */
  hung = false;
  list = async (): Promise<AudioDevice[]> => {
    if (this.hung) throw new PlayerError("ENGINE_TIMEOUT", "OwnTone API request timed out");
    return structuredClone(this.outputs);
  };
  drop() {
    this.outputs = this.outputs.filter((output) => output.id !== LOUNGE);
  }
  restore() {
    this.drop();
    this.outputs.push({ id: LOUNGE, name: NAME });
  }
}

class FakeBackend extends EventEmitter implements PlaybackBackend {
  constructor(
    private readonly engine: Engine,
    readonly output: string | undefined,
  ) {
    super();
  }
  load = vi.fn(async (_source: PlaybackSource) => {
    void _source;
  });
  pause = vi.fn(async (_paused: boolean) => {
    void _paused;
  });
  seek = vi.fn(async (_seconds: number) => {
    void _seconds;
  });
  setVolume = vi.fn(async (_volume: number) => {
    void _volume;
  });
  listDevices = vi.fn(() => this.engine.list());
  outputConnection = vi.fn(async () => "connected" as const);
  setOutputDevice = vi.fn(async (_id: string) => {
    void _id;
  });
  close = vi.fn(async () => {});
}

class MemoryStore implements PlayerStore {
  rows = new Map<string, ServerPlayer>();
  queuePlay = vi.fn(async () => {});
  pendingPlays = vi.fn(async () => []);
  markPlayLogged = vi.fn(async () => {});
  list = vi.fn(async () => structuredClone([...this.rows.values()]));
  create = vi.fn(
    async (input: { id: string; name: string; engine_id: string }, state: ServerPlayerState) => {
      const row = {
        ...input,
        availability_policy: "allow_unknown" as const,
        state,
        revision: 0,
        assigned_output: null,
      };
      this.rows.set(row.id, structuredClone(row));
      return structuredClone(row);
    },
  );
  save = vi.fn(async (input: ServerPlayer, revision: number) => {
    if (this.rows.get(input.id)?.revision !== revision)
      throw new ServerPlayerError("REVISION_CONFLICT", "Changed");
    const row = { ...structuredClone(input), revision: revision + 1 };
    this.rows.set(row.id, structuredClone(row));
    return row;
  });
  checkpoint = vi.fn(async (input: ServerPlayer) => {
    if (this.rows.get(input.id)?.revision === input.revision)
      this.rows.set(input.id, structuredClone(input));
  });
  resolve = vi.fn(
    async (ref: { track_id: string }) =>
      ({
        track_id: ref.track_id,
        friend_id: 1,
        title: `Track ${ref.track_id}`,
        artist: "Artist",
        local_audio_url: `${ref.track_id}.wav`,
      }) as Track,
  );
}

const outputLost = () =>
  new PlayerError(
    "PLAYBACK_INTERRUPTED",
    "OwnTone playback interrupted (output_lost); the queue has not advanced.",
    { reason: "output_lost" },
  );

async function fixture(
  options: {
    observed?: SpeakerObservation;
    store?: MemoryStore;
    engine?: Engine;
    create?: boolean;
  } = {},
) {
  const store = options.store ?? new MemoryStore();
  const engine = options.engine ?? new Engine();
  const backends: FakeBackend[] = [];
  const create = vi.fn((output?: string) => {
    const backend = new FakeBackend(engine, output);
    backends.push(backend);
    return backend;
  });
  const observe = vi.fn(async () => options.observed ?? unknownSpeaker());
  const manager = new ServerPlayerManager(
    store,
    { primary: { libraryRoot: "/media", create } },
    observe,
  );
  const errors: ServerPlayerErrorEvent[] = [];
  const recovery: ServerPlayerRecoveryEvent[] = [];
  const fault = vi.fn();
  manager.on("player-error", (event: ServerPlayerErrorEvent) => errors.push(event));
  manager.on("player-recovery", (event: ServerPlayerRecoveryEvent) => recovery.push(event));
  manager.on("fault", fault);
  await manager.initialize();
  if (options.create !== false) {
    await manager.create({ id: "lounge", name: "Lounge", engine_id: "primary" });
    await manager.command("lounge", {
      type: "queue.add",
      tracks: [
        { track_id: "cumbia-beckiana", friend_id: 1 },
        { track_id: "next", friend_id: 1 },
      ],
    } as never);
    await manager.command("lounge", { type: "output.select", output_id: LOUNGE } as never);
  }
  const play = () => manager.command("lounge", { type: "play" } as never);
  return { store, engine, backends, create, manager, errors, recovery, fault, play };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const playingBackend = (f: Fixture) =>
  [...f.backends].reverse().find((backend) => backend.load.mock.calls.length)!;
const loads = (f: Fixture) =>
  f.backends.reduce((total, backend) => total + backend.load.mock.calls.length, 0);
/** Every backend created from now on fails its load, like a receiver with no DAC. */
function failLoads(f: Fixture, error: PlayerError) {
  f.create.mockImplementation((output?: string) => {
    const backend = new FakeBackend(f.engine, output);
    backend.load.mockRejectedValue(error);
    f.backends.push(backend);
    return backend;
  });
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const errorOf = (f: Fixture) => f.manager.get("lounge").state.error;

/** Playing on the lounge, then OwnTone reports output_lost. */
async function lose(f: Fixture, { dropped = true } = {}) {
  // Clients list outputs with every snapshot, which is how the worker knows names.
  await f.manager.devices("lounge");
  await f.play();
  expect(f.manager.get("lounge")).toMatchObject({
    assigned_output: LOUNGE,
    state: { status: "playing" },
  });
  if (dropped) f.engine.drop();
  playingBackend(f).emit("error", outputLost());
  await tick(0);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-11-21T01:47:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("lost output details", () => {
  it("records which output went away, when, and what OwnTone said, keeping the queue", async () => {
    const f = await fixture();
    await lose(f);
    const player = f.manager.get("lounge");
    expect(player.assigned_output).toBeNull();
    expect(player.state).toMatchObject({
      status: "error",
      desired_output: LOUNGE,
      current_entry_id: player.state.queue[0]!.id,
    });
    expect(player.state.error).toEqual({
      code: "PLAYBACK_INTERRUPTED",
      message: `${NAME} went away during playback. The queue has not advanced; press play once it is back.`,
      output: {
        id: LOUNGE,
        name: NAME,
        lost_at: "2026-11-21T01:47:00.000Z",
        reason: "output_lost",
        detail: "OwnTone reported the output lost during playback",
        back_at: null,
      },
    });
    // The worker log line carries the lost output too.
    expect(f.errors.at(-1)).toMatchObject({ code: "PLAYBACK_INTERRUPTED", output: { id: LOUNGE } });
    await f.manager.shutdown();
  });

  it("names the output from its first listing when the loss came before any listing", async () => {
    // A fresh worker that has never listed outputs does not know the name yet.
    const f = await fixture();
    await f.play();
    playingBackend(f).emit("error", outputLost());
    await tick(0);
    expect(errorOf(f)?.output?.name).toBeNull();
    expect(errorOf(f)?.message).toMatch(/^The speaker went away/);
    await tick(1000);
    expect(errorOf(f)?.output?.name).toBe(NAME);
    expect(errorOf(f)?.message).toMatch(new RegExp(`^${NAME} went away`));
    // Still listed throughout, so it never claims to be "back" or retries.
    await tick(LOST_OUTPUT_RETRY_WINDOW_MS);
    expect(errorOf(f)?.output?.back_at).toBeNull();
    expect(loads(f)).toBe(1);
    await f.manager.shutdown();
  });

  it("does not attach output details to errors that are not about the output", async () => {
    const f = await fixture();
    await f.play();
    playingBackend(f).emit("error", new PlayerError("STREAM_FAILED", "bad file"));
    playingBackend(f).emit("error", new PlayerError("ENGINE_TIMEOUT", "timed out"));
    await tick(0);
    expect(errorOf(f)).toEqual({ code: "STREAM_FAILED", message: "bad file" });
    await f.manager.shutdown();
  });

  it("writes a message for each reason, and for a retry that failed", () => {
    const base = { id: LOUNGE, name: NAME, lost_at: "t", detail: null };
    expect(lostOutputMessage({ ...base, reason: "not_listed" })).toMatch(
      /isn't listed by OwnTone right now\. Wait for the receiver to come back, or choose a speaker in Play on → Speaker details\./,
    );
    expect(lostOutputMessage({ ...base, reason: "activation_failed" })).toMatch(
      /^OwnTone couldn't start Lounge Room Audio\. It may be listed without a working audio device/,
    );
    expect(lostOutputMessage({ ...base, reason: "engine_timeout" })).toMatch(
      /^OwnTone stopped answering while reaching Lounge Room Audio/,
    );
    expect(lostOutputMessage({ ...base, reason: "disconnected", name: null })).toMatch(
      /^The speaker went away during playback/,
    );
    expect(lostOutputMessage({ ...base, reason: "output_lost", retried: true })).toMatch(
      /^Tried once more after Lounge Room Audio came back; it failed again\. Lounge Room Audio went away/,
    );
    expect(lostOutputMessage({ ...base, reason: "output_lost", back_at: "t2" })).toBe(
      "Lounge Room Audio is back — press play to resume.",
    );
  });
});

describe("the issue's timeline, end to end", () => {
  it("replays output_lost → ENGINE_TIMEOUT → DEVICE_UNAVAILABLE → back → play reclaims", async () => {
    const f = await fixture();
    // 01:47:41Z PLAYBACK_INTERRUPTED (output_lost): Shairport exited, the output is gone.
    vi.setSystemTime(new Date("2026-11-21T01:47:41.000Z"));
    await lose(f);
    const lostAt = "2026-11-21T01:47:41.000Z";
    expect(errorOf(f)?.output).toMatchObject({ lost_at: lostAt, reason: "output_lost" });

    // Someone presses play while OwnTone is stuck on the receiver: ENGINE_TIMEOUT.
    f.engine.hung = true;
    await tick(LOST_OUTPUT_RETRY_WINDOW_MS - 10_000);
    await expect(f.play()).rejects.toMatchObject({ code: "ENGINE_TIMEOUT" });
    expect(errorOf(f)).toMatchObject({
      code: "ENGINE_TIMEOUT",
      message: expect.stringMatching(/^OwnTone stopped answering while reaching Lounge Room Audio/),
      output: { lost_at: lostAt, reason: "engine_timeout", back_at: null },
    });

    // Play again: OwnTone answers, without the output. One listing, a clear refusal,
    // and no engine writes (no new load, no select).
    f.engine.hung = false;
    const before = loads(f);
    await expect(f.play()).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    expect(loads(f)).toBe(before);
    expect(errorOf(f)).toMatchObject({
      code: "DEVICE_UNAVAILABLE",
      message: `${NAME} isn't listed by OwnTone right now. Wait for the receiver to come back, or choose a speaker in Play on → Speaker details.`,
      output: { lost_at: lostAt, reason: "not_listed" },
    });
    expect(f.manager.get("lounge")).toMatchObject({
      assigned_output: null,
      state: { desired_output: LOUNGE, status: "error" },
    });

    // The output reappears. People pressed play since the loss, so the worker
    // does not retry by itself; it says the speaker is back.
    f.engine.restore();
    await tick(1000);
    expect(errorOf(f)).toMatchObject({
      code: "DEVICE_UNAVAILABLE",
      message: "Lounge Room Audio is back — press play to resume.",
      output: { lost_at: lostAt, back_at: expect.any(String) },
    });
    expect(loads(f)).toBe(before);
    expect(f.recovery.map((event) => event.action)).toEqual(["back"]);

    // Play reselects and claims the remembered output, at the saved position.
    await f.play();
    expect(f.manager.get("lounge")).toMatchObject({
      assigned_output: LOUNGE,
      state: { status: "playing", error: null, desired_output: LOUNGE },
    });
    expect(playingBackend(f).output).toBe(LOUNGE);
    expect(f.fault).not.toHaveBeenCalled();
    await f.manager.shutdown();
  });
});

describe("play after a loss", () => {
  it("reclaims the remembered output when it is listed again", async () => {
    const f = await fixture();
    await lose(f);
    f.engine.restore();
    await f.play();
    expect(f.manager.get("lounge")).toMatchObject({
      assigned_output: LOUNGE,
      state: { status: "playing", error: null },
    });
    expect(f.create).toHaveBeenLastCalledWith(LOUNGE);
    // The loss is closed: a later, unrelated error carries no stale output.
    playingBackend(f).emit("error", new PlayerError("STREAM_FAILED", "bad file"));
    await tick(0);
    expect(errorOf(f)?.output).toBeUndefined();
    await f.manager.shutdown();
  });

  it("resume from a paused checkpoint reclaims it too", async () => {
    const f = await fixture();
    await lose(f);
    f.engine.restore();
    await f.manager.command("lounge", { type: "resume" } as never);
    expect(f.manager.get("lounge").assigned_output).toBe(LOUNGE);
    await f.manager.shutdown();
  });

  it("says clearly when the engine cannot activate the listed output", async () => {
    const f = await fixture();
    await lose(f);
    f.engine.restore();
    // Listed, but OwnTone cannot activate it: the receiver has no audio device.
    failLoads(
      f,
      new PlayerError("DEVICE_UNAVAILABLE", "could not select", { reason: "activation_failed" }),
    );
    await expect(f.play()).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    expect(errorOf(f)).toMatchObject({
      message: expect.stringMatching(/^OwnTone couldn't start Lounge Room Audio/),
      output: { reason: "activation_failed", back_at: null },
    });
    expect(f.manager.get("lounge").assigned_output).toBeNull();
    await f.manager.shutdown();
  });

  it("records a first-time output failure on play, with no earlier loss", async () => {
    const f = await fixture();
    f.engine.drop();
    f.create.mockImplementationOnce((output?: string) => {
      const backend = new FakeBackend(f.engine, output);
      backend.load.mockRejectedValue(
        new PlayerError("DEVICE_UNAVAILABLE", "OwnTone output is unavailable", {
          reason: "not_listed",
        }),
      );
      f.backends.push(backend);
      return backend;
    });
    await expect(f.play()).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    expect(errorOf(f)?.output).toMatchObject({ id: LOUNGE, reason: "not_listed" });
    // A failed play is never retried by the worker, only reported back.
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(errorOf(f)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    expect(loads(f)).toBe(1);
    await f.manager.shutdown();
  });

  it("a newly chosen speaker ends the old loss", async () => {
    const f = await fixture();
    await lose(f);
    await f.manager.command("lounge", { type: "output.select", output_id: "other" } as never);
    // Choosing keeps the error visible (it is still the session's state) but
    // the watcher stops: nothing is retried or marked back for the old output.
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 2000);
    expect(loads(f)).toBe(1);
    expect(f.recovery).toEqual([]);
    await f.manager.shutdown();
  });
});

describe("one retry on a quick return", () => {
  it("retries once when the output is back inside the window and settled", async () => {
    const f = await fixture();
    await lose(f);
    await tick(1000); // seen missing
    f.engine.restore();
    await tick(1000);
    // Listed, but not yet for the settle period: no retry yet.
    expect(loads(f)).toBe(1);
    expect(f.manager.get("lounge").state.status).toBe("error");
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS);
    expect(loads(f)).toBe(2);
    expect(f.manager.get("lounge")).toMatchObject({
      assigned_output: LOUNGE,
      state: { status: "playing", error: null },
    });
    expect(f.recovery.map((event) => event.action)).toEqual(["retry"]);
    // It resumes the same entry: the queue never advances (#898).
    expect(f.manager.get("lounge").state.current_entry_id).toBe(
      f.manager.get("lounge").state.queue[0]!.id,
    );
    await f.manager.shutdown();
  });

  it("does not retry a return outside the window; it says the speaker is back", async () => {
    const f = await fixture();
    await lose(f);
    await tick(LOST_OUTPUT_RETRY_WINDOW_MS + 1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 6000);
    expect(loads(f)).toBe(1);
    expect(errorOf(f)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    await f.manager.shutdown();
  });

  it("does not retry when the return only settles after the window closes", async () => {
    const f = await fixture();
    await lose(f);
    await tick(LOST_OUTPUT_RETRY_WINDOW_MS - 2000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 2000);
    expect(loads(f)).toBe(1);
    expect(errorOf(f)?.output?.back_at).toEqual(expect.any(String));
    await f.manager.shutdown();
  });

  it("counts an engine that cannot answer as gone", async () => {
    const f = await fixture();
    await lose(f, { dropped: false });
    f.engine.hung = true;
    await tick(1000);
    f.engine.hung = false;
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 2000);
    expect(loads(f)).toBe(2);
    await f.manager.shutdown();
  });

  it("never retries a loss that happened while paused", async () => {
    const f = await fixture();
    await f.play();
    await f.manager.command("lounge", { type: "pause" } as never);
    f.engine.drop();
    playingBackend(f).emit(
      "error",
      new PlayerError("DEVICE_UNAVAILABLE", "disconnected", { reason: "disconnected" }),
    );
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 2000);
    expect(loads(f)).toBe(1);
    expect(errorOf(f)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    await f.manager.shutdown();
  });

  it("never retries after any command since the loss", async () => {
    const f = await fixture();
    await lose(f);
    await f.manager.command("lounge", { type: "volume", volume: 20 } as never);
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 2000);
    expect(loads(f)).toBe(1);
    expect(errorOf(f)?.output?.back_at).toEqual(expect.any(String));
    await f.manager.shutdown();
  });

  it("does not loop: a retry that fails is reported, and its return only says back", async () => {
    const f = await fixture();
    await lose(f);
    await tick(1000);
    f.engine.restore();
    failLoads(
      f,
      new PlayerError("DEVICE_UNAVAILABLE", "could not select", { reason: "activation_failed" }),
    );
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(f.recovery.map((event) => event.action)).toEqual(["retry", "retry_failed"]);
    expect(errorOf(f)).toMatchObject({
      message: expect.stringMatching(/^Tried once more after Lounge Room Audio came back/),
      output: { retried: true, reason: "activation_failed" },
    });
    const attempts = loads(f);
    await tick(LOST_OUTPUT_RETRY_WINDOW_MS);
    expect(loads(f)).toBe(attempts);
    expect(errorOf(f)?.output).toMatchObject({ retried: true, back_at: expect.any(String) });
    expect(f.fault).not.toHaveBeenCalled();
    await f.manager.shutdown();
  });

  it("does not loop on a flapping receiver: one automatic retry until someone acts", async () => {
    const f = await fixture();
    await lose(f);
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(loads(f)).toBe(2);
    // Lost again right after the retry: reported and marked back, not retried.
    f.engine.drop();
    playingBackend(f).emit("error", outputLost());
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(loads(f)).toBe(2);
    expect(errorOf(f)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    // After a person's command, a later loss may be retried again.
    await f.play();
    f.engine.drop();
    playingBackend(f).emit("error", outputLost());
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(loads(f)).toBe(4);
    await f.manager.shutdown();
  });

  it("only marks the speaker back when the retry is refused before any engine effect", async () => {
    const f = await fixture({
      observed: {
        availability: "occupied",
        observed_at: "now",
        source: "home_assistant",
        sender_identity: "foreign",
      },
    });
    // Occupancy only matters for reconnects; play once with takeover to start.
    await f.manager.command("lounge", { type: "play", takeover: true } as never);
    f.engine.drop();
    playingBackend(f).emit("error", outputLost());
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(f.recovery.map((event) => event.action)).toEqual(["retry", "retry_failed", "back"]);
    expect(errorOf(f)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    expect(loads(f)).toBe(1);
    await f.manager.shutdown();
  });

  it("records a retry that fails before play's own error handling", async () => {
    const f = await fixture();
    await lose(f);
    await tick(1000);
    f.engine.restore();
    // The retry's one listing times out: play() throws before touching the engine.
    f.manager.on("player-recovery", (event: ServerPlayerRecoveryEvent) => {
      if (event.action === "retry") f.engine.hung = true;
    });
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(f.recovery.map((event) => event.action)).toContain("retry_failed");
    expect(errorOf(f)).toMatchObject({
      code: "ENGINE_TIMEOUT",
      output: { retried: true, reason: "engine_timeout" },
    });
    await f.manager.shutdown();
  });
});

describe("watching and restarts", () => {
  it("stops polling after the watch period; a device listing still notices the return", async () => {
    const f = await fixture();
    await lose(f);
    await tick(LOST_OUTPUT_WATCH_MS + 10_000);
    const listings = f.backends.reduce((n, b) => n + b.listDevices.mock.calls.length, 0);
    await tick(60_000);
    expect(f.backends.reduce((n, b) => n + b.listDevices.mock.calls.length, 0)).toBe(listings);
    f.engine.restore();
    const devices = await f.manager.devices("lounge");
    expect(devices.map((device) => device.id)).toContain(LOUNGE);
    await tick(0);
    expect(errorOf(f)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    await f.manager.shutdown();
  });

  it("restores a persisted loss after a worker restart, reports its return, never retries", async () => {
    const f = await fixture();
    await lose(f);
    await f.manager.shutdown();
    const restarted = await fixture({ store: f.store, engine: f.engine, create: false });
    expect(errorOf(restarted)?.output).toMatchObject({ id: LOUNGE, reason: "output_lost" });
    // A restored output_lost was not seen gone by this worker: a listing alone
    // proves nothing until it has been missing or refused.
    f.engine.restore();
    await tick(2000);
    expect(errorOf(restarted)?.output?.back_at).toBeNull();
    f.engine.drop();
    await tick(1000);
    f.engine.restore();
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(errorOf(restarted)?.message).toBe("Lounge Room Audio is back — press play to resume.");
    expect(loads(restarted)).toBe(0);
    await restarted.manager.shutdown();
  });

  it("ignores listings once the player has moved on", async () => {
    const f = await fixture();
    await lose(f);
    await f.manager.command("lounge", { type: "stop" } as never);
    f.engine.restore();
    await f.manager.devices("lounge");
    await tick(LOST_OUTPUT_RETRY_SETTLE_MS + 1000);
    expect(errorOf(f)).toBeNull();
    expect(f.recovery).toEqual([]);
    await f.manager.shutdown();
  });
});
