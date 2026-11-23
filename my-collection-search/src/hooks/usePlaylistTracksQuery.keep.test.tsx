// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Track } from "@/types/track";

const fetchTracksByIds = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds }));

import { usePlaylistTracksQuery } from "./usePlaylistTracksQuery";

const ref = (id: string) => ({ track_id: id, friend_id: 1 });
const track = (id: string) => ({ track_id: id, friend_id: 1, title: id }) as Track;

describe("usePlaylistTracksQuery with a changing list (#1233)", () => {
  it("is pending only for the first load; a longer list keeps its data while it loads", async () => {
    fetchTracksByIds.mockResolvedValueOnce([track("a"), track("b")]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ refs }: { refs: { track_id: string; friend_id: number }[] }) =>
        usePlaylistTracksQuery(refs),
      { wrapper, initialProps: { refs: [ref("a"), ref("b")] } },
    );
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.tracks.map((t) => t.track_id)).toEqual(["a", "b"]);

    // An add: a new key whose request is still out. The page must not see a pending query.
    let finish: (tracks: Track[]) => void = () => {};
    fetchTracksByIds.mockReturnValueOnce(new Promise<Track[]>((resolve) => (finish = resolve)));
    rerender({ refs: [ref("a"), ref("new"), ref("b")] });
    expect(result.current.isPending).toBe(false);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.map((t) => t.track_id)).toEqual(["a", "b"]);

    await act(async () => finish([track("a"), track("new"), track("b")]));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.map((t) => t.track_id)).toEqual(["a", "new", "b"]);
  });
});
