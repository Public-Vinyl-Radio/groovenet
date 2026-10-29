import { EventEmitter } from "node:events";
import type {
  AudioDevice,
  PlaybackBackend,
  PlaybackBackendEvents,
  PlaybackSource,
} from "./types.js";
import { PlayerError } from "./types.js";

/** In-memory backend for apps and tests that exercise PlayerCore without audio. */
export class TestPlaybackBackend extends EventEmitter implements PlaybackBackend {
  source: PlaybackSource | null = null;
  paused = false;
  position = 0;
  volume = 100;
  outputDevice: string | null = null;
  closed = false;
  devices: AudioDevice[] = [];

  // Keep EventEmitter's broad overload for compatibility and add typed events.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  on<E extends keyof PlaybackBackendEvents>(event: E, listener: PlaybackBackendEvents[E]): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  off<E extends keyof PlaybackBackendEvents>(event: E, listener: PlaybackBackendEvents[E]): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
  async load(source: PlaybackSource): Promise<void> {
    this.source = source;
    this.paused = false;
  }
  async pause(paused: boolean): Promise<void> {
    this.paused = paused;
  }
  async seek(seconds: number): Promise<void> {
    this.position = seconds;
    this.emit("position", seconds, null);
  }
  async setVolume(volume: number): Promise<void> {
    this.volume = volume;
  }
  async listDevices(): Promise<AudioDevice[]> {
    return this.devices.slice();
  }
  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this.devices.some((device) => device.id === deviceId))
      throw new PlayerError(
        "DEVICE_UNAVAILABLE",
        `No audio device named “${deviceId}” is available.`,
      );
    this.outputDevice = deviceId;
  }
  async close(): Promise<void> {
    this.closed = true;
  }
  advance(seconds: number, duration: number | null = null): void {
    this.position = seconds;
    this.emit("position", seconds, duration);
  }
  finish(): void {
    this.emit("ended");
  }
  fail(error: PlayerError): void {
    this.emit("error", error);
  }
}
