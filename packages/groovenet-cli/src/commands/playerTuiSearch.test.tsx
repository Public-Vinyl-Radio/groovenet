import React, { act } from "react";
import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Album, GroovenetClient, Track } from "@groovenet/client";
import type { PlaybackSnapshot, QueueEntry } from "@groovenet/player";
import type { PlayerController } from "./remotePlayer.js";
import { PlayerTui } from "./playerTui.js";
import { albumResultRows, searchTrackRows, searchInputText } from "./playerTuiSearch.js";
import { orderedAlbumTracks, queueSearchTracks } from "./playerTuiSearchState.js";
import { forceTerminal, resizeTerminal } from "../tui/testing.js";
import { displayWidth } from "../tui/text.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const track = {
  track_id: "t1",
  friend_id: 2,
  title: "Cumbia Morena",
  artist: "Various",
  position: "A1",
  local_audio_url: "cumbia.flac",
  bpm: 98,
  key: "A minor",
  duration: "2:46",
} as Track;
const album: Album = {
  release_id: "r1",
  friend_id: 2,
  title: "Cumbia Collection",
  artist: "Various",
  year: 2025,
  label: "Vampi Soul",
  library_identifier: "LP-037",
  track_count: 28,
};
const album2: Album = {
  ...album,
  release_id: "r2",
  title: "Cumbia Luciana",
  artist: "Paolo Petrella",
  library_identifier: "LP-289",
};
const tracks = Array.from({ length: 28 }, (_, index) => ({
  ...track,
  track_id: `t${index}`,
  title: `Cumbia ${index}`,
  position: `${index < 14 ? "A" : "B"}${(index % 14) + 1}`,
}));
const tick = async () => {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
};
const delay = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });
};
async function key(app: ReturnType<typeof render>, input: string) {
  await act(async () => {
    app.stdin.write(input);
    if (input === "\u001b") await new Promise((resolve) => setTimeout(resolve, 30));
    else await new Promise((resolve) => setImmediate(resolve));
  });
}
function fixture() {
  let queue: QueueEntry[] = [{ id: "existing", track }];
  const snapshot = (): PlaybackSnapshot => ({
    status: "playing",
    current: queue[0],
    queue: [...queue],
    position: 44,
    duration: 166,
    volume: 77,
    error: null,
  });
  const control = new EventEmitter() as EventEmitter & { request: ReturnType<typeof vi.fn> };
  control.request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === "queue.list") return [...queue];
    if (method === "devices") return [];
    if (method === "queue.addTrack") {
      const entry = { id: `new-${queue.length}`, track: params!.track as Track };
      queue = [...queue, entry];
      return [entry];
    }
    return snapshot();
  });
  const api = {
    searchTracks: vi.fn(async () => ({ tracks: [track], estimatedTotalHits: 1 })),
    searchAlbums: vi.fn(async () => ({ hits: [album, album2], estimatedTotalHits: 26 })),
    getAlbum: vi.fn(async (id: string) => ({ album: id === "r1" ? album : album2, tracks })),
  };
  const props = {
    control: control as unknown as PlayerController,
    api: api as unknown as GroovenetClient,
    initialSnapshot: snapshot(),
    options: { search: "cumbia" },
  };
  return { props, api, control };
}
beforeEach(() => {
  forceTerminal(120, 40);
});
afterEach(() => act(() => cleanup()));

