import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NowPlayingSnapshot } from "@/types/nowPlaying";

type PublishCall = [string, string | Buffer, Record<string, unknown>, (error?: Error) => void];

function fakeClient() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const publishCalls: PublishCall[] = [];
  return {
    publish: vi.fn((topic: string, payload: string | Buffer, opts: Record<string, unknown>, cb: (error?: Error) => void) => {
      publishCalls.push([topic, payload, opts, cb]);
      cb();
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    end: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.(...args);
    },
    publishCalls,
  };
}

const connect = vi.hoisted(() => vi.fn());
vi.mock("mqtt", () => ({ connect }));

const resizeCoverArt = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/nowPlayingCover", () => ({ resizeCoverArt }));

const savedEnv = { ...process.env };

function snapshot(overrides: Partial<NowPlayingSnapshot> = {}): NowPlayingSnapshot {
  return {
    source_id: "src-1",
    state: "playing",
    track: {
      track_id: "track-a",
      friend_id: 1,
      title: "Voodoo Ray",
      artist: "A Guy Called Gerald",
      album: "Hot Lemonade",
      position: "A1",
      release_id: "rel-1",
      year: "1988",
      bpm: "124",
      key: "Am",
      genres: ["House"],
      duration_seconds: 420,
      cover_url: "https://example.com/cover.jpg",
    },
    offset_seconds: 30,
    observed_at: "2026-10-01T20:00:00.000Z",
    confidence: 0.94,
    ...overrides,
  };
}

function topicPayloads(client: ReturnType<typeof fakeClient>) {
  return Object.fromEntries(client.publishCalls.map(([topic, payload]) => [topic, payload]));
}

