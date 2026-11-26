// @vitest-environment jsdom
import React from "react";
import { CommandPaletteProvider } from "@/providers/CommandPaletteProvider";
import { PaletteScopeControls } from "@/test/PaletteScopeControls";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { sampleTrack, trackInPlaylist } from "@/stories/fixtures/track";

const mocks = vi.hoisted(() => ({
  sortGenetic: vi.fn(),
  replacePlaylist: vi.fn(),
  player: { playlist: [] as unknown[], currentTrackIndex: null as number | null },
  sorting: false,
  pending: false,
  empty: false,
  single: false,
  missingCount: 0,
  saveExisting: vi.fn(),
  insertTrack: vi.fn(),
  saved: (() => {}) as () => void,
  markChanged: (() => {}) as (change?: "order" | "insert") => void,
  refetch: vi.fn(),
  resetLocalChanges: vi.fn(),
  push: vi.fn(),
  sortMethod: null as null | string,
  liveSet: { set: null as unknown, loading: false, create: vi.fn() },
  ordering: null as null | { onPersisted?: () => void },
  orderedBy: null as null | { id: string; name: string; fallback: boolean },
  ownership: null as null | { owner_id: string; owner_name: string; visibility: string },
  household: undefined as unknown,
  notFound: false,
  updatePlaylist: vi.fn(),
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
    ownership: mocks.ownership,
    notFound: mocks.notFound,
    isPending: mocks.pending,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/providers/HouseholdProvider", () => ({
  useHousehold: () => ({ data: mocks.household }),
}));
vi.mock("@/services/internalApi/playlists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/internalApi/playlists")>()),
  updatePlaylist: mocks.updatePlaylist,
}));
vi.mock("@/hooks/usePlaylistTracksQuery", () => ({
  usePlaylistTracksQuery: () => ({ tracks, isPending: false }),
}));
vi.mock("@/hooks/usePlaylistMutations", () => ({
  usePlaylistMutations: (
    _id: unknown,
    onChange: (change?: "order" | "insert") => void,
    ordering: { onPersisted?: () => void },
  ) => {
    mocks.markChanged = (change = "order") => onChange(change);
    mocks.ordering = ordering;
    return {
      moveTrack: vi.fn(),
      insertTrack: mocks.insertTrack,
      removeFromPlaylist: vi.fn(),
      sortGreedy: vi.fn(),
      sortGenetic: mocks.sortGenetic,
      sortCohesiveBlocks: vi.fn(),
      isGeneticSorting: mocks.sorting,
      isCohesiveBlocksSorting: false,
      sortPositionChanges: {},
      orderedBy: mocks.orderedBy,
      sortMethod: mocks.sortMethod,
      resetLocalChanges: mocks.resetLocalChanges,
    };
  },
}));
vi.mock("@/hooks/useRankingProfiles", async () => {
  const { rankingProfileMock } = await import("@/test/rankingProfileMock");
  return rankingProfileMock.module;
});
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/PlaylistActionsMenu", () => ({
  default: ({
    onOpenRecommendations,
    onCreateSet,
    ordering,
    view,
    visibility,
  }: {
    onOpenRecommendations: () => void;
    onCreateSet?: () => void;
    visibility?: { value: string; onToggle: () => void };
    ordering?: { value: string; onChange: (id: string) => void };
    view?: { value: string; onChange: (mode: "row" | "card") => void };
  }) => (
    <>
      <div data-testid="menu-ordering" data-value={ordering?.value}>
        <button onClick={() => ordering?.onChange("beatmatcher")}>order by beatmatcher</button>
      </div>
      <div data-testid="menu-view" data-value={view?.value}>
        <button onClick={() => view?.onChange("card")}>view grid</button>
      </div>
      <button data-testid="actions-menu" onClick={onOpenRecommendations}>
        Recommendations
      </button>
      {onCreateSet && <button onClick={onCreateSet}>Create set</button>}
      {visibility && (
        <button onClick={visibility.onToggle}>toggle visibility {visibility.value}</button>
      )}
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

beforeEach(async () => {
  vi.clearAllMocks();
  (await import("@/test/rankingProfileMock")).rankingProfileMock.reset();
  mocks.orderedBy = null;
  mocks.sortMethod = null;
  mocks.saveExisting.mockResolvedValue(true);
  mocks.refetch.mockResolvedValue({});
  localStorage.clear();
  setViewportWidth(1280);
  mocks.player = { playlist: [], currentTrackIndex: null };
  mocks.pending = false;
  mocks.empty = false;
  mocks.missingCount = 0;
  mocks.single = false;
  mocks.ownership = null;
  mocks.household = undefined;
  mocks.notFound = false;
});

describe("PlaylistViewer view mode", () => {
  it("lists rows in one table by default, with per-row actions", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect(await screen.findByTestId("track-table")).toBeTruthy();
    expect(screen.getAllByTestId("track-result-row")).toHaveLength(2);
    expect(screen.getAllByText("item menu")).toHaveLength(2);
    expect(screen.getAllByTestId("menu-view")[0].dataset.value).toBe("row");
  });

  it("switches to cards from the menu and keeps the choice for the other lists (#1231)", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("view grid"))[0]);
    expect(screen.queryByTestId("track-table")).toBeNull();
    expect(screen.queryByTestId("track-result-row")).toBeNull();
    expect(localStorage.getItem("searchViewMode")).toBe("card");
  });

  it("starts from the saved mode", async () => {
    localStorage.setItem("searchViewMode", "card");
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findAllByTestId("menu-view");
    expect(screen.getAllByTestId("menu-view")[0].dataset.value).toBe("card");
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

  it("reads Playlist in the phone bar and shows the full name and meta in the content", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.getByTestId("page-header-phone-title").textContent).toBe("Playlist");
    const content = screen.getByTestId("playlist-phone-title");
    expect(content.textContent).toBe("Set2 tracks · 0:00");
    expect(within(content).queryByRole("heading")).toBeNull();
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
    // View and Order by are in the menu now, not beside it (#1231).
    expect(desktop.queryByRole("radio", { hidden: true })).toBeNull();
    expect(desktop.queryByLabelText("Order by")).toBeNull();
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

  it("opens from the menu on the whole playlist, even after following a track", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("item menu"))[1]);
    expect(await screen.findByText("seed b")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "close panel" }));
    await user.click(screen.getAllByTestId("actions-menu")[0]);
    expect(await screen.findByText("seed none")).toBeTruthy();
    expect(screen.queryByText("Suggesting after")).toBeNull();
  });

  it("offers Suggest after on a desktop row, and the seed row carries the tag instead", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    // Display-none on phones (the menu carries it there), so jsdom gives it no accessible name.
    const offer = () => screen.getAllByTitle("Suggest after");
    await screen.findAllByText("item menu");
    expect(offer()).toHaveLength(2);
    await user.click(offer()[1]);
    expect(await screen.findByText("seed b")).toBeTruthy();
    // The row being followed shows its tag; the action moves to the other rows only.
    expect(screen.getByText("Suggesting after")).toBeTruthy();
    expect(offer()).toHaveLength(1);
  });

  it("leaves the hover action off the card layout, where the menu carries it", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("view grid"))[0]);
    expect(screen.queryByTitle("Suggest after")).toBeNull();
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

