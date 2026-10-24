// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { sampleTrack, trackInPlaylist } from "@/stories/fixtures/track";

const mocks = vi.hoisted(() => ({
  replacePlaylist: vi.fn(),
  player: { playlist: [] as unknown[], currentTrackIndex: null as number | null },
}));

const refs = [
  { track_id: "a", friend_id: 1 },
  { track_id: "b", friend_id: 1 },
];
const tracks = [
  { ...sampleTrack, track_id: "a", friend_id: 1 },
  { ...trackInPlaylist, track_id: "b", friend_id: 1 },
];

vi.mock("@/hooks/useSearchResults", () => ({ useSearchResults: () => ({ playlistCounts: {} }) }));
vi.mock("@/hooks/usePlaylistTrackIdsQuery", () => ({
  usePlaylistTrackIdsQuery: () => ({ tracks: refs, playlistName: "Set", isPending: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/usePlaylistTracksQuery", () => ({
  usePlaylistTracksQuery: () => ({ tracks, isPending: false }),
}));
vi.mock("@/hooks/usePlaylistMutations", () => ({
  usePlaylistMutations: () => ({
    moveTrack: vi.fn(),
    removeFromPlaylist: vi.fn(),
    addToPlaylist: vi.fn(),
    sortGreedy: vi.fn(),
    sortGenetic: vi.fn(),
    sortCohesiveBlocks: vi.fn(),
    isGeneticSorting: false,
    isCohesiveBlocksSorting: false,
    sortPositionChanges: {},
  }),
}));
vi.mock("@/hooks/usePlaylistActions", () => ({
  usePlaylistActions: () => ({
    exportPlaylist: vi.fn(),
    exportToPDF: vi.fn(),
    getTotalPlaytime: () => ({ formatted: "0:00", missingCount: 0 }),
  }),
}));
vi.mock("@/hooks/usePlaylistSaveDialog", () => ({
  usePlaylistSaveDialog: () => ({ Dialog: () => null, open: vi.fn(), saveExisting: vi.fn() }),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: mocks.replacePlaylist, playlistLength: 0, ...mocks.player }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));
vi.mock("@/components/PlaylistStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/SetDetailsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlaylistActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlaylistItemMenu", () => ({ default: () => <button>item menu</button> }));
vi.mock("@/components/PlaylistRecommendations", () => ({ default: () => null }));
vi.mock("@/components/FriendSelectDialog", () => ({ default: () => null }));
vi.mock("@/components/NamePlaylistDialog", () => ({ default: () => null }));

import PlaylistViewer from "./PlaylistViewer";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewportWidth(1280);
  mocks.player = { playlist: [], currentTrackIndex: null };
});

describe("PlaylistViewer view mode", () => {
  it("lists rows in one table by default, with per-row actions", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(await screen.findByTestId("track-table")).toBeTruthy();
    expect(screen.getAllByTestId("track-result-row")).toHaveLength(2);
    expect(screen.getAllByText("item menu")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Rows view", pressed: true })).toBeTruthy();
  });

  it("switches to cards and keeps the choice for the other lists", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click(await screen.findByRole("button", { name: "Cards view" }));
    expect(screen.queryByTestId("track-table")).toBeNull();
    expect(screen.queryByTestId("track-result-row")).toBeNull();
    expect(localStorage.getItem("searchViewMode")).toBe("card");
  });

  it("starts from the saved mode", async () => {
    localStorage.setItem("searchViewMode", "card");
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(await screen.findByRole("button", { name: "Cards view", pressed: true })).toBeTruthy();
    expect(screen.queryByTestId("track-table")).toBeNull();
  });

  it("gives phones cards and no toggle, whatever was saved", async () => {
    setViewportWidth(390);
    localStorage.setItem("searchViewMode", "row");
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect((await screen.findAllByText("item menu")).length).toBe(2);
    expect(screen.queryByTestId("track-table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rows view" })).toBeNull();
  });

  it("plays the playlist from the clicked row", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    const rows = await screen.findAllByTestId("track-result-row");
    fireEvent.click(rows[1]);
    expect(mocks.replacePlaylist).toHaveBeenCalledWith(tracks, { autoplay: true, startIndex: 1 });
  });

  it("highlights the playing row only when the queue is this playlist", async () => {
    mocks.player = { playlist: [tracks[0], tracks[1]], currentTrackIndex: 1 };
    const { unmount } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    const classes = () =>
      [...document.querySelectorAll("[data-rfd-drag-handle-draggable-id]")].map((h) => h.className);
    await screen.findByTestId("track-table");
    expect(classes()[1]).not.toBe(classes()[0]);
    unmount();

    mocks.player = { playlist: [tracks[1], tracks[0]], currentTrackIndex: 1 };
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByTestId("track-table");
    expect(classes()[1]).toBe(classes()[0]);
  });
});
