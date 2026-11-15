import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/types/track";
import { generateGeneticPlaylist, generateOptimizedPlaylist, optimizePlaylist } from "./playlists";

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  });
const sent = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);
const playlist = [{ track_id: "a", friend_id: 1 }] as Track[];
const ranking = { id: "beatmatcher", name: "Beatmatcher", fallback: false };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("optimizePlaylist (#1193)", () => {
  it("sends the profile and library, and returns the tracks with the profile that ordered them", async () => {
    reply({ result: [{ track_id: "a" }], mode: "genetic", ranking });
    await expect(
      optimizePlaylist(playlist, "cohesive_blocks", { ranking: "beatmatcher", friendId: 3 }),
    ).resolves.toEqual({ tracks: [{ track_id: "a" }], ranking });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/playlists/genetic");
    expect(sent()).toEqual({
      playlist,
      mode: "cohesive_blocks",
      friend_id: 3,
      ranking: "beatmatcher",
    });
  });

  it("leaves both out when not given, and reads a keyed result without a profile", async () => {
    reply({ result: { 0: { track_id: "a" } } });
    await expect(optimizePlaylist(playlist)).resolves.toEqual({
      tracks: [{ track_id: "a" }],
      ranking: null,
    });
    expect(sent()).toEqual({ playlist, mode: "genetic" });
  });

  it("keeps the older helpers' requests unchanged", async () => {
    reply({ result: [{ track_id: "a" }], ranking });
    reply({ result: [{ track_id: "a" }], ranking });
    await expect(generateOptimizedPlaylist(playlist, "greedy")).resolves.toEqual([
      { track_id: "a" },
    ]);
    await generateGeneticPlaylist(playlist);
    expect(sent(0)).toEqual({ playlist, mode: "greedy" });
    expect(sent(1)).toEqual({ playlist, mode: "genetic" });
  });

  it("reports tracks missing data as JSON, and passes other errors through", async () => {
    reply(
      { error: "Some tracks are missing", invalid: [{ track_id: "a", reason: "missing_bpm" }] },
      400,
    );
    const error = await optimizePlaylist(playlist).catch((e: Error) => e);
    expect(JSON.parse((error as Error).message).invalid).toHaveLength(1);
    reply({ error: "Unknown ranker 99" }, 400);
    await expect(optimizePlaylist(playlist, "genetic", { ranking: "99" })).rejects.toThrow(
      "Unknown ranker 99",
    );
  });
});