describe("player search", () => {
  it("searches both scopes directly, previews albums, opens and returns with the selection preserved", async () => {
    const f = fixture();
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    expect(f.api.searchTracks).toHaveBeenCalledWith({
      query: "cumbia",
      mode: "lexical",
      limit: 30,
    });
    expect(f.api.searchAlbums).toHaveBeenCalledWith({ q: "cumbia", limit: 30 });
    expect(app.lastFrame()).toContain("TRACKS · 1");
    expect(app.lastFrame()).not.toContain("NOW PLAYING");
    await key(app, "\t");
    expect(f.api.getAlbum).toHaveBeenCalledWith("r1", 2);
    expect(app.lastFrame()).toContain("LP-037 · 28 tracks");
    expect(app.lastFrame()).toContain("Vampi Soul · 2025");
    expect(app.lastFrame()).toContain("ADD ALL");
    expect(app.lastFrame()).toMatch(/… \d+ more · → open album/);
    expect(app.lastFrame()).toMatchSnapshot("album preview at 120x40");
    await key(app, "j");
    expect(f.api.getAlbum).toHaveBeenLastCalledWith("r2", 2);
    await key(app, "\u001b[C");
    expect(app.lastFrame()).toContain("Cumbia Luciana · Paolo Petrella");
    for (let index = 0; index < 25; index++) await key(app, "j");
    expect(app.lastFrame()).toContain("Cumbia 25");
    expect(app.lastFrame()).toContain("26/28");
    await key(app, "\u001b");
    expect(app.lastFrame()).toContain("2/2");
    expect(app.lastFrame()).toContain("ALBUM / ARTIST / YEAR");
    await key(app, "k");
    expect(f.api.getAlbum).toHaveBeenCalledTimes(2); // cached preview when returning
  });

  it("debounces live typing, protects printable keys, enters results with arrows, and clears with Escape", async () => {
    const f = fixture();
    const app = render(<PlayerTui {...f.props} options={{}} />);
    await tick();
    await key(app, "/");
    await key(app, "qna");
    await key(app, " ");
    expect(f.api.searchTracks).not.toHaveBeenCalled();
    expect(f.control.request).not.toHaveBeenCalledWith("next", undefined);
    expect(app.lastFrame()).toContain("qna ▏");
    await delay();
    expect(f.api.searchTracks).toHaveBeenCalledTimes(1);
    expect(f.api.searchTracks).toHaveBeenCalledWith({ query: "qna ", mode: "lexical", limit: 30 });
    await key(app, "\u001b[B");
    expect(app.lastFrame()).not.toContain("qna ▏");
    await key(app, "a");
    expect(f.control.request).toHaveBeenCalledWith("queue.addTrack", { track });
    expect(app.lastFrame()).toContain("Added 1 track to queue.");
    await key(app, "/");
    await key(app, "\u001b[A");
    expect(app.lastFrame()).not.toContain("qna ▏");
    await key(app, "\u001b");
    expect(app.lastFrame()).toContain("Type a query");
    expect(app.lastFrame()).not.toContain("1/1");
  });

  it("cycles track modes, keeps albums keyword-only, and remembers the track mode", async () => {
    const f = fixture();
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    await key(app, "\u001b[Z");
    await delay();
    expect(f.api.searchTracks).toHaveBeenLastCalledWith({
      query: "cumbia",
      limit: 30,
      mode: "semantic",
    });
    expect(f.api.searchAlbums).toHaveBeenCalledTimes(1);
    await key(app, "\u001b[Z");
    await delay();
    expect(app.lastFrame()).toContain("HYBRID");
    await key(app, "\t");
    await key(app, "\u001b[Z");
    expect(app.lastFrame()).toContain("KEYWORD");
    expect(app.lastFrame()).toContain("keyword only");
    await key(app, "\t");
    expect(app.lastFrame()).toContain("HYBRID");
    await key(app, "\u001b[Z");
    await delay();
    expect(app.lastFrame()).toContain("KEYWORD");
  });

  it("plays a selected track or an entire album and appends without navigating away", async () => {
    const f = fixture();
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    await key(app, "\r");
    expect(f.control.request).toHaveBeenCalledWith("play", { index: 1 });
    expect(app.lastFrame()).toContain("Playing Cumbia Morena");
    await act(async () => {
      f.control.emit("event", { event: "error", data: { error: { message: "Audio failed" } } });
    });
    expect(app.lastFrame()).toContain("Audio failed");
    await key(app, "\t");
    await key(app, "\r");
    expect(f.control.request).toHaveBeenLastCalledWith("status");
    expect(f.control.request).toHaveBeenCalledWith("play", { index: 2 });
    expect(
      f.control.request.mock.calls.filter(([method]) => method === "queue.addTrack"),
    ).toHaveLength(29);
    expect(app.lastFrame()).toContain("ALBUMS · 26");
    await key(app, "\u001b[C");
    await key(app, "j");
    await key(app, "a");
    expect(f.control.request).toHaveBeenCalledWith("queue.addTrack", { track: tracks[1] });
  });

  it("ignores stale search responses and errors after the query changes", async () => {
    const f = fixture();
    let resolveOld!: (value: { tracks: Track[]; estimatedTotalHits: number }) => void;
    let rejectOld!: (error: Error) => void;
    f.api.searchTracks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    f.api.searchAlbums.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        }),
    );
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    expect(app.lastFrame()).toContain("Searching tracks…");
    await key(app, "/");
    await key(app, "new");
    await delay();
    await act(async () => {
      resolveOld({ tracks: [{ ...track, title: "Stale result" }], estimatedTotalHits: 99 });
      rejectOld(new Error("Stale error"));
    });
    expect(app.lastFrame()).not.toContain("Stale result");
    await key(app, "\t");
    expect(app.lastFrame()).not.toContain("Stale error");
    expect(app.lastFrame()).toContain("ALBUMS · 26");
  });

  it("isolates scope failures, reports preview failures and handles empty results", async () => {
    const f = fixture();
    f.api.searchTracks.mockRejectedValueOnce(new Error("Track search unavailable"));
    f.api.getAlbum.mockRejectedValueOnce("Album detail unavailable");
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    expect(app.lastFrame()).toContain("Track search unavailable");
    await key(app, "\t");
    expect(app.lastFrame()).toContain("Album detail unavailable");
    await key(app, "a");
    expect(app.lastFrame()).toContain("Album detail unavailable");
    await key(app, "\u001b[C");
    expect(app.lastFrame()).toContain("ALBUM / ARTIST");
    f.api.searchAlbums.mockRejectedValueOnce(new Error("Album search unavailable"));
    await key(app, "/");
    await key(app, "x");
    await delay();
    expect(app.lastFrame()).toContain("Album search unavailable");
    await key(app, "\t");
    expect(app.lastFrame()).toContain("Cumbia Morena");
    f.api.searchTracks.mockResolvedValueOnce({ tracks: [], estimatedTotalHits: 0 });
    f.api.searchAlbums.mockResolvedValueOnce({ hits: [], estimatedTotalHits: 0 });
    await key(app, "y");
    await delay();
    expect(app.lastFrame()).toContain("No tracks found.");
    await key(app, "\t");
    expect(app.lastFrame()).toContain("No albums found.");
  });

  it("shows loading previews, ignores old album details, and handles albums without tracks", async () => {
    const f = fixture();
    let resolveOld!: (value: { album: Album; tracks: Track[] }) => void;
    f.api.getAlbum.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    f.api.getAlbum.mockResolvedValueOnce({ album: album2, tracks: [] });
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    await key(app, "\t");
    expect(app.lastFrame()).toContain("Loading album…");
    await key(app, "a");
    expect(app.lastFrame()).toContain("Loading album…");
    await key(app, "j");
    await act(async () => {
      resolveOld({ album, tracks });
    });
    expect(app.lastFrame()).toContain("No tracks in this album.");
    expect(app.lastFrame()).not.toContain("Vampi Soul · 2025\n");
    await key(app, "a");
    expect(app.lastFrame()).toContain("No tracks available.");
    await key(app, "\u001b[C");
    expect(app.lastFrame()).toContain("Cumbia Luciana · Paolo Petrella");
  });

  it("reports enqueue failures, blocks repeat submissions while busy, and shows semantic fallback", async () => {
    const f = fixture();
    f.api.searchTracks.mockResolvedValueOnce({
      tracks: [track],
      estimatedTotalHits: 1,
      degraded: true,
    } as Awaited<ReturnType<GroovenetClient["searchTracks"]>>);
    let rejectAdd!: (error: Error) => void;
    const original = f.control.request.getMockImplementation()!;
    f.control.request.mockImplementation((method, params) =>
      method === "queue.addTrack"
        ? new Promise((_, reject) => {
            rejectAdd = reject;
          })
        : original(method, params),
    );
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    expect(app.lastFrame()).toContain("keyword fallback");
    await key(app, "a");
    await key(app, "a");
    expect(app.lastFrame()).toContain("Adding to queue…");
    expect(
      f.control.request.mock.calls.filter(([method]) => method === "queue.addTrack"),
    ).toHaveLength(1);
    await act(async () => {
      rejectAdd(new Error("Speaker disconnected"));
    });
    expect(app.lastFrame()).toContain("Speaker disconnected");
  });

  it("ignores rejected requests and late previews after leaving their view", async () => {
    const f = fixture();
    let rejectTracks!: (error: Error) => void;
    f.api.searchTracks.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectTracks = reject;
        }),
    );
    let rejectPreview!: (error: Error) => void;
    f.api.getAlbum.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPreview = reject;
        }),
    );
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    await key(app, "\t");
    await key(app, "j");
    await act(async () => {
      rejectPreview(new Error("Old preview failed"));
    });
    expect(app.lastFrame()).not.toContain("Old preview failed");
    await key(app, "u");
    await act(async () => {
      rejectTracks(new Error("Old search failed"));
    });
    expect(app.lastFrame()).not.toContain("Old search failed");
  });

  it("renders missing metadata and short previews without overflowing", async () => {
    const f = fixture();
    const bare = {
      ...album,
      library_identifier: undefined,
      track_count: undefined,
      label: undefined,
      year: undefined,
    };
    f.api.searchAlbums.mockResolvedValueOnce({ hits: [bare], estimatedTotalHits: 1 });
    f.api.getAlbum.mockResolvedValueOnce({
      album: bare,
      tracks: [{ ...track, position: undefined, duration: undefined }],
    });
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    await key(app, "\t");
    expect(app.lastFrame()).toContain("No library ID · ? tracks");
    expect(app.lastFrame()).toContain("1 tracks");
    expect(app.lastFrame()).not.toContain("more ·");
    await act(async () => {
      resizeTerminal(app.stdout, 100, 26);
    });
    expect(app.lastFrame()).toContain("TRACKLIST");
    expect(app.lastFrame()!.split("\n").length).toBeLessThanOrEqual(26);
    await act(async () => {
      resizeTerminal(app.stdout, 40, 50);
    });
    await key(app, "\t");
    expect(app.lastFrame()).toContain("Cumbia Morena");
    expect(app.lastFrame()).toContain("Various");
    await key(app, "/");
    await key(app, "\u001b[Z");
    await delay();
    await key(app, "\u007f");
    expect(app.lastFrame()).toContain("cumbi▏");
  });

  it("fits narrow and short layouts, restores the card on leaving search, and keeps long rows bounded", async () => {
    const f = fixture();
    const app = render(<PlayerTui {...f.props} />);
    await tick();
    await key(app, "\t");
    await act(async () => {
      resizeTerminal(app.stdout, 40, 50);
    });
    expect(app.lastFrame()).toContain("LP-037 · 28 tracks");
    expect(app.lastFrame()).not.toContain("TRACKLIST");
    expect(app.lastFrame()!.split("\n").length).toBeLessThanOrEqual(50);
    expect(
      app
        .lastFrame()!
        .split("\n")
        .every((line) => displayWidth(line) <= 40),
    ).toBe(true);
    await key(app, "\u001b[C");
    expect(app.lastFrame()).toContain("Cumbia 0");
    await key(app, "u");
    expect(app.lastFrame()).toContain("NOW PLAYING");
    for (const width of [32, 40, 80, 120]) {
      const rows = [
        ...searchTrackRows(
          { ...track, title: "長い曲名".repeat(30), local_audio_url: null },
          true,
          width,
          width < 70,
        ),
        ...albumResultRows({ ...album, title: "💿".repeat(100) }, true, width),
      ];
      expect(
        rows.every((row) => displayWidth(row.map((part) => part.text).join("")) <= width),
      ).toBe(true);
    }
  });
});

