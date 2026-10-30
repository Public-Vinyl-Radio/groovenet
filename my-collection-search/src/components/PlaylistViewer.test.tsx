// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { sampleTrack, trackInPlaylist } from "@/stories/fixtures/track";

const mocks = vi.hoisted(() => ({
  replacePlaylist: vi.fn(),
  player: { playlist: [] as unknown[], currentTrackIndex: null as number | null },
  pending: false,
  empty: false,
  saveExisting: vi.fn(),
  markChanged: (() => {}) as () => void,
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
  usePlaylistTrackIdsQuery: () => ({
    tracks: mocks.empty ? [] : refs,
    playlistName: "Set",
    isPending: mocks.pending,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePlaylistTracksQuery", () => ({
  usePlaylistTracksQuery: () => ({ tracks, isPending: false }),
}));
vi.mock("@/hooks/usePlaylistMutations", () => ({
  usePlaylistMutations: (_id: unknown, onChange: () => void) => {
    mocks.markChanged = onChange;
    return {
      moveTrack: vi.fn(),
      removeFromPlaylist: vi.fn(),
      addToPlaylist: vi.fn(),
      sortGreedy: vi.fn(),
      sortGenetic: vi.fn(),
      sortCohesiveBlocks: vi.fn(),
      isGeneticSorting: false,
      isCohesiveBlocksSorting: false,
      sortPositionChanges: {},
    };
  },
}));
vi.mock("@/hooks/usePlaylistActions", () => ({
  usePlaylistActions: () => ({
    exportPlaylist: vi.fn(),
    exportToPDF: vi.fn(),
    getTotalPlaytime: () => ({ formatted: "0:00", missingCount: 0 }),
  }),
}));
vi.mock("@/hooks/usePlaylistSaveDialog", () => ({
  usePlaylistSaveDialog: () => ({
    Dialog: () => null,
    open: vi.fn(),
    saveExisting: mocks.saveExisting,
  }),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({
    replacePlaylist: mocks.replacePlaylist,
    playlistLength: 0,
    ...mocks.player,
  }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));
vi.mock("@/components/PlaylistStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/SetDetailsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlaylistActionsMenu", () => ({
  default: ({ onOpenRecommendations }: { onOpenRecommendations: () => void }) => (
    <button data-testid="actions-menu" onClick={onOpenRecommendations}>
      Recommendations
    </button>
  ),
}));
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
  mocks.pending = false;
  mocks.empty = false;
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

describe("PlaylistViewer page header", () => {
  it("titles the page with the playlist name and links back to Playlists", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Set" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to Playlists", hidden: true }).getAttribute("href"),
    ).toBe("/playlists");
  });

  it("puts the actions menu in the phone header as well as beside the playtime on desktop", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.getAllByTestId("actions-menu")).toHaveLength(2);
  });

  it("offers Save in the phone header once the order changes, in place of a floating bar", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.queryByRole("button", { name: "Save changes", hidden: true })).toBeNull();

    act(() => mocks.markChanged());
    const save = await screen.findByRole("button", { name: "Save changes", hidden: true });
    fireEvent.click(save);
    expect(mocks.saveExisting).toHaveBeenCalled();
    expect(screen.queryByText("Reordered tracks won't persist until you save.")).toBeNull();
  });

  it.each([
    [
      "while loading",
      () => {
        mocks.pending = true;
      },
    ],
    [
      "when empty",
      () => {
        mocks.empty = true;
      },
    ],
  ])("keeps the header and back link %s", async (_label, arrange) => {
    arrange();
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Set" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Playlists", hidden: true })).toBeTruthy();
  });
});

it("opens, refreshes and dismisses recommendations in the shared dialog", async () => {
  const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
  await user.click((await screen.findAllByTestId("actions-menu"))[0]);
  expect(await screen.findByRole("dialog", { name: "AI Recommendations" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