it("runs the existing genetic ordering handler from the playlist scope", async () => {
  const { user } = renderWithProviders(
    <CommandPaletteProvider>
      <PlaylistViewer playlistId={5} />
      <PaletteScopeControls />
    </CommandPaletteProvider>,
  );
  await user.click(screen.getByText("Palette: Optimise order"));
  expect(mocks.sortGenetic).toHaveBeenCalledOnce();
});

it("disables palette optimisation while sorting", () => {
  mocks.sorting = true;
  try {
    renderWithProviders(
      <CommandPaletteProvider>
        <PlaylistViewer playlistId={5} />
        <PaletteScopeControls />
      </CommandPaletteProvider>,
    );
    expect((screen.getByText("Palette: Optimise order") as HTMLButtonElement).disabled).toBe(true);
  } finally {
    mocks.sorting = false;
  }
});

describe("PlaylistViewer ordering by ranking profile (#1193)", () => {
  it("hands the menu the playlists profile, and no picker sits in the header (#1231)", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.queryByLabelText("Order by")).toBeNull();
    expect(screen.getAllByTestId("menu-ordering").map((el) => el.dataset.value)).toEqual([
      "default",
      "default",
    ]);
    expect(mocks.ordering).toMatchObject({ rankingProfileId: "default", friendId: 1 });
  });

  it("names no library before one is chosen", async () => {
    const { rankingProfileMock } = await import("@/test/rankingProfileMock");
    rankingProfileMock.state.friendId = 0;
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(mocks.ordering).toMatchObject({ rankingProfileId: "default", friendId: undefined });
  });

  it("orders by the profile chosen, saved for the playlists surface", async () => {
    const { rankingProfileMock } = await import("@/test/rankingProfileMock");
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("order by beatmatcher"))[0]);
    expect(rankingProfileMock.state.choose).toHaveBeenCalledWith("playlists", "beatmatcher");
    expect(mocks.ordering).toMatchObject({ rankingProfileId: "beatmatcher", friendId: 1 });
  });

  it("says which profile ordered it after an optimise, and when Default stood in", async () => {
    const { rerender } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    expect(screen.queryByRole("status")).toBeNull();

    mocks.orderedBy = { id: "beatmatcher", name: "Beatmatcher", fallback: false };
    rerender(<PlaylistViewer playlistId={1} />);
    expect(screen.getByRole("status").textContent).toBe("Ordered by Beatmatcher");

    mocks.orderedBy = { id: "default", name: "Default", fallback: true };
    rerender(<PlaylistViewer playlistId={1} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Ordered by Default (the chosen profile couldn't be read)",
    );
  });
});

