import { connect, type IClientOptions, type MqttClient } from "mqtt";
import { resizeCoverArt } from "@/server/services/nowPlayingCover";
import type { NowPlayingSnapshot } from "@/types/nowPlaying";

/**
 * MQTT side of #465: turns a `NowPlayingSnapshot` into the retained topics a
 * display (an old Android phone, an ESP32, an e-ink panel) subscribes to —
 * the same idea as shairport-sync's `publish_parsed`/`publish_cover` for
 * AirPlay, but for what the listener hears off the mixer.
 *
 * Off entirely unless `MQTT_URL` is set, and a broker that is down or
 * unreachable must never slow or fail ingest: every publish call swallows its
 * own errors and only logs them. Reconnection is `mqtt`'s own default
 * behaviour — we never retry a publish ourselves.
 */

const DEFAULT_TOPIC_PREFIX = "groovenet/now_playing";
const HA_ENABLED_BY_DEFAULT = true;
const HA_DISABLED_VALUES = new Set(["0", "false", "no"]);

export function mqttUrl(): string | null {
  const value = process.env.MQTT_URL?.trim();
  return value ? value : null;
}

export function mqttTopicPrefix(): string {
  return process.env.MQTT_TOPIC_PREFIX?.trim() || DEFAULT_TOPIC_PREFIX;
}

export function haDiscoveryEnabled(): boolean {
  const raw = process.env.MQTT_HA_DISCOVERY?.trim().toLowerCase();
  if (!raw) return HA_ENABLED_BY_DEFAULT;
  return !HA_DISABLED_VALUES.has(raw);
}

let client: MqttClient | null | undefined;
const discoveryPublished = new Set<string>();

function getClient(): MqttClient | null {
  if (client !== undefined) return client;

  const url = mqttUrl();
  if (!url) {
    client = null;
    return client;
  }

  const options: IClientOptions = {};
  if (process.env.MQTT_USERNAME) options.username = process.env.MQTT_USERNAME;
  if (process.env.MQTT_PASSWORD) options.password = process.env.MQTT_PASSWORD;

  const created = connect(url, options);
  created.on("error", (error) => {
    console.error("[now-playing] mqtt error:", error);
  });
  client = created;
  return client;
}

/** Eagerly open the connection at startup; a no-op when `MQTT_URL` is unset. */
export function connectNowPlayingPublisher(): void {
  getClient();
}

/** Test-only: drop the cached client and discovery bookkeeping between cases. */
export function resetNowPlayingPublisherForTests(): void {
  client?.end(true);
  client = undefined;
  discoveryPublished.clear();
}

function publish(mqttClient: MqttClient, topic: string, payload: string | Buffer): void {
  mqttClient.publish(topic, payload, { retain: true, qos: 0 }, (error) => {
    if (error) console.error(`[now-playing] publish to ${topic} failed:`, error);
  });
}

function topicsFor(sourceId: string) {
  const base = `${mqttTopicPrefix()}/${sourceId}`;
  return {
    state: `${base}/state`,
    title: `${base}/title`,
    artist: `${base}/artist`,
    album: `${base}/album`,
    position: `${base}/position`,
    cover: `${base}/cover`,
    coverUrl: `${base}/cover_url`,
    json: `${base}/json`,
  };
}

function text(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

function jsonPayload(snapshot: NowPlayingSnapshot): string {
  const track = snapshot.track;
  return JSON.stringify({
    state: snapshot.state,
    track_id: track?.track_id ?? null,
    release_id: track?.release_id ?? null,
    title: track?.title ?? null,
    artist: track?.artist ?? null,
    album: track?.album ?? null,
    position: track?.position ?? null,
    year: track?.year ?? null,
    bpm: track?.bpm ?? null,
    key: track?.key ?? null,
    genres: track?.genres ?? [],
    duration_seconds: track?.duration_seconds ?? null,
    cover_url: track?.cover_url ?? null,
    offset_seconds: snapshot.offset_seconds,
    observed_at: snapshot.observed_at,
    confidence: snapshot.confidence,
  });
}

/**
 * Home Assistant MQTT discovery (once per source, retained): a "Groovenet now
 * playing" sensor appears with no YAML, its attributes coming from `.../json`.
 */
function publishHaDiscovery(mqttClient: MqttClient, sourceId: string): void {
  if (!haDiscoveryEnabled() || discoveryPublished.has(sourceId)) return;
  discoveryPublished.add(sourceId);

  const topics = topicsFor(sourceId);
  const objectId = `groovenet_now_playing_${sourceId}`;
  const config = {
    name: `Groovenet now playing (${sourceId})`,
    unique_id: objectId,
    state_topic: topics.state,
    json_attributes_topic: topics.json,
    icon: "mdi:album",
    device: {
      identifiers: [objectId],
      name: `Groovenet now playing (${sourceId})`,
      manufacturer: "Groovenet",
      model: "now-playing tracker",
    },
  };
  publish(mqttClient, `homeassistant/sensor/${objectId}/config`, JSON.stringify(config));
}

async function publishCover(mqttClient: MqttClient, topic: string, coverUrl: string | null): Promise<void> {
  const resized = await resizeCoverArt(coverUrl);
  publish(mqttClient, topic, resized ?? "");
}

/**
 * Send one snapshot, retained, on every topic. Called only when state or the
 * displayed track changed — never per window — so an e-ink panel on the
 * other end is not asked to refresh every few seconds.
 */
export async function publishSnapshot(snapshot: NowPlayingSnapshot): Promise<void> {
  const mqttClient = getClient();
  if (!mqttClient) return;

  try {
    const topics = topicsFor(snapshot.source_id);
    const track = snapshot.track;
    publish(mqttClient, topics.state, snapshot.state);
    publish(mqttClient, topics.title, text(track?.title));
    publish(mqttClient, topics.artist, text(track?.artist));
    publish(mqttClient, topics.album, text(track?.album));
    publish(mqttClient, topics.position, text(track?.position));
    publish(mqttClient, topics.coverUrl, text(track?.cover_url));
    publish(mqttClient, topics.json, jsonPayload(snapshot));
    await publishCover(mqttClient, topics.cover, track?.cover_url ?? null);
    publishHaDiscovery(mqttClient, snapshot.source_id);
  } catch (error) {
    console.error(`[now-playing] publish failed for ${snapshot.source_id}:`, error);
  }
}

export const nowPlayingPublisherService = {
  publishSnapshot,
  connect: connectNowPlayingPublisher,
};
