import { describe, expect, it, vi } from "vitest";
import type { Track } from "./types.js";
import { TrackLookup } from "./trackLookup.js";

const track = (track_id: string, friend_id = 1) => ({ track_id, friend_id, title: track_id, artist: "A" }) as Track;

describe("TrackLookup", () => {
  it("fetches each ref once, in batches, and returns what it found in the order asked", async () => {
    const fetcher = vi.fn(async (refs: { track_id: string; friend_id: number }[]) => refs.filter(r => r.track_id !== "gone").map(r => track(r.track_id, r.friend_id)).reverse());
    const lookup = new TrackLookup(fetcher, 2);
    const found = await lookup.load([{ track_id: "a", friend_id: 1 }, { track_id: "b", friend_id: 1 }, { track_id: "a", friend_id: 1 }, { track_id: "gone", friend_id: 1 }, { track_id: "a", friend_id: 2 }]);
    expect(found.map(t => `${t.friend_id}:${t.track_id}`)).toEqual(["1:a", "1:b", "2:a"]);
    expect(fetcher.mock.calls.map(call => call[0].length)).toEqual([2, 2]);
    expect(lookup.get({ track_id: "b", friend_id: 1 })?.title).toBe("b");
    expect(lookup.get({ track_id: "gone", friend_id: 1 })).toBeUndefined();
    await lookup.load([{ track_id: "a", friend_id: 1 }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight fetch between callers and asks again after a failure", async () => {
    let release!: (tracks: Track[]) => void;
    const fetcher = vi.fn().mockReturnValueOnce(new Promise<Track[]>(done => { release = done; })).mockRejectedValueOnce(new Error("offline")).mockResolvedValue([track("c")]);
    const lookup = new TrackLookup(fetcher);
    const first = lookup.load([{ track_id: "a", friend_id: 1 }]);
    const second = lookup.load([{ track_id: "a", friend_id: 1 }]);
    release([track("a")]);
    expect(await first).toEqual(await second);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(lookup.load([{ track_id: "b", friend_id: 1 }])).rejects.toThrow("offline");
    expect((await lookup.load([{ track_id: "c", friend_id: 1 }])).map(t => t.track_id)).toEqual(["c"]);
    expect(await new TrackLookup(fetcher).load([])).toEqual([]);
  });
});