describe("PlaylistViewer unsaved changes (#1231)", () => {
  const bar = () => screen.queryByTestId("playlist-unsaved-bar");

  it("shows one bar naming the change and the profile, with Save and Discard", async () => {
    mocks.orderedBy = { id: "selector", name: "Selector", fallback: false };
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    // Saved: the profile is the quiet note, no bar.
    expect(bar()).toBeNull();
    expect(screen.getByText("Ordered by Selector")).toBeTruthy();

    act(() => mocks.markChanged("order"));
    expect(screen.getByTestId("playlist-unsaved-summary").textContent).toBe(
      "Order changed · by Selector",
    );
    expect(screen.queryByText("Ordered by Selector")).toBeNull();
    expect(within(bar()!).getByRole("button", { name: "Discard", hidden: true })).toBeTruthy();
    expect(within(bar()!).getByText("Save changes")).toBeTruthy();
  });

  it("names a greedy sort, added tracks, and the fallback profile", async () => {
    mocks.sortMethod = "greedy";
    const { user, rerender } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    act(() => mocks.markChanged("order"));
    expect(screen.getByTestId("playlist-unsaved-summary").textContent).toBe(
      "Order changed · Greedy order",
    );

    await user.click((await screen.findAllByText("item menu"))[0]);
    await user.click(screen.getByRole("button", { name: "add new" }));
    act(() => mocks.markChanged("insert"));
    expect(screen.getByTestId("playlist-unsaved-summary").textContent).toBe(
      "Order changed · Greedy order · 1 track added",
    );

    mocks.orderedBy = { id: "default", name: "Default", fallback: true };
    rerender(<PlaylistViewer playlistId={1} />);
    expect(screen.getByTestId("playlist-unsaved-summary").textContent).toBe(
      "Order changed · by Default · 1 track added (the chosen profile couldn't be read)",
    );
  });

  it("says only that the playlist changed when an insert is all there is", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    act(() => mocks.markChanged("insert"));
    expect(screen.getByTestId("playlist-unsaved-summary").textContent).toBe("Playlist changed");
  });

  it("clears the bar once saved", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    act(() => mocks.markChanged("order"));
    await user.click(within(bar()!).getByText("Save changes"));
    expect(mocks.saveExisting).toHaveBeenCalled();
    act(() => mocks.saved());
    expect(bar()).toBeNull();
  });

  it("discards back to the saved order: refetches the list and drops the sort's markers", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    act(() => mocks.markChanged("order"));
    await user.click(within(bar()!).getByRole("button", { name: "Discard", hidden: true }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.resetLocalChanges).toHaveBeenCalledOnce();
    expect(bar()).toBeNull();
  });

  it("counts a remove or add as saved: it writes the whole list to the server", async () => {
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    act(() => mocks.markChanged("order"));
    expect(bar()).toBeTruthy();
    act(() => mocks.ordering?.onPersisted?.());
    expect(bar()).toBeNull();
  });

  it("asks before an in-app link leaves the page with unsaved changes", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await screen.findByRole("heading", { level: 1, name: "Set" });
    act(() => mocks.markChanged("order"));
    fireEvent.click(screen.getAllByRole("link", { name: /Playlists/, hidden: true })[0]);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByTestId("unsaved-changes-summary").textContent).toBe("Order changed");
    await user.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
    expect(mocks.push).toHaveBeenCalledWith("/playlists");
  });
});

