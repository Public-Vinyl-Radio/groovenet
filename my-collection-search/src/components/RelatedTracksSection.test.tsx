// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  scope: {
    scope: "library" as "library" | "all",
    savedScope: "library",
    libraryFriendId: 4,
    ready: true,
    setScope: vi.fn(),
  },
  recommendations: vi.fn(),
  similar: vi.fn(),
  vibe: vi.fn(),
}));
const empty = { data: [], isLoading: false, error: null };

vi.mock("@/hooks/useSuggestionScope", () => ({ useSuggestionScope: () => mocks.scope }));
vi.mock("@/hooks/useRecommendations", () => ({ useRecommendationsQuery: mocks.recommendations }));
vi.mock("@/hooks/useSimilarTracks", () => ({ useSimilarTracks: mocks.similar }));
vi.mock("@/hooks/useSimilarVibeTracks", () => ({ useSimilarVibeTracks: mocks.vibe }));
const fetchTracksByIds = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));
const saveTrack = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds }));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack }) }));
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({ useGenreLookup: () => new Map() }));
const track_ = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: track_ } }));
vi.mock("@/components/TrackActionsMenu", () => ({
  default: (props: { onAction?: (action: string) => void }) => (
    <button onClick={() => props.onAction?.("add_to_playlist")}>actions</button>
  ),
}));

import RelatedTracksSection from "./RelatedTracksSection";

const track = {
  track_id: "seed",
  friend_id: 9,
  title: "Seed",
  artist: "A",
  bpm: "148",
  key: "A minor",
} as Track;

const similarTracks = (count: number) => ({
  data: {
    tracks: Array.from({ length: count }, (_, i) => ({
      track_id: `s${i + 1}`,
      friend_id: 4,
      title: `S${i + 1}`,
      artist: "A",
      distance: 0.1 + i / 100,
      bpm: 150,
      key: "E minor",
      position: "A1",
      duration_seconds: 185,
    })),
  },
  isLoading: false,
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewportWidth(1280);
  mocks.scope = {
    scope: "library",
    savedScope: "library",
    libraryFriendId: 4,
    ready: true,
    setScope: vi.fn(),
  };
  mocks.recommendations.mockReturnValue(empty);
  mocks.similar.mockReturnValue({ data: { tracks: [] }, isLoading: false, error: null });
  mocks.vibe.mockReturnValue({ data: { tracks: [] }, isLoading: false, error: null });
});

describe("RelatedTracksSection scope", () => {
  it("asks every source for the selected library's scope", () => {
    renderWithProviders(<RelatedTracksSection track={track} />);

    expect(mocks.recommendations).toHaveBeenCalledWith([track], 60, {
      scope: "library",
      libraryFriendId: 4,
      enabled: true,
    });
    for (const hook of [mocks.similar, mocks.vibe]) {
      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({
          track_id: "seed",
          friend_id: 9,
          scope: "library",
          library_friend_id: 4,
          enabled: true,
        }),
      );
    }
  });

  it("switches the scope from its toggle", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={track} />);
    await user.click(screen.getByText("All libraries"));
    expect(mocks.scope.setScope).toHaveBeenCalledWith("all");
  });

  it("suggests looking further when this library has nothing related", () => {
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("No related tracks in this library. Try All libraries.")).toBeTruthy();
  });

  it("says plainly when every library has nothing related", () => {
    mocks.scope.scope = "all";
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("No related tracks found.")).toBeTruthy();
  });

  it("counts and lists what comes back", async () => {
    mocks.similar.mockReturnValue({
      data: { tracks: [{ track_id: "s1", friend_id: 4, title: "S", artist: "A", distance: 0.1 }] },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(await screen.findByRole("link", { name: "S" })).toBeTruthy();
    expect(screen.getByText("1 of 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "S" }).getAttribute("href")).toBe(
      "/tracks/s1?friend_id=4",
    );
  });

  it("reports a failed source", () => {
    mocks.vibe.mockReturnValue({ data: undefined, isLoading: false, error: new Error("down") });
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("Could not load related tracks.")).toBeTruthy();
  });

  it.each(["recommendations", "similar", "vibe"] as const)(
    "shows loading while %s is still loading",
    (source) => {
      mocks[source].mockReturnValue({ data: undefined, isLoading: true, error: null });
      renderWithProviders(<RelatedTracksSection track={track} />);
      expect(screen.getByText("Loading related tracks...")).toBeTruthy();
    },
  );

  it("shows loading, not an empty list, until the saved scope is known", () => {
    mocks.scope.ready = false;
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("Loading related tracks...")).toBeTruthy();
    expect(mocks.recommendations).toHaveBeenCalledWith(
      [track],
      60,
      expect.objectContaining({ enabled: false }),
    );
  });

  it("hides the username within one library, but shows it across all libraries (#522)", async () => {
    mocks.similar.mockReturnValue({
      data: {
        tracks: [
          { track_id: "s1", friend_id: 4, title: "S", artist: "A", username: "ben", distance: 0.1 },
        ],
      },
      isLoading: false,
      error: null,
    });
    const { rerender } = renderWithProviders(<RelatedTrackSectionWrapper />);
    await screen.findByText("S");
    expect(screen.queryByText(/ben/)).toBeNull();

    mocks.scope.scope = "all";
    rerender(<RelatedTrackSectionWrapper />);
    expect(screen.getByText(/ben/)).toBeTruthy();
  });
});

