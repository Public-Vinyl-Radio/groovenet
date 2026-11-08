// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { sampleTrack, trackInPlaylist } from "@/stories/fixtures/track";

const mocks = vi.hoisted(() => ({
  replacePlaylist: vi.fn(),
  player: { playlist: [] as unknown[], currentTrackIndex: null as number | null },
  pending: false,
  empty: false,
  single: false,
  missingCount: 0,
  saveExisting: vi.fn(),
  insertTrack: vi.fn(),
  saved: (() => {}) as () => void,
  markChanged: (() => {}) as () => void,
  liveSet: { set: null as unknown, loading: false, create: vi.fn() },
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
    tracks: mocks.empty ? [] : mocks.single ? refs.slice(0, 1) : refs,
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
      insertTrack: mocks.insertTrack,
      removeFromPlaylist: vi.fn(),
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
    getTotalPlaytime: () => ({ formatted: "0:00", missingCount: mocks.missingCount }),
  }),
}));
vi.mock("@/hooks/usePlaylistSaveDialog", () => ({
  usePlaylistSaveDialog: (_id: unknown, onSaved: () => void) => ({
    Dialog: () => {
      mocks.saved = onSaved;
      return null;
    },
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
vi.mock("@/hooks/useLiveSet", () => ({ useLiveSet: () => mocks.liveSet }));
vi.mock("@/components/PlaylistActionsMenu", () => ({
  default: ({
    onOpenRecommendations,
    onCreateSet,
  }: {
    onOpenRecommendations: () => void;
    onCreateSet?: () => void;
  }) => (
    <>
      <button data-testid="actions-menu" onClick={onOpenRecommendations}>
        Recommendations
      </button>
      {onCreateSet && <button onClick={onCreateSet}>Create set</button>}
    </>
  ),
}));
vi.mock("@/components/PlaylistItemMenu", () => ({
  default: ({
    track,
    onSuggestAfter,
  }: {
    track: { track_id: string };
    onSuggestAfter: (t: unknown) => void;
  }) => <button onClick={() => onSuggestAfter(track)}>item menu</button>,
}));
vi.mock("@/components/SuggestionsPanel", () => ({
  default: ({
    seed,
    onSeedChange,
    onAdd,
    onClose,
  }: {
    seed: { track_id: string } | null;
    onSeedChange: (s: null) => void;
    onAdd: (t: unknown, i: number) => void;
    onClose: () => void;
  }) => (
    <div data-testid="panel">
      <span>seed {seed?.track_id ?? "none"}</span>
      <button onClick={() => onSeedChange(null)}>whole</button>
      <button onClick={() => onAdd({ track_id: "new", friend_id: 1 }, 1)}>add new</button>
      <button onClick={onClose}>close panel</button>
    </div>
  ),
}));
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
  mocks.missingCount = 0;
  mocks.single = false;
});

describe("PlaylistViewer view mode", () => {
  it("lists rows in one table by default, with per-row actions", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(await screen.findByTestId("track-table")).toBeTruthy();
    expect(screen.getAllByTestId("track-result-row")).toHaveLength(2);
    expect(screen.getAllByText("item menu")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "List", checked: true, hidden: true })).toBeTruthy();
  });

  it("switches to cards and keeps the choice for the other lists", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click(await screen.findByText("Grid"));
    expect(screen.queryByTestId("track-table")).toBeNull();
    expect(screen.queryByTestId("track-result-row")).toBeNull();
    expect(localStorage.getItem("searchViewMode")).toBe("card");
  });

  it("starts from the saved mode", async () => {
    localStorage.setItem("searchViewMode", "card");
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(
      await screen.findByRole("radio", { name: "Grid", checked: true, hidden: true }),
    ).toBeTruthy();
    expect(screen.queryByTestId("track-table")).toBeNull();
  });

  it("gives phones cards and no view switch, whatever was saved", async () => {
    setViewportWidth(390);
    localStorage.setItem("searchViewMode", "row");
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect((await screen.findAllByText("item menu")).length).toBe(2);
    expect(screen.queryByTestId("track-table")).toBeNull();
    // The switch lives in the desktop-only header slot; the phone bar has none.
    expect(
      within(screen.getByTestId("page-header-phone-actions")).queryByRole("radio", {
        hidden: true,
      }),
    ).toBeNull();
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

  it("has one h1 and totals the playlist in the header meta", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId("page-header-meta").textContent).toBe("2 tracks · 0:00");
    expect(screen.queryByText(/Total Playtime/)).toBeNull();
  });

  it("notes tracks missing timing in the meta, and totals nothing while empty", async () => {
    mocks.missingCount = 1;
    const { unmount } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.getByTestId("page-header-meta").textContent).toBe(
      "2 tracks · 0:00 · 1 missing timing",
    );
    unmount();

    mocks.empty = true;
    const { unmount: unmountEmpty } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.queryByTestId("page-header-meta")).toBeNull();
    unmountEmpty();

    mocks.empty = false;
    mocks.single = true;
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.getByTestId("page-header-meta").textContent).toContain("1 track ·");
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

