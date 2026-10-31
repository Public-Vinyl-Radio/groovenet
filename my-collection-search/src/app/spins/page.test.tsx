// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import type { SpinListItem } from "@/components/spins/spinSummary";
import type { SpinRecapResponse } from "@/services/internalApi/spins";

const user = vi.hoisted(() => ({
  value: { friend: { id: 7 }, isHydrated: true } as {
    friend: { id: number } | null;
    isHydrated: boolean;
  },
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => user.value }));

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/spins",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const hooks = vi.hoisted(() => ({
  list: {
    spins: [] as SpinListItem[],
    isLoading: false,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  recap: { recap: null as SpinRecapResponse | null },
  useSpinsInfiniteQuery: vi.fn(),
  useSpinRecapQuery: vi.fn(),
  deleteSpin: vi.fn(),
}));
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinsInfiniteQuery: (...args: unknown[]) => {
    hooks.useSpinsInfiniteQuery(...args);
    return hooks.list;
  },
  useSpinRecapQuery: (...args: unknown[]) => {
    hooks.useSpinRecapQuery(...args);
    return hooks.recap;
  },
  useSpinMutations: () => ({ deleteSpin: hooks.deleteSpin, deleteSpinPending: false }),
  useSpinTrackStatsQuery: () => ({ stats: { play_count: 2, last_played_at: null } }),
}));
vi.mock("@/hooks/useAlbumsQuery", () => ({ useAlbumDetailQuery: () => ({}) }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbum: () => ({ library_identifier: "LP-9" }) }));

