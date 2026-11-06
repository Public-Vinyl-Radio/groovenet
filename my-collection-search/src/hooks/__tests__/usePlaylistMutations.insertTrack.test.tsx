// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Track } from "@/types/track";
import { usePlaylistMutations } from "../usePlaylistMutations";

const refs = [
  { track_id: "a", friend_id: 1 },
  { track_id: "b", friend_id: 1 },
];

function setup(initial: unknown = refs) {
  const client = new QueryClient();
  client.setQueryData(queryKeys.playlistTrackIds(5), initial);
  const onModified = vi.fn();
  const { result } = renderHook(() => usePlaylistMutations(5, onModified), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, result, onModified };
}

const track = { track_id: "n", friend_id: 2 } as Track;
const cached = (client: QueryClient) => client.getQueryData(queryKeys.playlistTrackIds(5));

describe("usePlaylistMutations insertTrack", () => {
  it("inserts at the index, marks the playlist modified, and doesn't save", () => {
    const { client, result, onModified } = setup();
    act(() => result.current.insertTrack(track, 1));
    expect(cached(client)).toEqual([refs[0], { track_id: "n", friend_id: 2 }, refs[1]]);
    expect(onModified).toHaveBeenCalledTimes(1);
  });

  it("keeps successive inserts in order", () => {
    const { client, result } = setup();
    act(() => result.current.insertTrack({ ...track, track_id: "n1" }, 1));
    act(() => result.current.insertTrack({ ...track, track_id: "n2" }, 2));
    expect((cached(client) as { track_id: string }[]).map((r) => r.track_id)).toEqual([
      "a",
      "n1",
      "n2",
      "b",
    ]);
  });

  it("clamps an index past the end to an append and one below 0 to the start", () => {
    const { client, result } = setup();
    act(() => result.current.insertTrack({ ...track, track_id: "end" }, 99));
    act(() => result.current.insertTrack({ ...track, track_id: "start" }, -3));
    expect((cached(client) as { track_id: string }[]).map((r) => r.track_id)).toEqual([
      "start",
      "a",
      "b",
      "end",
    ]);
  });

  it("keeps the playlist metadata of the object cache shape", () => {
    const { client, result } = setup({ playlist_name: "Set", tracks: refs });
    act(() => result.current.insertTrack(track, 0));
    expect(cached(client)).toMatchObject({ playlist_name: "Set" });
    expect((cached(client) as { tracks: unknown[] }).tracks).toHaveLength(3);
  });

  it("ignores a track with no library", () => {
    const { client, result, onModified } = setup();
    act(() => result.current.insertTrack({ track_id: "x" } as Track, 0));
    expect(cached(client)).toEqual(refs);
    expect(onModified).not.toHaveBeenCalled();
  });
});
