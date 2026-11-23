// @vitest-environment jsdom
// #1233: a changed track list keeps the page, and the Suggestions panel, on screen.
import React, { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";

type Ref = { track_id: string; friend_id: number };

// A tiny store for the playlist's refs, so the mutations the viewer calls change what it renders.
const store = vi.hoisted(() => {
  let refs: { track_id: string; friend_id: number }[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => refs,
    set(next: { track_id: string; friend_id: number }[]) {
      refs = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});
const mocks = vi.hoisted(() => ({
  fetchTracksByIds: vi.fn(),
  panelMounts: 0,
  panelAdd: null as null | ((t: unknown, i: number) => void),
}));

vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds: mocks.fetchTracksByIds }));
vi.mock("@/hooks/useSearchResults", () => ({ useSearchResults: () => ({ playlistCounts: {} }) }));
vi.mock("@/hooks/usePlaylistTrackIdsQuery", () => ({
  usePlaylistTrackIdsQuery: () => ({
    tracks: useSyncExternalStore(store.subscribe, store.get),
    playlistName: "Set",
    isPending: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePlaylistMutations", () => ({
  usePlaylistMutations: (_id: unknown, onChange: (change?: "order" | "insert") => void) => ({
    moveTrack: (from: number, to: number) => {
      const next = [...store.get()];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      store.set(next);
      onChange("order");
    },
    insertTrack: (track: Ref, index: number) => {
      const next = [...store.get()];
      next.splice(index, 0, { track_id: track.track_id, friend_id: track.friend_id });
      store.set(next);
      onChange("insert");
    },
    removeFromPlaylist: (index: number) => store.set(store.get().filter((_, i) => i !== index)),
    sortGreedy: vi.fn(),
    sortGenetic: vi.fn(),
    sortCohesiveBlocks: vi.fn(),
    isGeneticSorting: false,
    isCohesiveBlocksSorting: false,
    sortPositionChanges: {},
    orderedBy: null,
    sortMethod: null,
    resetLocalChanges: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRankingProfiles", async () => {
  const { rankingProfileMock } = await import("@/test/rankingProfileMock");
  return rankingProfileMock.module;
});
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
  usePlaylistPlayer: () => ({
    replacePlaylist: vi.fn(),
    playlistLength: 0,
    playlist: [],
    currentTrackIndex: null,
  }),
}));
vi.mock("@/hooks/useLiveSet", () => ({
  useLiveSet: () => ({ set: null, loading: false, create: vi.fn() }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));
vi.mock("@/components/PlaylistStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/SetDetailsPanel", () => ({ default: () => null }));
vi.mock("@/components/FriendSelectDialog", () => ({ default: () => null }));
vi.mock("@/components/NamePlaylistDialog", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/PlaylistActionsMenu", () => ({
  default: ({ onOpenRecommendations }: { onOpenRecommendations: () => void }) => (
    <button data-testid="actions-menu" onClick={onOpenRecommendations}>
      Suggestions
    </button>
  ),
}));
vi.mock("@/components/PlaylistItemMenu", () => ({
  default: ({
    idx,
    moveTrack,
    removeFromPlaylist,
  }: {
    idx: number;
    moveTrack: (from: number, to: number) => void;
    removeFromPlaylist: (i: number) => void;
  }) => (
    <>
      <button onClick={() => moveTrack(idx, idx + 1)}>move {idx}</button>
      <button onClick={() => removeFromPlaylist(idx)}>remove {idx}</button>
    </>
  ),
}));
function PanelStub({ onAdd }: { onAdd: (t: unknown, i: number) => void }) {
  React.useEffect(() => {
    mocks.panelMounts += 1;
  }, []);
  mocks.panelAdd = onAdd;
  return <div data-testid="panel">panel</div>;
}
vi.mock("@/components/SuggestionsPanel", () => ({ default: PanelStub }));

import PlaylistViewer from "./PlaylistViewer";

const t = (id: string, title = id) =>
  ({ ...sampleTrack, track_id: id, friend_id: 1, title }) as Track;
const ref = (id: string): Ref => ({ track_id: id, friend_id: 1 });
const skeleton = () => screen.queryByTestId("playlist-skeleton");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.panelMounts = 0;
  store.set([ref("a"), ref("b"), ref("c")]);
  // The first load answers; every later one stays out, as a slow network would.
  mocks.fetchTracksByIds.mockResolvedValueOnce([
    t("a", "Alpha"),
    t("b", "Bravo"),
    t("c", "Charlie"),
  ]);
  mocks.fetchTracksByIds.mockReturnValue(new Promise(() => {}));
});