describe("queue search playback", () => {
  it("uses the new entry identity for remote playback, including duplicate tracks", async () => {
    const f = fixture();
    const original = f.control.request.getMockImplementation()!;
    f.control.request.mockImplementation(async (method, params) => {
      const result = await original(method, params);
      if (method === "queue.addTrack") return { queue: await original("queue.list") };
      return result;
    });
    await queueSearchTracks(f.props.control, [track], true, true);
    expect(f.control.request).toHaveBeenCalledWith("play", { id: "new-1" });
  });

  it("reports empty albums, disappeared entries and queue failures without starting playback", async () => {
    const f = fixture();
    await expect(queueSearchTracks(f.props.control, [], true, false)).rejects.toThrow("No tracks");
    f.control.request.mockResolvedValue([]);
    await expect(queueSearchTracks(f.props.control, [track], true, false)).rejects.toThrow(
      "no longer in the queue",
    );
    expect(f.control.request).not.toHaveBeenCalledWith("play", expect.anything());
    f.control.request.mockRejectedValue(new Error("Disconnected"));
    await expect(queueSearchTracks(f.props.control, [track], false, true)).rejects.toThrow(
      "Disconnected",
    );
  });
});

describe("search text and album order", () => {
  it("keeps the query cursor visible and respects terminal cell widths", () => {
    expect(searchInputText("a".repeat(100) + "last", true, 16)).toBe(" / aaaaaaaalast▏");
    expect(searchInputText("長い曲名💿", true, 10)).toContain("曲名💿▏");
    expect(displayWidth(searchInputText("長い曲名💿", true, 10))).toBe(10);
    expect(searchInputText("query", false, 7)).toBe(" / que…");
    expect(searchInputText("query", true, 0)).toBe("");
  });
  it("orders numeric side positions without changing input or tracks without positions", () => {
    const input = ["B1", "A10", "A2", "A1"].map((position) => ({ ...track, position }));
    expect(orderedAlbumTracks(input).map((item) => item.position)).toEqual([
      "A1",
      "A2",
      "A10",
      "B1",
    ]);
    expect(input[0].position).toBe("B1");
    expect(orderedAlbumTracks([{ ...track, position: undefined }, track])).toEqual([
      { ...track, position: undefined },
      track,
    ]);
  });
});

