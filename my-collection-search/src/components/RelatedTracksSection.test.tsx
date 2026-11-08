// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { chooseMenuItem, renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";
import { setAnalyticsProvider } from "@/lib/analytics/client";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import { rankSuggestions } from "@/lib/rankSuggestions";

let analytics: MemoryAnalyticsProvider;

const mocks = vi.hoisted(() => ({
  scope: {
    scope: "library" as "library" | "all",
    libraryFriendId: 4,
    ready: true,
    setScope: vi.fn(),
  },
  recommendations: vi.fn(),
  unknownBreakpoint: false,
  fetchPlaylists: vi.fn(),
  updatePlaylist: vi.fn(),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/internalApi/playlists", () => ({
  fetchPlaylists: mocks.fetchPlaylists,
  updatePlaylist: mocks.updatePlaylist,
  importPlaylist: vi.fn(),
}));
vi.mock("@chakra-ui/react", async (importOriginal) => {
  const chakra = await importOriginal<typeof import("@chakra-ui/react")>();
  return {
    ...chakra,
    useBreakpointValue: (...args: Parameters<typeof chakra.useBreakpointValue>) => {
      const value = chakra.useBreakpointValue(...args);
      return mocks.unknownBreakpoint ? undefined : value;
    },
  };
});
vi.mock("@/hooks/useSuggestionScope", () => ({ useSuggestionScope: () => mocks.scope }));
vi.mock("@/hooks/useRecommendations", () => ({ useRecommendationsQuery: mocks.recommendations }));
import RelatedTracksSection from "./RelatedTracksSection";

const seed = {
  track_id: "seed",
  friend_id: 9,
  title: "Seed",
  artist: "A",
  bpm: "148",
  key: "A minor",
} as Track;
const tracks = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      ({
        track_id: `s${i}`,
        friend_id: 4,
        title: `Suggestion ${i}`,
        artist: "A",
        bpm: "150",
        key: "E minor",
      }) as Track,
  );
function candidates(data: Track[]) {
  mocks.recommendations.mockReturnValue({ data, isLoading: false, error: null });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.unknownBreakpoint = false;
  analytics = new MemoryAnalyticsProvider();
  setAnalyticsProvider(analytics);
  setViewportWidth(1280);
  mocks.scope = { scope: "library", libraryFriendId: 4, ready: true, setScope: vi.fn() };
  candidates(tracks(2));
  mocks.fetchPlaylists.mockResolvedValue([{ id: 3, name: "Sunday", tracks: [] }]);
  mocks.updatePlaylist.mockResolvedValue(undefined);
});

/** A row's desktop kebab (the phone one is the first, hidden at this width). */
const kebab = (row: HTMLElement) =>
  within(row).getAllByRole("button", { name: "Track actions", hidden: true })[1];
const suggestionRows = () =>
  screen.getAllByRole("listitem").filter((li) => li.textContent?.startsWith("Suggestion"));

