// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { usePlaylistSaveDialog } from "../usePlaylistSaveDialog";

const api = vi.hoisted(() => ({ updatePlaylist: vi.fn(), importPlaylist: vi.fn() }));
vi.mock("@/services/internalApi/playlists", () => api);
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));

function setup(cache: unknown, playlistId: number | undefined = 5) {
  const client = new QueryClient();
  if (cache !== undefined) client.setQueryData(queryKeys.playlistTrackIds(5), cache);
  const onSaved = vi.fn();
  const { result } = renderHook(() => usePlaylistSaveDialog(playlistId, onSaved), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { result, onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updatePlaylist.mockResolvedValue({});
});

describe("usePlaylistSaveDialog saveExisting (#1231)", () => {
  const refs = [{ track_id: "a", friend_id: 1 }];

  it("resolves true once saved, so a page can leave after it", async () => {
    const { result, onSaved } = setup({ playlist_name: "Set", tracks: refs });
    await expect(result.current.saveExisting()).resolves.toBe(true);
    expect(api.updatePlaylist).toHaveBeenCalledWith(5, { tracks: refs });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("resolves false for an empty playlist, and when the save fails", async () => {
    await expect(setup(undefined).result.current.saveExisting()).resolves.toBe(false);
    api.updatePlaylist.mockRejectedValue(new Error("down"));
    const { result, onSaved } = setup(refs);
    await expect(result.current.saveExisting()).resolves.toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
