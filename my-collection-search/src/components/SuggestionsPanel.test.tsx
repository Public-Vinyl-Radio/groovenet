// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  scope: {
    scope: "library" as "library" | "all",
    libraryFriendId: 4,
    ready: true,
    setScope: vi.fn(),
  },
  recommendations: vi.fn(),
  replacePlaylist: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useSuggestionScope", () => ({ useSuggestionScope: () => mocks.scope }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: mocks.replacePlaylist }),
}));
vi.mock("@/hooks/useRecommendations", () => ({ useRecommendationsQuery: mocks.recommendations }));

import SuggestionsPanel, { type SuggestionSeedRef } from "./SuggestionsPanel";

const t = (id: string, extra: Partial<Track> = {}) =>
  ({
    track_id: id,
    friend_id: 4,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    bpm: "120",
    key: "A minor",
    ...extra,
  }) as Track;

const p1 = t("p1");
const p2 = t("p2");
const p3 = t("p3");
const rec = (id: string, extra: Partial<Track> = {}) => ({
  ...t(id, extra),
  _score: 1 - Number(id.replace(/\D/g, "")) / 1000,
  _simIdentity: 0.9,
  _simAudio: null,
});

let observed: IntersectionObserverCallback | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  observed = null;
  mocks.scope = { scope: "library", libraryFriendId: 4, ready: true, setScope: vi.fn() };
  mocks.recommendations.mockReturnValue({
    data: [rec("r1"), rec("r2"), rec("r3")],
    isLoading: false,
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        observed = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});

function Harness({
  initialSeed = null,
  start = [p1, p2, p3],
  onAdd = vi.fn(),
}: {
  initialSeed?: SuggestionSeedRef | null;
  start?: Track[];
  onAdd?: (track: Track, index: number) => void;
}) {
  const [playlist, setPlaylist] = useState<Track[]>(start);
  const [seed, setSeed] = useState<SuggestionSeedRef | null>(initialSeed);
  return (
    <>
      <ol data-testid="order">
        {playlist.map((x) => (
          <li key={x.track_id}>{x.track_id}</li>
        ))}
      </ol>
      <SuggestionsPanel
        playlist={playlist}
        seed={seed}
        onSeedChange={setSeed}
        onAdd={(track, index) => {
          onAdd(track, index);
          setPlaylist((list) => [...list.slice(0, index), track, ...list.slice(index)]);
        }}
        onClose={vi.fn()}
      />
    </>
  );
}

