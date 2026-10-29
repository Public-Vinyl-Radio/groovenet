// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import type { GenreTreeNode } from "@/api-contract/schemas";
import type { Track } from "@/types/track";
import PlaylistStatsPanel from "./PlaylistStatsPanel";

// jsdom never matches a `@media` query, so Chakra's `display={{ base, md }}`
// always keeps the unconditional `base` value: the mobile summary bar stays
// visible and the desktop grid stays `display: none`. Desktop assertions
// below query it with `{ hidden: true }` rather than fighting that.
const taxonomy: GenreTreeNode[] = [
  {
    id: "latin",
    name: "Latin",
    slug: "latin",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    children: [],
  },
  {
    id: "cumbia",
    name: "Cumbia",
    slug: "cumbia",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    children: [],
  },
  {
    id: "chicha",
    name: "Chicha",
    slug: "chicha",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    children: [],
  },
];

let nextId = 1;
function track(overrides: Partial<Track>): Track {
  const id = nextId++;
  return {
    id,
    track_id: `track-${id}`,
    title: `Track ${id}`,
    artist: "Artist",
    album: "Album",
    year: "2020",
    duration: "3:00",
    position: "A1",
    discogs_url: "https://discogs.example/release",
    apple_music_url: "",
    friend_id: 1,
    ...overrides,
  };
}

// Track genres (#368) win over styles; falls back to styles when a track has none.
const tracks: Track[] = [
  track({
    genres: ["Latin"],
    styles: ["Unmapped Style"],
    track_genres: [
      { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null },
    ],
  }),
  track({
    genres: ["Latin"],
    styles: ["Cumbia"],
    track_genres: [],
    local_tags: undefined,
  }),
  track({
    genres: ["Unmapped Genre"],
    styles: [],
    track_genres: [
      { id: "chicha", name: "Chicha", slug: "chicha", parent_id: null, parent_name: null },
    ],
  }),
];

function renderPanel(items: Track[] = tracks) {
  const view = renderWithProviders(<PlaylistStatsPanel tracks={items} />);
  view.queryClient.setQueryData(queryKeys.genreTree(), taxonomy);
  return view;
}

/** The desktop card whose body starts with the given heading text. */
async function findDesktopCard(heading: string) {
  const text = await screen.findByText(heading, {}, { timeout: 2000 });
  return text.closest("div")!;
}