describe("Track page suggestions", () => {
  it("uses the page track as seed and the panel's candidate request and filters", () => {
    renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(mocks.recommendations).toHaveBeenCalledWith([seed], 100, {
      scope: "library",
      libraryFriendId: 4,
      enabled: true,
    });
    expect(screen.getByRole("heading", { name: "Suggestions" })).toBeTruthy();
    expect(screen.getByText("Tracks that could follow this one")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Compatible key" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "BPM ±6%" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
  it("switches library scope", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    await user.click(screen.getByText("All libraries"));
    expect(mocks.scope.setScope).toHaveBeenCalledWith("all");
  });
  it.each(["library", "all"] as const)("shows the empty state for %s", (scope) => {
    mocks.scope.scope = scope;
    candidates([]);
    renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(
      screen.getByText(
        scope === "library"
          ? "No suggestions in this library. Try All libraries."
          : "No suggestions found.",
      ),
    ).toBeTruthy();
  });
  it.each([true, false])("waits for scope and candidates (ready: %s)", (ready) => {
    mocks.scope.ready = ready;
    mocks.recommendations.mockReturnValue({ data: undefined, isLoading: ready });
    renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(screen.getByText("Loading suggestions...")).toBeTruthy();
    expect(mocks.recommendations).toHaveBeenCalledWith(
      [seed],
      100,
      expect.objectContaining({ enabled: ready }),
    );
  });
  it("reports failed requests", () => {
    mocks.recommendations.mockReturnValue({ error: new Error("down"), isLoading: false });
    renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(screen.getByText("Could not load suggestions.")).toBeTruthy();
  });
  it.each([390, 1280])("uses the shared row and ranking at %s px", (width) => {
    setViewportWidth(width);
    const data = tracks(3).map((track, index) => ({ ...track, _simAudio: index / 10 }));
    candidates(data);
    renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(screen.getAllByRole("listitem").map((row) => row.textContent?.split("A")[0])).toEqual(
      rankSuggestions(data, {
        seed,
        filters: { compatibleKey: true, bpmWithinSixPercent: true },
      }).tracks.map((track) => track.title),
    );
    expect(screen.getAllByText("Key fits")).toHaveLength(3);
    expect(screen.getAllByText("+2")).toHaveLength(3);
  });
  it("lets both filter chips reveal excluded candidates", async () => {
    candidates([{ ...tracks(1)[0], title: "Clash", key: "F minor", bpm: "180" }]);
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(screen.getByText(/1 hidden by filters/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Compatible key" }));
    expect(screen.queryByText("Clash")).toBeNull();
    await user.click(screen.getByRole("button", { name: "BPM ±6%" }));
    expect(screen.getByText("Clash")).toBeTruthy();
    expect(screen.getByText("Key clash")).toBeTruthy();
  });
  it("puts each fold under its release and expands it in place", async () => {
    candidates([
      {
        ...tracks(1)[0],
        track_id: "a1",
        title: "Suggestion a1",
        album: "One",
        _score: 0.9,
      } as Track,
      {
        ...tracks(1)[0],
        track_id: "b1",
        title: "Suggestion b1",
        album: "Two",
        _score: 0.8,
      } as Track,
      {
        ...tracks(1)[0],
        track_id: "a2",
        title: "Suggestion a2",
        album: "One",
        _score: 0.7,
      } as Track,
      {
        ...tracks(1)[0],
        track_id: "a3",
        title: "Suggestion a3",
        album: "One",
        _score: 0.6,
      } as Track,
    ]);
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    const labels = () =>
      screen
        .getAllByRole("listitem")
        .map((li) => li.textContent?.match(/^(Suggestion [ab]\d|\+.*)/)?.[0]);
    expect(labels()).toEqual(["Suggestion a1", "+2 more from One", "Suggestion b1"]);
    expect(screen.getByText("2 of 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+2 more from One" }));
    expect(labels()).toEqual(["Suggestion a1", "Suggestion a2", "Suggestion a3", "Suggestion b1"]);
    expect(screen.getByText("4 of 4")).toBeTruthy();
    // Each row carries the kebab, not "+".
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  });
  it("adds from the kebab, marks the row ADDED and reports it with its rank", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    const rows = suggestionRows();
    await chooseMenuItem(user, kebab(rows[1]), /Add to Playlist/);
    await user.click(await screen.findByRole("button", { name: /Sunday/ }));
    await waitFor(() =>
      expect(within(suggestionRows()[1]).getByRole("status").textContent).toContain("ADDED"),
    );
    expect(mocks.updatePlaylist).toHaveBeenCalledWith(3, {
      tracks: [{ track_id: "s1", friend_id: 4 }],
    });
    expect(analytics.events).toContainEqual(
      expect.objectContaining({
        event: "recommendation_acted_on",
        properties: { track_id: "s1", action: "added_to_playlist", rank: 2, sources: ["ai"] },
      }),
    );
    expect(within(suggestionRows()[0]).queryByRole("status")).toBeNull();
  });
  it("reports nothing when the playlist picker is cancelled", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    await chooseMenuItem(user, kebab(suggestionRows()[0]), /Add to Playlist/);
    await screen.findByRole("button", { name: /Sunday/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Sunday/ })).toBeNull());
    expect(mocks.updatePlaylist).not.toHaveBeenCalled();
    expect(analytics.events.filter((e) => e.event === "recommendation_acted_on")).toEqual([]);
    expect(within(suggestionRows()[0]).queryByRole("status")).toBeNull();
  });
  it.each([
    [1280, 20],
    [390, 5],
  ])("paginates at %s px", async (width, initial) => {
    setViewportWidth(width);
    candidates(tracks(45));
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(screen.getByText(`${initial} of 45`)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show 20 more" }));
    expect(screen.getByText(`${initial + 20} of 45`)).toBeTruthy();
  });
});

it("starts with five rows until the viewport is known", () => {
  mocks.unknownBreakpoint = true;
  candidates(tracks(25));
  renderWithProviders(<RelatedTracksSection track={seed} />);
  expect(screen.getByText("5 of 25")).toBeTruthy();
});
