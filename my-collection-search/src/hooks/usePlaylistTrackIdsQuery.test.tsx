import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({ useQuery: useQueryMock }));
vi.mock("@/services/internalApi/playlists", () => ({ fetchPlaylistTrackIds: vi.fn() }));
vi.mock("@/hooks/usePlaylistTracksQuery", () => ({ usePlaylistTracksQuery: vi.fn() }));

import { isPlaylistNotFound, usePlaylistTrackIdsQuery } from "./usePlaylistTrackIdsQuery";

type Result = ReturnType<typeof usePlaylistTrackIdsQuery>;
function Harness({ onResult }: { onResult: (result: Result) => void }) {
  onResult(usePlaylistTrackIdsQuery(4));
  return null;
}
const read = (data: unknown, error: unknown = null) => {
  useQueryMock.mockReturnValue({ data, error, isPending: false, fetchStatus: "idle" });
  let result: Result | null = null;
  renderToString(<Harness onResult={(r) => (result = r)} />);
  return result!;
};

beforeEach(() => useQueryMock.mockReset());

describe("usePlaylistTrackIdsQuery ownership (#1284)", () => {
  it("exposes the owner and visibility the API returned", () => {
    expect(
      read({
        playlist_id: 4,
        tracks: [],
        owner_id: "sam",
        owner_name: "Sam",
        visibility: "private",
      }).ownership,
    ).toEqual({ owner_id: "sam", owner_name: "Sam", visibility: "private" });
  });

  it("defaults a missing name and visibility", () => {
    expect(read({ playlist_id: 4, tracks: [], owner_id: "sam" }).ownership).toEqual({
      owner_id: "sam",
      owner_name: null,
      visibility: "household",
    });
  });

  it("is null before it loads or from an older server", () => {
    expect(read(undefined).ownership).toBeNull();
    expect(read([]).ownership).toBeNull();
    expect(read({ playlist_id: 4, tracks: [] }).ownership).toBeNull();
  });
});

describe("usePlaylistTrackIdsQuery not found (#1284)", () => {
  it("reports a 404 and never retries it, but retries other failures", () => {
    const notFound = new Error("Playlist not found");
    expect(read(undefined, notFound).notFound).toBe(true);
    expect(read(undefined, new Error("HTTP 500")).notFound).toBe(false);
    const { retry } = useQueryMock.mock.calls.at(-1)![0];
    expect(retry(0, notFound)).toBe(false);
    expect(retry(0, new Error("HTTP 500"))).toBe(true);
    expect(retry(3, new Error("HTTP 500"))).toBe(false);
    expect(isPlaylistNotFound("Playlist not found")).toBe(false);
  });
});