describe("nowPlayingPublisherService", () => {
  let client: ReturnType<typeof fakeClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...savedEnv };
    delete process.env.MQTT_URL;
    delete process.env.MQTT_USERNAME;
    delete process.env.MQTT_PASSWORD;
    delete process.env.MQTT_TOPIC_PREFIX;
    delete process.env.MQTT_HA_DISCOVERY;
    client = fakeClient();
    connect.mockReturnValue(client);
    resizeCoverArt.mockResolvedValue(Buffer.from("jpeg-bytes"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  it("never connects when MQTT_URL is unset", async () => {
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());

    expect(connect).not.toHaveBeenCalled();
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("connects once, with credentials, when MQTT_URL is set", async () => {
    process.env.MQTT_URL = "mqtt://homeassistant.local:1883";
    process.env.MQTT_USERNAME = "groovenet";
    process.env.MQTT_PASSWORD = "secret";
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());
    await publishSnapshot(snapshot());

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith("mqtt://homeassistant.local:1883", {
      username: "groovenet",
      password: "secret",
    });
  });

  it("publishes every field topic, retained, under the default prefix", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());

    const payloads = topicPayloads(client);
    expect(payloads["groovenet/now_playing/src-1/state"]).toBe("playing");
    expect(payloads["groovenet/now_playing/src-1/title"]).toBe("Voodoo Ray");
    expect(payloads["groovenet/now_playing/src-1/artist"]).toBe("A Guy Called Gerald");
    expect(payloads["groovenet/now_playing/src-1/album"]).toBe("Hot Lemonade");
    expect(payloads["groovenet/now_playing/src-1/position"]).toBe("A1");
    expect(payloads["groovenet/now_playing/src-1/cover_url"]).toBe("https://example.com/cover.jpg");

    const json = JSON.parse(payloads["groovenet/now_playing/src-1/json"] as string);
    expect(json).toMatchObject({
      state: "playing",
      track_id: "track-a",
      title: "Voodoo Ray",
      offset_seconds: 30,
      observed_at: "2026-10-01T20:00:00.000Z",
      confidence: 0.94,
    });

    for (const [, , opts] of client.publishCalls) {
      expect(opts).toMatchObject({ retain: true });
    }
  });

  it("honors a custom topic prefix", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    process.env.MQTT_TOPIC_PREFIX = "aswitch/vinyl";
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());

    expect(topicPayloads(client)["aswitch/vinyl/src-1/state"]).toBe("playing");
  });

  it("publishes empty retained values when idle, clearing the display", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    resizeCoverArt.mockResolvedValue(null);
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot({ state: "idle", track: null, offset_seconds: null, observed_at: null, confidence: null }));

    const payloads = topicPayloads(client);
    expect(payloads["groovenet/now_playing/src-1/state"]).toBe("idle");
    expect(payloads["groovenet/now_playing/src-1/title"]).toBe("");
    expect(payloads["groovenet/now_playing/src-1/cover_url"]).toBe("");
    expect(payloads["groovenet/now_playing/src-1/cover"]).toBe("");

    const json = JSON.parse(payloads["groovenet/now_playing/src-1/json"] as string);
    expect(json).toMatchObject({ state: "idle", track_id: null, title: null });
    expect(resizeCoverArt).toHaveBeenCalledWith(null);
  });

  it("publishes the resized cover bytes it gets back", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    resizeCoverArt.mockResolvedValue(Buffer.from("small-jpeg"));
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());

    expect(resizeCoverArt).toHaveBeenCalledWith("https://example.com/cover.jpg");
    expect(topicPayloads(client)["groovenet/now_playing/src-1/cover"]).toEqual(Buffer.from("small-jpeg"));
  });

  it("clears the cover topic when resizing fails", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    resizeCoverArt.mockResolvedValue(null);
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());

    expect(topicPayloads(client)["groovenet/now_playing/src-1/cover"]).toBe("");
  });

  // ─── Home Assistant discovery ───────────────────────────────────────────────

  it("publishes HA discovery once per source, retained", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());
    await publishSnapshot(snapshot());

    const discoveryCalls = client.publishCalls.filter(([topic]) => topic.startsWith("homeassistant/sensor/"));
    expect(discoveryCalls).toHaveLength(1);
    expect(discoveryCalls[0][0]).toBe("homeassistant/sensor/groovenet_now_playing_src-1/config");
    expect(discoveryCalls[0][2]).toMatchObject({ retain: true });

    const config = JSON.parse(discoveryCalls[0][1] as string);
    expect(config).toMatchObject({
      state_topic: "groovenet/now_playing/src-1/state",
      json_attributes_topic: "groovenet/now_playing/src-1/json",
    });
  });

  it("skips HA discovery when MQTT_HA_DISCOVERY is false", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    process.env.MQTT_HA_DISCOVERY = "false";
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());

    expect(client.publishCalls.some(([topic]) => topic.startsWith("homeassistant/"))).toBe(false);
  });

  // ─── failure must never throw ───────────────────────────────────────────────

  it("logs a publish failure instead of throwing", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    client.publish.mockImplementation((_topic: string, _payload: unknown, _opts: unknown, cb: (e?: Error) => void) => {
      cb(new Error("broker unreachable"));
    });
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await expect(publishSnapshot(snapshot())).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("publish to"), expect.any(Error));
  });

  it("logs, but never throws, when the client itself errors", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());
    client.emit("error", new Error("connection refused"));

    expect(console.error).toHaveBeenCalledWith("[now-playing] mqtt error:", expect.any(Error));
  });

  it("swallows an error from anywhere in the publish path, logging it once", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    resizeCoverArt.mockRejectedValue(new Error("unexpected"));
    const { publishSnapshot } = await import("../nowPlayingPublisherService");

    await expect(publishSnapshot(snapshot())).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("publish failed for src-1"),
      expect.any(Error)
    );
  });

  // ─── connect() / test reset ─────────────────────────────────────────────────

  it("connect() is a no-op without MQTT_URL", async () => {
    const { nowPlayingPublisherService } = await import("../nowPlayingPublisherService");

    nowPlayingPublisherService.connect();
    expect(connect).not.toHaveBeenCalled();
  });

  it("connect() opens the connection when MQTT_URL is set", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    const { nowPlayingPublisherService } = await import("../nowPlayingPublisherService");

    nowPlayingPublisherService.connect();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("resetNowPlayingPublisherForTests ends the client and clears discovery bookkeeping", async () => {
    process.env.MQTT_URL = "mqtt://broker";
    const { publishSnapshot, resetNowPlayingPublisherForTests } = await import("../nowPlayingPublisherService");

    await publishSnapshot(snapshot());
    expect(connect).toHaveBeenCalledTimes(1);

    resetNowPlayingPublisherForTests();
    expect(client.end).toHaveBeenCalledWith(true);

    const secondClient = fakeClient();
    connect.mockReturnValue(secondClient);
    await publishSnapshot(snapshot());

    expect(connect).toHaveBeenCalledTimes(2);
    // Discovery bookkeeping was cleared too: the fresh client gets its own discovery publish.
    expect(secondClient.publishCalls.some(([topic]) => topic.startsWith("homeassistant/"))).toBe(true);
  });
});
