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
const eventsNamed = (name: string) =>
  analytics.events.filter((e) => e.event === name).map((e) => e.properties);
const acted = () => eventsNamed("recommendation_acted_on");
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
    expect(acted()).toEqual([
      {
        track_id: "s1",
        action: "added_to_playlist",
        rank: 2,
        sources: [],
        surface: "track_page",
        seed_track_id: "seed",
        from_fold: false,
        sim_identity: null,
        sim_audio: null,
        key_relation: "adjacent",
      },
    ]);
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

describe("Track page suggestion analytics", () => {
  it("reports each list load once, with its filters, and again only when a filter changes it", async () => {
    candidates([...tracks(2), { ...tracks(3)[2], key: "F minor" }]);
    const { user, rerender } = renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(eventsNamed("suggestions_shown")).toEqual([
      {
        surface: "track_page",
        seed_track_id: "seed",
        trigger: "load",
        shown_count: 2,
        scope: "library",
        compatible_key: true,
        bpm_within_6pct: true,
        hidden_by_filters: 1,
      },
    ]);
    rerender(<RelatedTracksSection track={seed} />);
    expect(eventsNamed("suggestions_shown")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Compatible key" }));
    expect(eventsNamed("suggestions_shown")[1]).toEqual(
      expect.objectContaining({
        trigger: "filter_change",
        shown_count: 3,
        compatible_key: false,
        bpm_within_6pct: true,
        hidden_by_filters: 0,
      }),
    );
    rerender(<RelatedTracksSection track={{ ...seed, track_id: "other" }} />);
    expect(eventsNamed("suggestions_shown")[2]).toEqual(
      expect.objectContaining({ seed_track_id: "other", trigger: "load", compatible_key: false }),
    );
  });
  it.each([
    ["loading", { data: undefined, isLoading: true, error: null }],
    ["failed", { data: undefined, isLoading: false, error: new Error("down") }],
  ])("reports no list while %s", (_label, result) => {
    mocks.recommendations.mockReturnValue(result);
    renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(eventsNamed("suggestions_shown")).toEqual([]);
  });
  it("reports a play from the cover and a queue from the menu, with sources from the scores", async () => {
    candidates([
      { ...tracks(1)[0], local_audio_url: "/a.mp3", _simIdentity: 0.8, _simAudio: 0.6 } as Track,
      { ...tracks(2)[1], key: null, _simIdentity: null, _simAudio: 0.5 } as Track,
    ]);
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    await user.click(within(suggestionRows()[0]).getByRole("button", { name: "Play" }));
    await chooseMenuItem(user, kebab(suggestionRows()[1]), /Add to Queue/);
    await waitFor(() => expect(acted()).toHaveLength(2));
    expect(acted()).toEqual([
      expect.objectContaining({
        track_id: "s0",
        action: "played",
        rank: 1,
        sources: ["identity", "audio"],
        sim_identity: 0.8,
        sim_audio: 0.6,
        key_relation: "adjacent",
      }),
      expect.objectContaining({
        track_id: "s1",
        action: "queued",
        rank: 2,
        sources: ["audio"],
        sim_identity: null,
        sim_audio: 0.5,
        key_relation: "unknown",
      }),
    ]);
  });
  it("reports a fold opened, then a track from it as from_fold", async () => {
    candidates(
      ["a1", "a2", "b1"].map(
        (id, i) =>
          ({
            ...tracks(1)[0],
            track_id: id,
            title: `Suggestion ${id}`,
            album: id.startsWith("a") ? "One" : "Two",
            local_audio_url: "/a.mp3",
            _score: 1 - i / 10,
            _simIdentity: 0.7,
          }) as Track,
      ),
    );
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    await user.click(screen.getByRole("button", { name: "+1 more from One" }));
    expect(eventsNamed("suggestions_expanded")).toEqual([
      { surface: "track_page", seed_track_id: "seed", kind: "fold", depth: 3 },
    ]);
    await user.click(within(suggestionRows()[1]).getByRole("button", { name: "Play" }));
    expect(acted()).toEqual([
      expect.objectContaining({ track_id: "a2", rank: 2, from_fold: true, sources: ["identity"] }),
    ]);
  });
  it("reports show more with the depth it reaches", async () => {
    candidates(tracks(30));
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    await user.click(screen.getByRole("button", { name: "Show 10 more" }));
    expect(eventsNamed("suggestions_expanded")).toEqual([
      { surface: "track_page", seed_track_id: "seed", kind: "show_more", depth: 30 },
    ]);
    // Paging is not a new list.
    expect(eventsNamed("suggestions_shown")).toHaveLength(1);
  });
});

it("starts with five rows until the viewport is known", () => {
  mocks.unknownBreakpoint = true;
  candidates(tracks(25));
  renderWithProviders(<RelatedTracksSection track={seed} />);
  expect(screen.getByText("5 of 25")).toBeTruthy();
});
