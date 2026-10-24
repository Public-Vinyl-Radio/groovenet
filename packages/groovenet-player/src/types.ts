import type { Track } from "@groovenet/client";

export interface QueueEntry {
  id: string;
  track: Track;
}

export type PlaybackStatus = "stopped" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  current: QueueEntry | null;
  queue: QueueEntry[];
  position: number;
  duration: number | null;
  volume: number;
  error: PlayerError | null;
}

export interface AudioDevice {
  id: string;
  name: string;
  description?: string;
}

export interface PlaybackSource {
  url: string;
  headers?: Record<string, string>;
}

export interface PlaybackBackendEvents {
  position: (position: number, duration: number | null) => void;
  ended: () => void;
  error: (error: PlayerError) => void;
}

export interface PlaybackBackend {
  on<E extends keyof PlaybackBackendEvents>(event: E, listener: PlaybackBackendEvents[E]): this;
  off<E extends keyof PlaybackBackendEvents>(event: E, listener: PlaybackBackendEvents[E]): this;
  load(source: PlaybackSource): Promise<void>;
  pause(paused: boolean): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  listDevices(): Promise<AudioDevice[]>;
  setOutputDevice(deviceId: string): Promise<void>;
  /** Transport evidence for server resume policy; selected alone is not connected. */
  outputConnection?(): Promise<"connected" | "disconnected" | "unknown">;
  close(): Promise<void>;
}

export type PlayerErrorCode =
  | "NO_AUDIO"
  | "MPV_NOT_FOUND"
  | "MPV_EXITED"
  | "MPV_IPC"
  | "STREAM_FAILED"
  | "DEVICE_UNAVAILABLE"
  | "INVALID_ARGUMENT"
  | "ENGINE_UNAVAILABLE"
  | "ENGINE_INCOMPATIBLE"
  | "ENGINE_AUTH"
  | "ENGINE_TIMEOUT"
  | "ENGINE_API"
  | "DEVICE_BUSY"
  | "DEVICE_AUTH"
  | "PLAYBACK_INTERRUPTED";

export class PlayerError extends Error {
  constructor(
    readonly code: PlayerErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PlayerError";
  }
}