it.each([false, true])(
  "scopes track and album searches to the configured friend in every mode (remote=%s)",
  async (remote) => {
    const f = fixture();
    const options = { search: "cumbia", ...(remote ? { remote: "room" } : {}) };
    const app = render(<PlayerTui {...f.props} options={options} searchFriendId={7} />);
    await tick();
    expect(f.api.searchTracks).toHaveBeenCalledWith({
      query: "cumbia",
      limit: 30,
      mode: "lexical",
      filters: { friend_id: 7 },
    });
    expect(f.api.searchAlbums).toHaveBeenCalledWith({ q: "cumbia", limit: 30, friend_id: 7 });
    await key(app, "\u001b[Z");
    await delay();
    expect(f.api.searchTracks).toHaveBeenLastCalledWith({
      query: "cumbia",
      limit: 30,
      mode: "semantic",
      filters: { friend_id: 7 },
    });
    await key(app, "\u001b[Z");
    await delay();
    expect(f.api.searchTracks).toHaveBeenLastCalledWith({
      query: "cumbia",
      limit: 30,
      mode: "hybrid",
      filters: { friend_id: 7 },
    });
    app.rerender(<PlayerTui {...f.props} options={options} searchFriendId={9} />);
    await delay();
    expect(f.api.searchTracks).toHaveBeenLastCalledWith({
      query: "cumbia",
      limit: 30,
      mode: "hybrid",
      filters: { friend_id: 9 },
    });
    expect(f.api.searchAlbums).toHaveBeenLastCalledWith({ q: "cumbia", limit: 30, friend_id: 9 });
    await key(app, "\t");
    // Details use the selected result's friend identity, never overwrite it with the filter.
    expect(f.api.getAlbum).toHaveBeenCalledWith("r1", 2);
  },
);
