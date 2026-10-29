import type { Track } from "./types.js";

export type TrackRef = { track_id: string; friend_id: number };
/** Loads the full tracks for refs, in any order; refs it cannot resolve are simply absent. */
export type TrackFetcher = (refs: TrackRef[]) => Promise<Track[]>;

const keyOf = (ref: TrackRef) => `${ref.friend_id}:${ref.track_id}`;

/**
 * Queue entries carry only a title and artist. This batch-fetches the full
 * tracks by `track_id` + `friend_id` so a row can show time, BPM, key and art,
 * and caches them so each is requested once. A failed fetch is not cached, so
 * the next `load` asks again.
 */
export class TrackLookup {
  private tracks = new Map<string, Track>();
  private pending = new Map<string, Promise<void>>();
  constructor(
    private fetcher: TrackFetcher,
    private batchSize = 100,
  ) {}

  /** The cached track, if it has been loaded. */
  get(ref: TrackRef): Track | undefined {
    return this.tracks.get(keyOf(ref));
  }

  /** Fetches whatever of `refs` is not cached or already on its way, then resolves with those found. */
  async load(refs: TrackRef[]): Promise<Track[]> {
    const wanted = new Map(refs.map((ref) => [keyOf(ref), ref]));
    const missing = [...wanted].filter(([key]) => !this.tracks.has(key) && !this.pending.has(key));
    for (let i = 0; i < missing.length; i += this.batchSize) {
      const batch = missing.slice(i, i + this.batchSize);
      const request = this.fetcher(batch.map(([, ref]) => ref))
        .then((found) => {
          for (const track of found) this.tracks.set(keyOf(track), track);
        })
        .finally(() => {
          for (const [key] of batch) this.pending.delete(key);
        });
      for (const [key] of batch) this.pending.set(key, request);
    }
    await Promise.all([...wanted.keys()].map((key) => this.pending.get(key)));
    return [...wanted.keys()].flatMap((key) => this.tracks.get(key) ?? []);
  }
}
