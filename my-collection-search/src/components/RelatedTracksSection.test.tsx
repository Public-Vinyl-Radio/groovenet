// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
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
vi.mock("@/components/SuggestionPlaylistMenu", () => ({
  default: ({ onAdded }: { onAdded: () => void }) => (
    <button onClick={onAdded}>Pick playlist</button>
  ),
}));
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
});

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
  it("unfolds release siblings into actionable shared rows", async () => {
    candidates(tracks(3).map((track) => ({ ...track, album: "One release" })));
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    expect(screen.getAllByText("Pick playlist")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "+2 more from One release" }));
    expect(screen.getAllByText("Pick playlist")).toHaveLength(3);
  });
  it("keeps an added row in place and replaces its picker with ADDED", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={seed} />);
    const rows = screen.getAllByRole("listitem");
    await user.click(within(rows[1]).getByRole("button", { name: "Pick playlist" }));
    expect(within(rows[1]).getByRole("status").textContent).toContain("ADDED");
    expect(analytics.events).toContainEqual(
      expect.objectContaining({
        event: "recommendation_acted_on",
        properties: { track_id: "s1", action: "added_to_playlist", rank: 2, sources: ["ai"] },
      }),
    );
    expect(within(rows[1]).queryByRole("button")).toBeNull();
    expect(within(rows[0]).getByRole("button", { name: "Pick playlist" })).toBeTruthy();
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
