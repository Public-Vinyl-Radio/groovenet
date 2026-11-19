// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";
import { usePlaylistMutations } from "../usePlaylistMutations";

const api = vi.hoisted(() => ({ updatePlaylist: vi.fn(), optimizePlaylist: vi.fn() }));
vi.mock("@/services/internalApi/playlists", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...api,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));

const refs = [
  { track_id: "a", friend_id: 1 },
  { track_id: "b", friend_id: 1 },
];

function setup() {
  const client = new QueryClient();
  client.setQueryData(queryKeys.playlistTrackIds(5), refs);
  const onModified = vi.fn();
  const onPersisted = vi.fn();
  const { result } = renderHook(() => usePlaylistMutations(5, onModified, { onPersisted }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { result, onModified, onPersisted };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updatePlaylist.mockResolvedValue({});
  for (const ref of refs) {
    useTrackStore
      .getState()
      .setTrack({ ...ref, title: ref.track_id, key: "A minor", bpm: "120" } as Track);
  }
});

describe("usePlaylistMutations unsaved state (#1231)", () => {
  it("names a move and a greedy sort as order changes, and remembers the greedy sort", () => {
    const { result, onModified } = setup();
    act(() => result.current.moveTrack(0, 1));
    expect(onModified).toHaveBeenLastCalledWith("order");
    expect(result.current.sortMethod).toBeNull();

    act(() => result.current.sortGreedy());
    expect(onModified).toHaveBeenLastCalledWith("order");
    expect(result.current.sortMethod).toBe("greedy");

    act(() => result.current.resetLocalChanges());
    expect(result.current.sortMethod).toBeNull();
    expect(result.current.sortPositionChanges).toEqual({});
  });

  it("names an insert as an insert", () => {
    const { result, onModified } = setup();
    act(() => result.current.insertTrack({ track_id: "n", friend_id: 1 } as Track, 0));
    expect(onModified).toHaveBeenLastCalledWith("insert");
  });

  it("remembers the optimiser mode that sorted it", async () => {
    api.optimizePlaylist.mockResolvedValue({
      tracks: [...refs].reverse(),
      ranking: { id: "selector", name: "Selector", fallback: false },
    });
    const { result } = setup();
    act(() => result.current.sortCohesiveBlocks());
    await waitFor(() => expect(result.current.sortMethod).toBe("cohesive_blocks"));
  });

  it("reports a remove and an add as saved: each writes the whole list", async () => {
    const { result, onModified, onPersisted } = setup();
    act(() => result.current.removeFromPlaylist(0));
    await waitFor(() => expect(onPersisted).toHaveBeenCalledTimes(1));
    act(() => result.current.addToPlaylist({ track_id: "z", friend_id: 1, title: "Z" } as Track));
    await waitFor(() => expect(onPersisted).toHaveBeenCalledTimes(2));
    expect(onModified).not.toHaveBeenCalled();
  });
});