const observer = vi.hoisted(() => ({
  callback: null as IntersectionObserverCallback | null,
}));
class CapturingObserver {
  constructor(callback: IntersectionObserverCallback) {
    observer.callback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

import SpinsPage from "./page";

// 05:00 UTC on Nov 1 is still Oct 31 in Los Angeles.
const NOW = new Date("2026-11-01T05:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("IntersectionObserver", CapturingObserver);
  observer.callback = null;
  user.value = { friend: { id: 7 }, isHydrated: true };
  nav.search = "";
  nav.replace.mockReset();
  hooks.list = {
    spins: [],
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
  hooks.recap = { recap: null };
  hooks.useSpinsInfiniteQuery.mockReset();
  hooks.useSpinRecapQuery.mockReset();
  hooks.deleteSpin.mockReset().mockResolvedValue(undefined);
  setViewportWidth(1280);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderInLosAngeles() {
  return renderWithProviders(
    <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
      <SpinsPage />
    </DisplayTimeZoneProvider>,
  );
}

let nextId = 0;
function spin(
  playedAt: string,
  options: { release?: string; medium?: "vinyl" | "digital"; tracks?: string[] } = {},
): SpinListItem {
  const id = ++nextId;
  const release = options.release ?? "r1";
  return {
    session: {
      id,
      friend_id: 7,
      release_id: release,
      medium: options.medium ?? "vinyl",
      selection_mode: "tracks",
      played_at: playedAt,
      provenance: "manual",
      confidence: null,
      created_at: playedAt,
      updated_at: playedAt,
    },
    selections: [],
    track_events: (options.tracks ?? ["A1"]).map((position, ordinal) => ({
      friend_id: 7,
      release_id: release,
      track_id: `${release}-${position}`,
      played_at: new Date(Date.parse(playedAt) + ordinal * 4 * 60_000).toISOString(),
      ordinal,
      position_snapshot: position,
      title_snapshot: `Song ${position}`,
    })),
    album: { title: `Record ${release}`, artist: "Tame Impala", thumbnail: null },
    derived: {
      is_full_album_spin: false,
      selected_side_count: 0,
      album_side_count: 0,
      track_count: 1,
    },
  };
}

const recap = (overrides: Partial<SpinRecapResponse["stats"]> = {}): SpinRecapResponse => ({
  stats: {
    spins: { value: 42, previous: 30 },
    hours: { value: 4.46, previous: 3 },
    records_pulled: { value: 12, previous: 9 },
    new_to_rotation: { value: 3, previous: 1 },
    hours_known_share: 0.8,
    hours_known_spins: 30,
    ...overrides,
  },
  split: { vinyl: 16, digital: 26 },
  by_week: [],
  genre_mix: {
    current: [
      { genre_id: "g1", name: "Latin", spins: 14.5, share: 0.4 },
      { genre_id: "g2", name: "Rock", spins: 10, share: 0.3 },
      { genre_id: "g3", name: "Electronic", spins: 6, share: 0.2 },
      { genre_id: null, name: "Other", spins: 3, share: 0.1 },
    ],
    previous: [],
  },
  top_records: [],
  top_tracks: [],
  top_artists: [],
  heatmap: [],
  bpm: { histogram: [], median: null, busiest: null },
});

describe("SpinsPage header", () => {
  it("is titled Spins", () => {
    renderWithProviders(<SpinsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Spins" })).toBeTruthy();
  });

  it("keeps the header and waits while the library loads", () => {
    user.value = { friend: null, isHydrated: false };
    renderWithProviders(<SpinsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Spins" })).toBeTruthy();
    expect(hooks.useSpinsInfiniteQuery).toHaveBeenCalledWith(expect.anything(), {
      enabled: false,
    });
  });
});

describe("SpinsPage month", () => {
  it("defaults to this month in the configured zone and bounds the list to it", () => {
    renderInLosAngeles();
    expect(screen.getByText("OCT 2026")).toBeTruthy();
    expect(hooks.useSpinsInfiniteQuery).toHaveBeenLastCalledWith(
      {
        friend_id: 7,
        from: "2026-10-01T07:00:00.000Z",
        to: "2026-11-01T06:59:59.999Z",
        limit: 50,
        medium: undefined,
      },
      { enabled: true },
    );
    expect(hooks.useSpinRecapQuery).toHaveBeenLastCalledWith(
      { friend_id: 7, month: "2026-10" },
      { enabled: true },
    );
    const next = screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it("reads the month from the URL and switches it there", async () => {
    nav.search = "month=2026-09&x=1";
    const { user: ui } = renderInLosAngeles();
    expect(screen.getByText("SEP 2026")).toBeTruthy();
    expect(hooks.useSpinRecapQuery).toHaveBeenLastCalledWith(
      { friend_id: 7, month: "2026-09" },
      { enabled: true },
    );

    await ui.click(screen.getByRole("button", { name: "Next month" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/spins?month=2026-10&x=1", { scroll: false });
    await ui.click(screen.getByRole("button", { name: "Previous month" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/spins?month=2026-08&x=1", { scroll: false });
  });

  it("ignores a future month in the URL", () => {
    nav.search = "month=2027-01";
    renderInLosAngeles();
    expect(screen.getByText("OCT 2026")).toBeTruthy();
  });

  it("links to the month's full recap", () => {
    nav.search = "month=2026-09";
    renderInLosAngeles();
    const link = screen.getByRole("link", { name: /FULL RECAP/ });
    expect(link.getAttribute("href")).toBe("/spins/recap/2026-09");
    expect(link.textContent).toContain("SEPTEMBER RECAP");
  });
});

describe("SpinsPage recap strip", () => {
  it("shows the month's stats, approximating hours when some lack a duration", () => {
    hooks.recap = { recap: recap() };
    renderInLosAngeles();
    expect(screen.getByText("OCTOBER SO FAR")).toBeTruthy();
    const stats = screen.getByText("SPINS", { selector: "dt" }).closest("dl") as HTMLElement;
    expect(within(stats).getByText("42")).toBeTruthy();
    expect(within(stats).getByText("≈4.5")).toBeTruthy();
    expect(within(stats).getByText("12")).toBeTruthy();
    expect(within(stats).getByText("3")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Vinyl 16 spins, digital 26 spins" })).toBeTruthy();
    expect(screen.getByTestId("genre-summary").textContent).toBe("LATIN · ROCK · ELECTRONIC · +1");
  });

  it("shows exact hours when every spin has a duration", () => {
    hooks.recap = { recap: recap({ hours: { value: 15.4, previous: 0 }, hours_known_share: 1 }) };
    renderInLosAngeles();
    expect(screen.getByText("15", { selector: "dd" })).toBeTruthy();
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it("holds placeholders while the recap loads", () => {
    renderInLosAngeles();
    expect(screen.getAllByText("–")).toHaveLength(4);
    expect(screen.getByText("No genres yet.")).toBeTruthy();
  });
});

describe("SpinsPage medium tabs", () => {
  it("filters the list by medium", async () => {
    const { user: ui } = renderInLosAngeles();
    const tabs = screen.getByRole("tablist", { name: "Source" });
    const all = within(tabs).getByRole("tab", { name: "ALL" });
    expect(all.getAttribute("aria-selected")).toBe("true");

    await ui.click(within(tabs).getByRole("tab", { name: "VINYL" }));
    expect(within(tabs).getByRole("tab", { name: "VINYL" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(hooks.useSpinsInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ medium: "vinyl" }),
      { enabled: true },
    );
  });

  it("names the medium in an empty month", async () => {
    const { user: ui } = renderInLosAngeles();
    expect(screen.getByText("No spins in October")).toBeTruthy();
    await ui.click(screen.getByRole("tab", { name: "DIGITAL" }));
    expect(screen.getByText("No digital spins in October")).toBeTruthy();
  });
});

describe("SpinsPage log", () => {
  it("groups days, sessions and records in the configured zone", async () => {
    // 02:00 UTC on Oct 31 is 7 PM on Oct 30 in Los Angeles: yesterday.
    hooks.list.spins = [
      spin("2026-10-31T02:25:00Z", { release: "r2", medium: "digital" }),
      spin("2026-10-31T02:00:00Z", { tracks: ["A1", "A2", "A3"] }),
    ];
    const { user: ui } = renderInLosAngeles();

    expect(screen.getByRole("heading", { level: 3, name: "Yesterday FRI OCT 30" })).toBeTruthy();
    expect(screen.getByText("4 SPINS · 2 RECORDS")).toBeTruthy();
    expect(screen.getByText(/^SESSION · 7:00\sPM–7:25\sPM$/)).toBeTruthy();
    expect(screen.getByText("4 SPINS · 2 RECORDS · MIXED")).toBeTruthy();
    expect(screen.getByText("A1 · Song A1", { exact: false, selector: "p" })).toBeTruthy();

    const toggle = screen.getByRole("button", { name: /Record r1/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("A3 · Song A3")).toBeNull();
    await ui.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("A3 · Song A3")).toBeTruthy();
    expect(screen.getByText("START OF OCTOBER 2026")).toBeTruthy();
  });

  it("loads older days when the end of the log scrolls into view", () => {
    hooks.list.spins = [spin("2026-10-20T19:00:00Z")];
    hooks.list.hasNextPage = true;
    renderInLosAngeles();
    expect(screen.getByText("OLDER DAYS LOAD AS YOU SCROLL")).toBeTruthy();

    act(() => {
      observer.callback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(hooks.list.fetchNextPage).not.toHaveBeenCalled();
    act(() => {
      observer.callback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(hooks.list.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows the next page loading", () => {
    hooks.list.spins = [spin("2026-10-20T19:00:00Z")];
    hooks.list.hasNextPage = true;
    hooks.list.isFetchingNextPage = true;
    renderInLosAngeles();
    expect(screen.getByText(/LOADING OLDER DAYS/)).toBeTruthy();
  });

  it("shows the first page loading and a failed load", () => {
    hooks.list.isLoading = true;
    const { unmount } = renderInLosAngeles();
    expect(screen.queryByText("No spins in October")).toBeNull();
    unmount();

    hooks.list.isLoading = false;
    hooks.list.error = new Error("boom");
    renderInLosAngeles();
    expect(screen.getByText(/COULDN.T LOAD SPINS · BOOM/)).toBeTruthy();
  });

  it("leaves room for the spin detail", () => {
    renderInLosAngeles();
    expect(screen.getByText("Pick a spin to see how it was logged.", { exact: true })).toBeTruthy();
  });
});

const detailPanel = () => document.querySelector('aside[aria-label="Spin detail"]') as HTMLElement;

describe("SpinsPage spin detail", () => {
  // 02:00 UTC on Oct 31 is 7 PM on Oct 30 in Los Angeles.
  const logged = () => {
    const item = spin("2026-10-31T02:00:00Z", { tracks: ["A1", "A2", "A3"] });
    hooks.list.spins = [item];
    return item.session.id;
  };

  it("selects a pressed row, keeping it in the URL", async () => {
    const id = logged();
    nav.search = "month=2026-10";
    const { user: ui } = renderInLosAngeles();
    await ui.click(screen.getByRole("button", { name: /Record r1/ }));
    await ui.click(screen.getByRole("button", { name: /A2 · Song A2/ }));
    expect(nav.replace).toHaveBeenLastCalledWith(`/spins?month=2026-10&spin=${id}%3A1`, {
      scroll: false,
    });
  });

  it("reopens the selection from the URL in the desktop panel", async () => {
    const id = logged();
    nav.search = `spin=${id}:1`;
    const { user: ui } = renderInLosAngeles();

    const panel = detailPanel();
    expect(within(panel).getByText("LP-9 · SIDE A2")).toBeTruthy();
    expect(within(panel).getByText(/^Spin 2 of 3/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The record group opens to show the selected row.
    const row = screen.getByRole("button", { name: /A2 · Song A2/ });
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: /A1 · Song A1/ }).getAttribute("aria-current")).toBe(
      null,
    );

    await ui.click(within(panel).getByRole("button", { name: /AFTER/, hidden: true }));
    expect(nav.replace).toHaveBeenLastCalledWith(`/spins?spin=${id}%3A2`, { scroll: false });
    await ui.click(within(panel).getByRole("button", { name: "Close spin detail", hidden: true }));
    expect(nav.replace).toHaveBeenLastCalledWith("/spins", { scroll: false });
  });

  it("falls back to the empty state for an unknown key", () => {
    logged();
    nav.search = "spin=404:0";
    renderInLosAngeles();
    expect(screen.getByText("Pick a spin to see how it was logged.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a modal below xl instead of the panel", async () => {
    const id = logged();
    setViewportWidth(390);
    nav.search = `spin=${id}:1`;
    const { user: ui } = renderInLosAngeles();
    const dialog = await screen.findByRole("dialog", { name: "Song A2" });
    expect(screen.getByText("Pick a spin to see how it was logged.")).toBeTruthy();

    await ui.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/spins", { scroll: false });
  });

  it("clears the selection once the spin is deleted", async () => {
    const id = logged();
    nav.search = `spin=${id}:1`;
    const { user: ui } = renderInLosAngeles();
    const panel = detailPanel();
    await ui.click(within(panel).getByRole("button", { name: "DELETE SPIN", hidden: true }));
    const confirm = await screen.findByRole("alertdialog");
    await ui.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith("/spins", { scroll: false }));
    expect(hooks.deleteSpin).toHaveBeenCalledWith(id);
  });
});