async function openPanel() {
  const view = renderWithProviders(<PlaylistViewer playlistId={7} />);
  // First load: skeletons, and only then the list.
  expect(skeleton()).toBeTruthy();
  expect(await screen.findByText("Alpha")).toBeTruthy();
  await view.user.click(screen.getAllByTestId("actions-menu")[0]);
  const panel = await screen.findByTestId("panel");
  return { ...view, panel };
}

describe("PlaylistViewer keeps the page up while the list changes (#1233)", () => {
  it("shows skeletons for the first load only", async () => {
    await openPanel();
    expect(skeleton()).toBeNull();
    expect(mocks.fetchTracksByIds).toHaveBeenCalledTimes(1);
  });

  it("adding a suggestion never renders the skeleton, and the panel stays mounted", async () => {
    const { panel } = await openPanel();
    act(() => mocks.panelAdd?.(t("new", "Fresh"), 1));
    // The new list's request is still out, and the page has not gone back to skeletons.
    expect(mocks.fetchTracksByIds).toHaveBeenCalledTimes(2);
    expect(skeleton()).toBeNull();
    expect(screen.getByTestId("panel")).toBe(panel);
    expect(mocks.panelMounts).toBe(1);
    // The new row is there at once, in place, from the track that was added.
    expect(screen.getAllByTestId("track-result-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Alpha"),
      expect.stringContaining("Fresh"),
      expect.stringContaining("Bravo"),
      expect.stringContaining("Charlie"),
    ]);
    expect(screen.getByText("Just added")).toBeTruthy();
  });

  it("removing and moving a track keep the page and the panel too", async () => {
    const { user, panel } = await openPanel();
    await user.click(screen.getByRole("button", { name: "move 0" }));
    expect(skeleton()).toBeNull();
    expect(screen.getAllByTestId("track-result-row")[0].textContent).toContain("Bravo");
    await user.click(screen.getByRole("button", { name: "remove 0" }));
    expect(skeleton()).toBeNull();
    expect(screen.getAllByTestId("track-result-row")).toHaveLength(2);
    expect(screen.getByTestId("panel")).toBe(panel);
    expect(mocks.panelMounts).toBe(1);
  });

  it("keeps the page while tracks are appended, as a JSON import does", async () => {
    const { panel } = await openPanel();
    act(() => store.set([ref("a"), ref("b"), ref("c"), ref("d")]));
    expect(skeleton()).toBeNull();
    expect(screen.getByTestId("panel")).toBe(panel);
    // The row for a track the store hasn't loaded yet isn't drawn until its request answers.
    expect(screen.getAllByTestId("track-result-row")).toHaveLength(3);
  });

  it("brings an off-screen added row into view, and leaves an on-screen one alone", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    await openPanel();
    rect.mockReturnValue({ top: 100, bottom: 140 } as DOMRect);
    act(() => mocks.panelAdd?.(t("new1", "Fresh"), 1));
    expect(scrollIntoView).not.toHaveBeenCalled();
    rect.mockReturnValue({ top: 5000, bottom: 5040 } as DOMRect);
    act(() => mocks.panelAdd?.(t("new2", "Later"), 2));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    rect.mockRestore();
  });
});