function RelatedTrackSectionWrapper() {
  return <RelatedTracksSection track={track} />;
}

describe("RelatedTracksSection layout", () => {
  beforeEach(() => mocks.similar.mockReturnValue(similarTracks(2)));

  it("heads the section with the count and the scope toggle", async () => {
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(await screen.findByRole("heading", { name: "Related tracks" })).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("This library")).toBeTruthy();
  });

  it("lists a table on desktop with each track's mix against the current one", async () => {
    renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("S1");
    expect(screen.getByTestId("related-table")).toBeTruthy();
    expect(screen.queryByTestId("related-list")).toBeNull();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Track", "Side", "Time", "BPM", "Key", "Genre", "Rating"]),
    );
    // 150 against 148, E minor next to A minor.
    expect(screen.getAllByText("+2")).toHaveLength(2);
    expect(screen.getAllByText("Adjacent")).toHaveLength(2);
    expect(screen.getAllByText("3:05")).toHaveLength(2);
  });

  it("shows a clash as text and dashes for missing values", async () => {
    mocks.similar.mockReturnValue({
      data: {
        tracks: [
          {
            track_id: "c1",
            friend_id: 4,
            title: "Clash",
            artist: "A",
            bpm: 143,
            key: "F minor",
            distance: 0.1,
          },
          { track_id: "n1", friend_id: 4, title: "Bare", artist: "A", distance: 0.2 },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("Clash");
    expect(screen.getByText("Key clash")).toBeTruthy();
    expect(screen.getByText("\u22125")).toBeTruthy();
    expect(screen.getAllByLabelText("No BPM")).toHaveLength(1);
    expect(screen.queryAllByText("Adjacent")).toHaveLength(0);
  });

  it("lists rows with the mix line on a phone", async () => {
    setViewportWidth(390);
    renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("S1");
    expect(screen.getByTestId("related-list")).toBeTruthy();
    expect(screen.queryByTestId("related-table")).toBeNull();
    expect(screen.getAllByText("Adjacent")).toHaveLength(2);
    expect(screen.getAllByText("A \u00b7 3:05 \u00b7 A1")).toHaveLength(2);
  });

  it("reports the acted-on track's rank and sources from a row", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("S2");
    await user.click(screen.getAllByText("actions")[1]);
    expect(track_).toHaveBeenCalledWith(
      "recommendation_acted_on",
      expect.objectContaining({
        track_id: "s2",
        action: "add_to_playlist",
        rank: 2,
        sources: ["similar"],
      }),
    );
  });

  it("shows 20 more at a time", async () => {
    mocks.similar.mockReturnValue(similarTracks(45));
    const { user } = renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("S1");
    expect(screen.getByText("20 of 45")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show 20 more" }));
    expect(screen.getByText("40 of 45")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show 5 more" }));
    expect(screen.getByText("45 of 45")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("starts a phone with fewer rows", async () => {
    setViewportWidth(390);
    mocks.similar.mockReturnValue(similarTracks(45));
    renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("S1");
    expect(screen.getByText("5 of 45")).toBeTruthy();
  });

  it("fills rows from the hydrated tracks: genres, artwork, rating and dashes", async () => {
    mocks.similar.mockReturnValue(similarTracks(2));
    fetchTracksByIds.mockResolvedValue([
      {
        track_id: "s1",
        friend_id: 4,
        title: "S1",
        artist: "A",
        album: "Album One",
        year: "2001",
        release_id: "r1",
        bpm: "150",
        key: "E minor",
        star_rating: 3,
        track_genres: [
          { id: "g1", name: "Cumbia", slug: "cumbia" },
          { id: "g2", name: "Salsa", slug: "salsa" },
        ],
        album_thumbnail: "http://img/s1.jpg",
      },
    ]);
    renderWithProviders(<RelatedTracksSection track={track} />);

    expect(await screen.findByText("Cumbia")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Album One" }).getAttribute("href")).toBe(
      "/albums/r1?friend_id=4",
    );
    expect(screen.getByText("2001")).toBeTruthy();
    expect(screen.getByLabelText("Rated 3 of 5")).toBeTruthy();
    // The other row has no genres: a dash.
    expect(screen.getAllByText("\u2013").length).toBeGreaterThan(0);
  });

  it("saves a rating given from a row", async () => {
    mocks.similar.mockReturnValue(similarTracks(1));
    const { user } = renderWithProviders(<RelatedTracksSection track={track} />);
    await screen.findByText("S1");
    const stars = screen.getByLabelText("Not rated").querySelectorAll("[data-part=item]");
    await user.click(stars[3]);
    expect(saveTrack).toHaveBeenCalledWith({ track_id: "s1", friend_id: 4, star_rating: 4 });
  });
});

it.each([
  ["/chosen.jpg", "/discogs.jpg", "/chosen.jpg"],
  ["", "/discogs.jpg", "/discogs.jpg"],
  ["", "", "/images/placeholder-artwork.png"],
])(
  "renders related covers without rewriting track metadata (%s, %s)",
  (chosen, discogs, expected) => {
    const item = {
      ...track,
      track_id: "related-art",
      title: "Related art",
      audio_file_album_art_url: chosen,
      album_thumbnail: discogs,
    };
    mocks.recommendations.mockReturnValue({ ...empty, data: [item] });
    const { container } = renderWithProviders(<RelatedTracksSection track={track} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(expected);
    expect(item.album_thumbnail).toBe(discogs);
  },
);
