import type { Track } from "@groovenet/client";
import { randomUUID } from "node:crypto";
import type { QueueEntry } from "./types.js";

export class TrackQueue {
  private entries: QueueEntry[] = [];

  get items(): QueueEntry[] {
    return this.entries.slice();
  }

  get length(): number {
    return this.entries.length;
  }

  add(tracks: Track[], at = this.entries.length): QueueEntry[] {
    if (!Number.isInteger(at) || at < 0 || at > this.entries.length) {
      throw new RangeError("Queue insertion index is out of range");
    }
    const added = tracks.map((track) => ({ id: randomUUID(), track }));
    this.entries.splice(at, 0, ...added);
    return added;
  }

  remove(idOrIndex: string | number): QueueEntry | undefined {
    const index =
      typeof idOrIndex === "number"
        ? idOrIndex
        : this.entries.findIndex((entry) => entry.id === idOrIndex);
    if (!Number.isInteger(index) || index < 0 || index >= this.entries.length) return undefined;
    return this.entries.splice(index, 1)[0];
  }

  move(from: number, to: number): void {
    if (
      ![from, to].every(Number.isInteger) ||
      from < 0 ||
      from >= this.entries.length ||
      to < 0 ||
      to >= this.entries.length
    ) {
      throw new RangeError("Queue move index is out of range");
    }
    const [entry] = this.entries.splice(from, 1);
    this.entries.splice(to, 0, entry!);
  }

  take(index: number): QueueEntry | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.entries.length) return undefined;
    return this.entries.splice(index, 1)[0];
  }
}