describe("PlaylistStatsPanel (#480)", () => {
  it("links a Discogs genre known to the taxonomy, with its count", async () => {
    renderPanel();

    const genreCard = await findDesktopCard("Top Genres");
    const link = within(genreCard).getByRole("link", {
      name: "Search tracks in Latin (2)",
      hidden: true,
    });
    expect(link.getAttribute("href")).toBe("/?genre=latin");
  });

  it("leaves a label the taxonomy doesn't know as a plain, non-link badge", async () => {
    renderPanel();

    const genreCard = await findDesktopCard("Top Genres");
    const unmapped = within(genreCard).getByText("Unmapped Genre (1)");
    expect(unmapped.closest("a")).toBeNull();
  });

  it("tallies the DJ-facing track genre, falling back to styles when a track has none, under its own row", async () => {
    renderPanel();

    const trackGenreCard = await findDesktopCard("Top track genres");
    // Track 1's track_genres "Cumbia" and track 2's style fallback "Cumbia" are the same genre.
    const cumbia = within(trackGenreCard).getByRole("link", {
      name: "Search tracks in Cumbia (2)",
      hidden: true,
    });
    expect(cumbia.getAttribute("href")).toBe("/?genre=cumbia");
    const chicha = within(trackGenreCard).getByRole("link", {
      name: "Search tracks in Chicha (1)",
      hidden: true,
    });
    expect(chicha.getAttribute("href")).toBe("/?genre=chicha");
  });

  it("shows an empty state when no track has a genre", async () => {
    renderPanel([track({ genres: [], styles: [], track_genres: [] })]);

    const trackGenreCard = await findDesktopCard("Top track genres");
    expect(within(trackGenreCard).getByText("No track genres")).toBeTruthy();
  });

  it("links the top genre in the mobile collapsed summary", async () => {
    renderPanel();

    const summaryLink = await screen.findByRole("link", { name: "Search tracks in Latin" });
    expect(summaryLink.getAttribute("href")).toBe("/?genre=latin");
    expect(summaryLink.textContent).toBe("Latin");
  });

  it("is keyboard focusable", async () => {
    const { user } = renderPanel();

    const summaryLink = await screen.findByRole("link", { name: "Search tracks in Latin" });
    await user.tab();
    expect(document.activeElement).toBe(summaryLink);
  });

  it("doesn't toggle the stats panel when the summary genre link is clicked", async () => {
    const { user } = renderPanel();

    expect(screen.getByText("Show stats")).toBeTruthy();
    const summaryLink = await screen.findByRole("link", { name: "Search tracks in Latin" });
    await user.click(summaryLink);
    expect(screen.getByText("Show stats")).toBeTruthy();
  });

  it("expands the stats cards when the summary bar is clicked", async () => {
    const { user } = renderPanel();

    await user.click(screen.getByText(/tracks$/));
    expect(screen.getByText("Hide stats")).toBeTruthy();
    expect(screen.getAllByText("Top track genres").length).toBeGreaterThan(0);
  });

  it("shows the top genre as plain text in the summary when it isn't in the taxonomy", async () => {
    renderPanel([track({ genres: ["Unmapped Genre"] })]);

    const summary = await screen.findByText("Unmapped Genre");
    expect(summary.closest("a")).toBeNull();
  });

  it("summarises BPM, rating, key and audio coverage, mobile and desktop", async () => {
    const rich = [
      track({ bpm: "128", key: "A minor", star_rating: 5, local_audio_url: "a.m4a" }),
      track({ bpm: "122", key: "A minor", star_rating: 2 }),
      track({ bpm: "0", key: "B minor", star_rating: undefined }),
    ];
    const { user } = renderPanel(rich);

    // Mobile summary bar shows BPM average unexpanded.
    expect(await screen.findByText("BPM 125")).toBeTruthy();

    const rhythmCard = await findDesktopCard("Rhythm & Harmony");
    expect(within(rhythmCard).getByText("BPM avg 125 (122-128)")).toBeTruthy();
    expect(within(rhythmCard).getByText("BPM coverage: 67%")).toBeTruthy();
    expect(within(rhythmCard).getByText("A minor (2)")).toBeTruthy();
    expect(within(rhythmCard).getByText("B minor (1)")).toBeTruthy();

    const ratingsCard = await findDesktopCard("Ratings & Styles");
    expect(within(ratingsCard).getByText("Avg rating: 3.5")).toBeTruthy();
    expect(within(ratingsCard).getByText("4★+ tracks: 1")).toBeTruthy();

    const tracksCard = await findDesktopCard("Tracks");
    expect(within(tracksCard).getByText("Audio Ready: 33%")).toBeTruthy();

    // Expand the mobile cards and check the same numbers render there too.
    await user.click(screen.getByText(/tracks$/));
    const mobileRhythm = screen.getAllByText("Rhythm")[0].closest("div")!;
    expect(within(mobileRhythm).getByText("BPM 125 (122–128)")).toBeTruthy();
    expect(within(mobileRhythm).getByText("A minor (2)")).toBeTruthy();
    const mobileRatings = screen.getAllByText("Ratings")[0].closest("div")!;
    expect(within(mobileRatings).getByText("Avg 3.5 · 1 favs")).toBeTruthy();
  });

  it("treats an empty playlist's audio coverage as zero", async () => {
    renderPanel([]);

    const audioCard = await findDesktopCard("Tracks");
    expect(within(audioCard).getByText("Audio Ready: 0%")).toBeTruthy();
  });
});

it("tallies effective album genres/styles without replacing the DJ genre", async () => {
  renderPanel([
    track({
      genres: ["Old Genre"],
      styles: ["Old Style"],
      album_genres: ["Latin"],
      album_styles: ["Cumbia"],
      track_genres: [{ id: "s", name: "Salsa", slug: "salsa", parent_id: null, parent_name: null }],
    }),
  ]);
  const genreCard = await findDesktopCard("Top Genres");
  expect(within(genreCard).getByText("Latin (1)")).toBeTruthy();
  const styleCard = await findDesktopCard("Ratings & Styles");
  expect(within(styleCard).getByText("Cumbia (1)")).toBeTruthy();
  const djCard = await findDesktopCard("Top track genres");
  expect(within(djCard).getByText("Salsa (1)")).toBeTruthy();
  expect(screen.queryByText("Old Genre")).toBeNull();
});