describe("PlaylistViewer suggestions panel", () => {
  it("has no Suggestions key in the header, at either width: the menu carries it", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    const desktop = within(await screen.findByTestId("page-header-desktop-actions"));
    expect(desktop.queryByRole("button", { name: /Suggestions/, hidden: true })).toBeNull();
    expect(desktop.getByRole("radio", { name: "Grid", hidden: true })).toBeTruthy();
    expect(desktop.getAllByTestId("actions-menu")).toHaveLength(1);
    const phone = within(screen.getByTestId("page-header-phone-actions"));
    expect(phone.queryByRole("button", { name: /Suggestions/, hidden: true })).toBeNull();
    expect(phone.getAllByTestId("actions-menu")).toHaveLength(1);
  });

  it("closes from the panel's own control", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByTestId("actions-menu"))[0]);
    expect(await screen.findByTestId("panel")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "close panel" }));
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("opens from the actions menu", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByTestId("actions-menu"))[0]);
    expect(await screen.findByTestId("panel")).toBeTruthy();
  });

  it("seeds from a row, marks it, and lets the panel change the seed", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("item menu"))[1]);
    expect(await screen.findByText("seed b")).toBeTruthy();
    expect(screen.getByText("Suggesting after")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "whole" }));
    expect(screen.getByText("seed none")).toBeTruthy();
    expect(screen.queryByText("Suggesting after")).toBeNull();
  });

  it("inserts an added suggestion, marks it until saved, and keeps the panel open", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("item menu"))[0]);
    await user.click(screen.getByRole("button", { name: "add new" }));
    expect(mocks.insertTrack).toHaveBeenCalledWith({ track_id: "new", friend_id: 1 }, 1);
    expect(screen.getByTestId("panel")).toBeTruthy();
  });

  it("clears Just added once the playlist is saved", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("item menu"))[0]);
    await user.click(screen.getByRole("button", { name: "add new" }));
    act(() => mocks.markChanged());
    act(() => mocks.saved());
    expect(screen.queryByText("Just added")).toBeNull();
  });
});

describe("PlaylistViewer create set", () => {
  beforeEach(() => {
    mocks.liveSet = { set: null, loading: false, create: vi.fn() };
  });

  it("offers Create set in the menu while the playlist isn't a set, and runs the create action", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByRole("button", { name: "Create set" }))[0]);
    expect(mocks.liveSet.create).toHaveBeenCalledOnce();
  });

  it.each([
    ["once it is a set", { set: { title: "x" }, loading: false, create: vi.fn() }],
    ["while the set loads", { set: null, loading: true, create: vi.fn() }],
  ])("leaves Create set out %s", async (_label, liveSet) => {
    mocks.liveSet = liveSet;
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findAllByTestId("actions-menu");
    expect(screen.queryByRole("button", { name: "Create set" })).toBeNull();
  });
});