describe("PlaylistViewer unsaved changes, more cases (#1231)", () => {
  it("counts several added tracks", async () => {
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("item menu"))[0]);
    await user.click(screen.getByRole("button", { name: "add new" }));
    await user.click(screen.getByRole("button", { name: "add new" }));
    act(() => mocks.markChanged("insert"));
    expect(screen.getByTestId("playlist-unsaved-summary").textContent).toBe("2 tracks added");
  });

  it("offers neither Save nor Discard for a playlist not saved yet", async () => {
    renderWithProviders(<PlaylistViewer />);
    await screen.findAllByTestId("actions-menu");
    act(() => mocks.markChanged("order"));
    const bar = screen.getByTestId("playlist-unsaved-bar");
    expect(within(bar).queryByText("Save changes")).toBeNull();
    expect(within(bar).queryByText("Discard")).toBeNull();
  });
});

describe("PlaylistViewer owner and visibility (#1284)", () => {
  const users = [
    { id: "me", name: "Adam", is_owner: true },
    { id: "sam", name: "Sam", is_owner: false },
  ];

  it("lets the owner make the playlist private, and says so in the meta", async () => {
    mocks.household = { users, current: { id: "me" } };
    mocks.ownership = { owner_id: "me", owner_name: "Adam", visibility: "household" };
    mocks.updatePlaylist.mockResolvedValue({});
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("toggle visibility household"))[0]);
    expect(mocks.updatePlaylist).toHaveBeenCalledWith(1, { visibility: "private" });
  });

  it("shares a private playlist back with the household", async () => {
    mocks.household = { users, current: { id: "me" } };
    mocks.ownership = { owner_id: "me", owner_name: "Adam", visibility: "private" };
    mocks.updatePlaylist.mockResolvedValue({});
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect((await screen.findAllByText(/Private · 2 tracks/)).length).toBeGreaterThan(0);
    await user.click(screen.getAllByText("toggle visibility private")[0]);
    expect(mocks.updatePlaylist).toHaveBeenCalledWith(1, { visibility: "household" });
  });

  it("reports a refused change", async () => {
    mocks.household = { users, current: { id: "me" } };
    mocks.ownership = { owner_id: "me", owner_name: "Adam", visibility: "household" };
    mocks.updatePlaylist.mockRejectedValue(new Error("nope"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = renderWithProviders(<PlaylistViewer playlistId={1} />);
    await user.click((await screen.findAllByText("toggle visibility household"))[0]);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith("Playlist visibility error:", expect.any(Error)),
    );
  });

  it("names another profile's playlist and offers them no visibility change", async () => {
    mocks.household = { users, current: { id: "sam" } };
    mocks.ownership = { owner_id: "me", owner_name: "Adam", visibility: "household" };
    renderWithProviders(<PlaylistViewer playlistId={1} />);
    expect((await screen.findAllByText(/By Adam · 2 tracks/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/toggle visibility/)).toBeNull();
  });
});

it("says a missing or someone else's private playlist was not found (#1284)", async () => {
  mocks.notFound = true;
  mocks.empty = true;
  renderWithProviders(<PlaylistViewer playlistId={182} />);
  expect(await screen.findByText("Playlist not found")).toBeTruthy();
  expect(screen.queryByText("Your playlist is empty")).toBeNull();
});