const order = () =>
  within(screen.getByTestId("order"))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("SuggestionsPanel", () => {
  it("inserts three adds in order after the seed and stays open", async () => {
    const { user } = renderWithProviders(
      <Harness initialSeed={{ track_id: "p1", friend_id: 4 }} />,
    );
    expect(screen.getByText(/Adds go after “Title p1”/)).toBeTruthy();
    expect(screen.getByText(/120 BPM · 8A/)).toBeTruthy();

    for (const id of ["r1", "r2", "r3"]) {
      await user.click(screen.getByRole("button", { name: `Add Title ${id} after Title p1` }));
    }
    expect(order()).toEqual(["p1", "r1", "r2", "r3", "p2", "p3"]);
    expect(screen.getByTestId("suggestions-panel")).toBeTruthy();
    expect(
      screen.getAllByRole("status").filter((n) => n.textContent?.includes("ADDED")),
    ).toHaveLength(3);
  });

  it("appends in Whole playlist mode, ranked against the last track", async () => {
    const onAdd = vi.fn();
    const { user } = renderWithProviders(<Harness onAdd={onAdd} />);
    expect(screen.getByText(/Adds go to the end of the playlist/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add Title r1 after Title p3" }));
    await user.click(screen.getByRole("button", { name: "Add Title r2 after Title p3" }));
    expect(onAdd.mock.calls.map(([, i]) => i)).toEqual([3, 4]);
    expect(order()).toEqual(["p1", "p2", "p3", "r1", "r2"]);
  });

  it("asks for the seed alone in After a track and for the playlist otherwise", () => {
    const { unmount } = renderWithProviders(
      <Harness initialSeed={{ track_id: "p2", friend_id: 4 }} />,
    );
    expect(mocks.recommendations.mock.calls.at(-1)?.[0]).toEqual([p2]);
    expect(mocks.recommendations.mock.calls.at(-1)?.[2]).toEqual({
      scope: "library",
      libraryFriendId: 4,
      enabled: true,
    });
    unmount();
    renderWithProviders(<Harness />);
    expect(mocks.recommendations.mock.calls.at(-1)?.[0]).toEqual([p1, p2, p3]);
  });

  it("switches seed with the segments, and a new seed starts its adds clean", async () => {
    const { user } = renderWithProviders(
      <Harness initialSeed={{ track_id: "p1", friend_id: 4 }} />,
    );
    await user.click(screen.getByRole("button", { name: "Add Title r1 after Title p1" }));
    expect(screen.getByText("ADDED", { exact: false })).toBeTruthy();

    await user.click(screen.getByText("Whole playlist"));
    expect(screen.getByText(/Adds go to the end/)).toBeTruthy();
    // r1 is in the playlist now, so it no longer suggests itself.
    expect(screen.queryByRole("button", { name: /Add Title r1/ })).toBeNull();

    await user.click(screen.getByText("After a track"));
    expect(screen.getByText(/Adds go after “Title r1”|Adds go after “Title p3”/)).toBeTruthy();
  });

  it("falls back to the whole playlist when the seed is gone", () => {
    renderWithProviders(<Harness initialSeed={{ track_id: "gone", friend_id: 4 }} />);
    expect(screen.getByText(/Adds go to the end/)).toBeTruthy();
  });

  it("toggles the key and BPM filters and counts what they hide", async () => {
    mocks.recommendations.mockReturnValue({
      data: [rec("r1"), rec("r2", { bpm: "150" }), rec("r3", { key: "F# minor" })],
      isLoading: false,
    });
    const { user } = renderWithProviders(<Harness />);
    expect(screen.getByText(/1 suggestions · 2 hidden by filters/)).toBeTruthy();

    const key = screen.getByRole("button", { name: "Compatible key" });
    const bpm = screen.getByRole("button", { name: "BPM ±6%" });
    expect(key.getAttribute("aria-pressed")).toBe("true");
    await user.click(key);
    expect(key.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/2 suggestions · 1 hidden by filters/)).toBeTruthy();
    await user.click(bpm);
    expect(bpm.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("3 suggestions")).toBeTruthy();
  });

  it("changes scope, and explains an empty library", async () => {
    mocks.recommendations.mockReturnValue({ data: [], isLoading: false });
    const { user } = renderWithProviders(<Harness />);
    expect(screen.getByText("No suggestions in this library. Try All libraries.")).toBeTruthy();
    await user.click(screen.getByText("All libraries"));
    expect(mocks.scope.setScope).toHaveBeenCalledWith("all");
  });

  it("says plainly when nothing is found across all libraries", () => {
    mocks.scope = { ...mocks.scope, scope: "all" };
    mocks.recommendations.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<Harness />);
    expect(screen.getByText("No suggestions found.")).toBeTruthy();
  });

  it("loads more rows when the end scrolls into view", () => {
    mocks.recommendations.mockReturnValue({
      data: Array.from({ length: 45 }, (_, i) => rec(`r${i + 1}`)),
      isLoading: false,
    });
    renderWithProviders(<Harness />);
    const count = () => screen.getAllByRole("button", { name: /^Add Title/ }).length;
    expect(count()).toBe(20);
    act(() => observed?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as never));
    expect(count()).toBe(40);
    act(() => observed?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as never));
    expect(count()).toBe(40);
  });

  it("folds extra tracks from one album and expands them on request", async () => {
    mocks.recommendations.mockReturnValue({
      data: [rec("r1", { album: "Same", artist: "A" }), rec("r2", { album: "Same", artist: "A" })],
      isLoading: false,
    });
    const { user } = renderWithProviders(<Harness />);
    expect(screen.queryByRole("button", { name: /Add Title r2/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "+1 more from Same" }));
    expect(screen.getByRole("button", { name: "Add Title r2 after Title p3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more from Same/ })).toBeNull();
  });

  it("keeps the kebab beside + on every row", () => {
    renderWithProviders(<Harness initialSeed={{ track_id: "p1", friend_id: 4 }} />);
    const add = screen.getByRole("button", { name: "Add Title r1 after Title p1" });
    const row = add.closest("li")!;
    expect(within(row).getAllByRole("button", { name: "Track actions", hidden: true }).length).toBe(
      2,
    );
  });

  it("shows nothing to rank against for an empty playlist, and closes", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionsPanel
        playlist={[]}
        seed={null}
        onSeedChange={vi.fn()}
        onAdd={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.queryByText(/Adds go/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close suggestions" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("tells the parent which seed the segment picks, and has none to pick when empty", async () => {
    const onSeedChange = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionsPanel
        playlist={[p1, p2]}
        seed={null}
        onSeedChange={onSeedChange}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByText("After a track"));
    expect(onSeedChange).toHaveBeenCalledWith({ track_id: "p2", friend_id: 4 });
  });
});

describe("SuggestionsPanel preview", () => {
  it("plays a suggestion from its cover when it has audio; a plain cover otherwise", async () => {
    mocks.recommendations.mockReturnValue({
      data: [rec("r1", { local_audio_url: "/a.mp3" }), rec("r2")],
      isLoading: false,
    });
    const { user } = renderWithProviders(
      <Harness initialSeed={{ track_id: "p1", friend_id: 4 }} />,
    );
    const rows = screen.getAllByRole("listitem").filter((li) => !li.closest("ol"));
    const row = (id: string) => rows.find((li) => li.textContent?.includes(`Title ${id}`))!;
    expect(within(row("r2")).queryByRole("button", { name: "Play" })).toBeNull();
    await user.click(within(row("r1")).getByRole("button", { name: "Play" }));
    expect(mocks.replacePlaylist).toHaveBeenCalledWith(
      [expect.objectContaining({ track_id: "r1" })],
      { autoplay: true, startIndex: 0 },
    );
  });
});

describe("SuggestionsPanel as a phone sheet", () => {
  beforeEach(() => setViewportWidth(390));
  afterEach(() => setViewportWidth(1280));

  const seedP1 = { track_id: "p1", friend_id: 4 };

  it("opens as a sheet with the chips in one row, not the docked panel", async () => {
    renderWithProviders(<Harness initialSeed={seedP1} />);
    expect(await screen.findByTestId("suggestions-sheet")).toBeTruthy();
    expect(screen.queryByTestId("suggestions-panel")).toBeNull();
    const filters = screen.getByRole("group", { name: "Filters" });
    for (const name of ["Whole playlist", "Compatible key", "BPM ±6%", "This library"]) {
      expect(within(filters).getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByText("After a track")).toBeNull();
  });

  it("adds without closing and counts the adds in the footer", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionsPanelHarness onClose={onClose} initialSeed={seedP1} />,
    );
    await screen.findByTestId("suggestions-sheet");
    expect(screen.getByTestId("suggestions-sheet-count").textContent).toBe(
      "0 added after Title p1",
    );
    await user.click(screen.getByRole("button", { name: "Add Title r1 after Title p1" }));
    await user.click(screen.getByRole("button", { name: "Add Title r2 after Title p1" }));
    expect(screen.getByTestId("suggestions-sheet-count").textContent).toBe(
      "2 added after Title p1",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("suggestions-sheet")).toBeTruthy();
  });

  it("switches to the whole playlist and back with the chip", async () => {
    const onSeedChange = vi.fn();
    const { user, rerender } = renderWithProviders(
      <SuggestionsPanel
        playlist={[p1, p2]}
        seed={seedP1}
        onSeedChange={onSeedChange}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Whole playlist" }));
    expect(onSeedChange).toHaveBeenLastCalledWith(null);
    rerender(
      <SuggestionsPanel
        playlist={[p1, p2]}
        seed={null}
        onSeedChange={onSeedChange}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("suggestions-sheet-count").textContent).toBe(
      "0 added after the playlist",
    );
    await user.click(screen.getByRole("button", { name: "Whole playlist" }));
    expect(onSeedChange).toHaveBeenLastCalledWith({ track_id: "p2", friend_id: 4 });
  });

  it("toggles filters and scope from the chips", async () => {
    const { user } = renderWithProviders(<Harness initialSeed={seedP1} />);
    const key = await screen.findByRole("button", { name: "Compatible key" });
    expect(key.getAttribute("aria-pressed")).toBe("true");
    await user.click(key);
    expect(key.getAttribute("aria-pressed")).toBe("false");
    const bpm = screen.getByRole("button", { name: "BPM ±6%" });
    await user.click(bpm);
    expect(bpm.getAttribute("aria-pressed")).toBe("false");
    await user.click(screen.getByRole("button", { name: "All libraries" }));
    expect(mocks.scope.setScope).toHaveBeenCalledWith("all");
  });

  it("closes with Done and with the close button", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionsPanelHarness onClose={onClose} initialSeed={seedP1} />,
    );
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Close suggestions" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionsPanelHarness onClose={onClose} initialSeed={seedP1} />,
    );
    await screen.findByTestId("suggestions-sheet");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes when the handle is dragged down far enough, not for a short drag", async () => {
    const onClose = vi.fn();
    renderWithProviders(<SuggestionsPanelHarness onClose={onClose} initialSeed={seedP1} />);
    const handle = await screen.findByTestId("suggestions-sheet-handle");
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerMove(handle, { clientY: 400, pointerId: 1 });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps focus inside and returns it to the trigger on close", async () => {
    const { user } = renderWithProviders(<Trigger />);
    const trigger = screen.getByRole("button", { name: "Open suggestions" });
    await user.click(trigger);
    const sheet = await screen.findByTestId("suggestions-sheet");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 25; i++) {
      await user.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByTestId("suggestions-sheet")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

function SuggestionsPanelHarness({
  onClose,
  initialSeed,
}: {
  onClose: () => void;
  initialSeed: SuggestionSeedRef;
}) {
  const [playlist, setPlaylist] = useState<Track[]>([p1, p2, p3]);
  const [seed, setSeed] = useState<SuggestionSeedRef | null>(initialSeed);
  return (
    <SuggestionsPanel
      playlist={playlist}
      seed={seed}
      onSeedChange={setSeed}
      onAdd={(track, index) =>
        setPlaylist((list) => [...list.slice(0, index), track, ...list.slice(index)])
      }
      onClose={onClose}
    />
  );
}

function Trigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open suggestions</button>
      {open && (
        <SuggestionsPanelHarness
          onClose={() => setOpen(false)}
          initialSeed={{ track_id: "p1", friend_id: 4 }}
        />
      )}
    </>
  );
}
