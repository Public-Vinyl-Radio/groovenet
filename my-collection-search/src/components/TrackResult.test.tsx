// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";
import { queryKeys } from "@/lib/queryKeys";

const mocks = vi.hoisted(() => ({
  replacePlaylist: vi.fn(),
  appendToQueue: vi.fn(),
  saveTrack: vi.fn(),
}));

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: mocks.replacePlaylist, appendToQueue: mocks.appendToQueue }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: mocks.saveTrack }) }));
vi.mock("./TrackPlaylistUsage", () => ({
  default: ({ count }: { count: number }) => <span>{count} playlists</span>,
}));

import TrackResult, { TrackListHeader, TRACK_ROW_GRID_TEMPLATE, TRACK_ROW_HEIGHT } from "./TrackResult";

afterEach(() => vi.clearAllMocks());

const track = {
  ...sampleTrack,
  local_tags: "Psychedelic Cumbia",
  track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null }],
} as Track;

describe("TrackResult data-issue state (#468)", () => {
  // A missing embedding (or BPM) is flagged by the row/card's red styling alone —
  // no separate "No embedding" text badge, since it had nowhere to go without
  // crowding the row layout's already-tight album cell.
  it("never renders a 'No embedding' text badge, regardless of hasVectors", () => {
    const { hasVectors, ...rest } = track;
    const { rerender } = renderWithProviders(<TrackResult track={rest as Track} />);
    expect(screen.queryByText("No embedding")).toBeNull();

    rerender(<TrackResult track={{ ...track, hasVectors: false }} />);
    expect(screen.queryByText("No embedding")).toBeNull();

    rerender(<TrackResult track={{ ...track, hasVectors: true }} />);
    expect(screen.queryByText("No embedding")).toBeNull();
  });
});

describe("TrackResult genre badges (#470)", () => {
  it("badges the track's DJ genres in the default card layout", () => {
    renderWithProviders(<TrackResult track={track} />);

    const row = screen.getByTestId("track-genres");
    expect(within(row).getAllByText("Cumbia").length).toBeGreaterThan(0);
    expect(within(row).queryByText("Psychedelic Cumbia")).toBeNull();
  });

  it("badges the track's DJ genres in the row layout too", () => {
    renderWithProviders(<TrackResult track={track} layout="row" />);

    const row = screen.getByTestId("track-genres");
    expect(within(row).getAllByText("Cumbia").length).toBeGreaterThan(0);
  });

  it("falls back to the raw tags for a track not yet reconciled", () => {
    renderWithProviders(<TrackResult track={{ ...track, track_genres: [] }} />);

    expect(within(screen.getByTestId("track-genres")).getAllByText("Psychedelic Cumbia").length).toBeGreaterThan(0);
  });

  it("falls back to the album's Discogs styles when the track has no DJ genres at all", () => {
    renderWithProviders(
      <TrackResult track={{ ...track, track_genres: [], local_tags: "", styles: ["Bossa Nova"] }} />
    );

    expect(within(screen.getByTestId("track-genres")).getAllByText("Bossa Nova").length).toBeGreaterThan(0);
  });

  it("shows no row for a track with no genres and no Discogs styles", () => {
    renderWithProviders(<TrackResult track={{ ...track, track_genres: [], local_tags: "", styles: [] }} />);

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("can be turned off for screens that don't want badges", () => {
    renderWithProviders(<TrackResult track={track} showGenres={false} />);

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("folds genres beyond the first 3 into a +N badge on a phone, one line (#722)", () => {
    const manyGenres = {
      ...track,
      track_genres: [
        { id: "a", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null },
        { id: "b", name: "Chicha", slug: "chicha", parent_id: null, parent_name: null },
        { id: "c", name: "Salsa", slug: "salsa", parent_id: null, parent_name: null },
        { id: "d", name: "Merengue", slug: "merengue", parent_id: null, parent_name: null },
        { id: "e", name: "Bolero", slug: "bolero", parent_id: null, parent_name: null },
      ],
    };
    renderWithProviders(<TrackResult track={manyGenres} />);

    const row = screen.getByTestId("track-genres");
    // jsdom has no media queries, so the phone row (base) and the wrapping desktop row both render.
    expect(within(row).getAllByText("+2")).toHaveLength(1);
    const phoneRow = within(row).getByText("+2").parentElement as HTMLElement;
    expect(getComputedStyle(phoneRow).flexWrap).toBe("nowrap");
    expect(phoneRow.children).toHaveLength(4);
    expect(within(phoneRow).queryByText("Merengue")).toBeNull();
  });
});

describe("TrackResult layout", () => {
  it("renders a row layout grid with a Play button for a track with audio", () => {
    renderWithProviders(<TrackResult track={{ ...track, local_audio_url: "track.m4a" }} layout="row" />);

    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("keeps the row grid's 6 columns aligned for a track with no genres at all", () => {
    // A child that renders null (e.g. GenreList for a genre-less track) drops out of
    // the DOM, which shifts every later CSS Grid auto-placed column left by one —
    // regression coverage for that, not just a snapshot of the current markup.
    renderWithProviders(<TrackResult track={{ ...track, track_genres: [], local_tags: "", styles: [] }} layout="row" />);

    expect(screen.getByTestId("track-row-grid").children.length).toBe(6);
  });

  it("never lets the 'more actions' menu shrink out of view: it sits outside the squeezable grid", () => {
    renderWithProviders(
      <TrackResult
        track={track}
        layout="row"
        buttons={<button aria-label="Track actions">menu</button>}
      />
    );

    const grid = screen.getByTestId("track-row-grid");
    const menuButton = screen.getByRole("button", { name: "Track actions" });
    expect(grid.contains(menuButton)).toBe(false);
  });

  it("shows a 'No BPM' badge when the track has no BPM", () => {
    renderWithProviders(<TrackResult track={{ ...track, bpm: null }} />);

    expect(screen.getByText("No BPM")).toBeTruthy();
  });

  it("shows an 'Add to crate' quick action", () => {
    renderWithProviders(<TrackResult track={track} />);

    // Desktop hover affordance: not in the phone layout's accessibility tree.
    expect(screen.getByRole("button", { name: "Add to crate", hidden: true })).toBeTruthy();
  });

  it("has no hover affordances on a phone: no quick-add and no star rating", () => {
    renderWithProviders(<TrackResult track={{ ...track, star_rating: 0 }} />);

    expect(screen.queryByRole("button", { name: "Add to crate" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "4 stars" })).toBeNull();
    expect(getComputedStyle(screen.getByRole("button", { name: "Add to crate", hidden: true }).parentElement as HTMLElement).display).toBe("none");
  });

  it("shows the sort-position-change badge when supplied", () => {
    renderWithProviders(
      <TrackResult track={track} sortPositionChange={{ currentPosition: 3, previousPosition: 1 }} />
    );

    expect(screen.getByText(/#3 was #1/)).toBeTruthy();
  });

  it("formats a duration over an hour as h:mm:ss", () => {
    renderWithProviders(<TrackResult track={{ ...track, duration_seconds: 3665 }} layout="row" />);

    expect(screen.getByText("1:01:05")).toBeTruthy();
  });

  it("leaves the key out of the card's meta line for a track with no key", () => {
    renderWithProviders(<TrackResult track={{ ...track, key: null }} />);

    expect(screen.queryByTestId("track-card-key")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("flags a low-confidence key with an '!' that opens a popover (#524)", async () => {
    const { user } = renderWithProviders(
      <TrackResult track={{ ...track, key: "F major", key_confidence: 0.42 }} />
    );

    await user.click(screen.getByRole("button", { name: "Uncertain key" }));

    expect(await screen.findByText(/42% confident/)).toBeTruthy();
  });

  it("shows no '!' and no trigger for a confident key (#722)", async () => {
    renderWithProviders(<TrackResult track={{ ...track, key: "F major", key_confidence: 0.9 }} />);

    expect(screen.queryByRole("button", { name: "Uncertain key" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Key confidence" })).toBeNull();
    expect(within(screen.getByTestId("track-card-key")).queryByText("!")).toBeNull();
  });

  it("shows nothing clickable for a key with no confidence on record", () => {
    renderWithProviders(<TrackResult track={{ ...track, key: "F major", key_confidence: null }} />);

    expect(screen.queryByRole("button", { name: "Uncertain key" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Key confidence" })).toBeNull();
  });

  it("flags a contested BPM with an '!' that opens a popover (#531)", async () => {
    const { user } = renderWithProviders(
      <TrackResult track={{ ...track, bpm: "103", bpm_confidence: 0.02 }} />
    );

    await user.click(screen.getByRole("button", { name: "Uncertain BPM" }));

    expect(await screen.findByText(/Uncertain BPM — .* only 2% confident/)).toBeTruthy();
  });

  it("shows no '!' and no trigger for a clear BPM (#722)", async () => {
    renderWithProviders(<TrackResult track={{ ...track, bpm: "103", bpm_confidence: 0.26 }} />);

    expect(screen.queryByRole("button", { name: "Uncertain BPM" })).toBeNull();
    expect(screen.queryByRole("button", { name: "BPM confidence" })).toBeNull();
    expect(screen.getByText("103 BPM")).toBeTruthy();
  });

  it("shows nothing clickable for a BPM with no confidence on record (#531)", () => {
    renderWithProviders(<TrackResult track={{ ...track, bpm: "103", bpm_confidence: null }} />);

    expect(screen.queryByRole("button", { name: "Uncertain BPM" })).toBeNull();
    expect(screen.queryByRole("button", { name: "BPM confidence" })).toBeNull();
  });

  it("shows a static image with no Play button when the track has no local audio", () => {
    renderWithProviders(<TrackResult track={{ ...track, local_audio_url: undefined }} />);

    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("falls back to the placeholder image when artwork fails to load, with or without audio", () => {
    // The artwork is a decorative alt="" image, so it isn't exposed via role="img".
    const { container, rerender } = renderWithProviders(
      <TrackResult track={{ ...track, local_audio_url: undefined }} />
    );
    const image = () => container.querySelector("img") as HTMLImageElement;
    fireEvent.error(image());
    expect(image().src).toContain("data:image/svg+xml");

    rerender(<TrackResult track={track} />);
    fireEvent.error(image());
    expect(image().src).toContain("data:image/svg+xml");
  });

  it("plays the track when the artwork is clicked", async () => {
    const { user } = renderWithProviders(<TrackResult track={track} />);

    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(mocks.replacePlaylist).toHaveBeenCalledWith([track], { autoplay: true, startIndex: 0 });
  });

  it("adds the track to the crate when the quick-add button is clicked", async () => {
    const { user } = renderWithProviders(<TrackResult track={track} />);

    await user.click(screen.getByRole("button", { name: "Add to crate", hidden: true }));

    expect(mocks.appendToQueue).toHaveBeenCalledWith(track);
  });

  it("opens the notes popover when the notes icon is clicked", async () => {
    const { user } = renderWithProviders(
      <TrackResult track={{ ...track, notes: "Great transition into this one" }} />
    );

    await user.click(screen.getByRole("button", { name: "Has notes" }));

    expect(await screen.findByText("Great transition into this one")).toBeTruthy();
  });

  it("saves a new rating when a star is clicked", async () => {
    const { user } = renderWithProviders(<TrackResult track={{ ...track, star_rating: 0 }} />);

    await user.click(screen.getByRole("radio", { name: "4 stars", hidden: true }));

    expect(mocks.saveTrack).toHaveBeenCalledWith({
      track_id: track.track_id,
      friend_id: track.friend_id,
      star_rating: 4,
    });
  });

  it("shows the library identifier badge", () => {
    renderWithProviders(<TrackResult track={{ ...track, library_identifier: "LP-099" }} />);

    expect(screen.getByText("LP-099")).toBeTruthy();
  });

  it("shows the playlist count badge when there is one", () => {
    renderWithProviders(<TrackResult track={track} playlistCount={3} />);

    expect(screen.getByText("3 playlists")).toBeTruthy();
  });

  it.each(["row", "card"] as const)(
    "shows a checkbox and reports selection in %s layout",
    async (layout) => {
      const onToggleSelect = vi.fn();
      const { user } = renderWithProviders(
        <TrackResult track={track} layout={layout} isSelected={false} onToggleSelect={onToggleSelect} />
      );

      await user.click(screen.getByRole("checkbox"));

      expect(onToggleSelect).toHaveBeenCalledTimes(1);
    }
  );
});

describe("TrackResult dense layouts", () => {
  it("renders dense card links, genre sources, playlist usage, notes, footer and actions", async () => {
    const denseTrack = {
      ...track,
      genres: ["Source"],
      styles: ["Source Style"],
      album_genres: ["Jazz"],
      album_styles: [],
      track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null }],
      notes: "Dense card note",
      release_id: "release-1",
      username: "crate-owner",
    } as Track;
    const { user, queryClient } = renderWithProviders(
      <TrackResult
        track={denseTrack}
        density="dense"
        playlistCount={2}
        footer={<span>Job footer</span>}
        buttons={<button aria-label="Job details">Details</button>}
      />
    );
    await act(async () => {
      queryClient.setQueryData(queryKeys.genreTree(), [
        { id: "j", name: "Jazz", slug: "jazz", parent_id: null, source: "discogs", track_count: 0, album_count: 0, children: [] },
        { id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, source: "discogs", track_count: 0, album_count: 0, children: [] },
      ]);
    });

    expect(screen.getByTestId("track-result-dense-card")).toBeTruthy();
    expect(screen.getByRole("link", { name: denseTrack.title }).getAttribute("href")).toBe(`/tracks/${denseTrack.track_id}?friend_id=${denseTrack.friend_id}`);
    expect(screen.getByRole("link", { name: denseTrack.artist }).getAttribute("href")).toBe(`/albums?q=${encodeURIComponent(denseTrack.artist)}&friend_id=${denseTrack.friend_id}`);
    expect((await screen.findByRole("link", { name: "Search tracks in Jazz" })).getAttribute("href")).toBe("/?genre=jazz");
    expect((await screen.findByRole("link", { name: "Search tracks in Cumbia" })).getAttribute("href")).toBe("/?genre=cumbia");
    expect(screen.getByText("2 playlists")).toBeTruthy();
    expect(screen.getByText("crate-owner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Has notes" })).toBeTruthy();
    expect(screen.getByText("Job footer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Job details" })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(mocks.saveTrack).toHaveBeenCalledWith({
      track_id: denseTrack.track_id,
      friend_id: denseTrack.friend_id,
      star_rating: 4,
    });
  });

  it("honors dense card field visibility and reports selection", async () => {
    const onToggleSelect = vi.fn();
    const { user } = renderWithProviders(
      <TrackResult
        track={{ ...track, username: "private", notes: "hidden note", star_rating: 0 }}
        density="dense"
        showUsername={false}
        showRating={false}
        showDetails={false}
        showGenres={false}
        showNotes={false}
        showPlaylistCount={false}
        playlistCount={3}
        isSelected
        onToggleSelect={onToggleSelect}
      />
    );

    expect(screen.queryByText("private")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByTestId("track-genres")).toBeNull();
    expect(screen.queryByRole("button", { name: "Has notes" })).toBeNull();
    expect(screen.queryByText("3 playlists")).toBeNull();
    expect(screen.getByRole("checkbox")).toBeTruthy();
    await user.click(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("preserves queue row clicks while links and nested actions remain independent", async () => {
    const onRowClick = vi.fn();
    const onRemove = vi.fn();
    const onToggleSelect = vi.fn();
    const { user } = renderWithProviders(
      <TrackResult
        track={{ ...track, local_audio_url: "track.m4a" }}
        density="dense"
        layout="row"
        onRowClick={onRowClick}
        isSelected={false}
        onToggleSelect={onToggleSelect}
        showRating={false}
        buttons={<button aria-label="Remove track" onClick={onRemove}>Remove</button>}
      />
    );
    const row = screen.getByTestId("track-result-dense-row");

    await user.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("link", { name: track.title }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("link", { name: track.title }), { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Remove track" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    row.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it("plays dense-row artwork without triggering row playback", async () => {
    const onRowClick = vi.fn();
    const playableTrack = { ...track, local_audio_url: "track.m4a" };
    const { user } = renderWithProviders(
      <TrackResult
        track={playableTrack}
        density="dense"
        layout="row"
        onRowClick={onRowClick}
        playlistCount={2}
      />
    );

    expect(screen.getByText("2 playlists")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(mocks.replacePlaylist).toHaveBeenCalledWith(
      [playableTrack],
      { autoplay: true, startIndex: 0 }
    );
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("honors dense row visibility controls for genres, rating, username, usage and duration", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...track, username: "hidden user", notes: "hidden note" }}
        density="dense"
        layout="row"
        showUsername={false}
        showRating={false}
        showDetails={false}
        showGenres={false}
        showNotes={false}
        showPlaylistCount={false}
        playlistCount={4}
      />
    );

    expect(screen.queryByText("hidden user")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByTestId("track-genres")).toBeNull();
    expect(screen.queryByRole("button", { name: "Has notes" })).toBeNull();
    expect(screen.queryByText("4 playlists")).toBeNull();
    expect(screen.queryByText("2:28")).toBeNull();
  });

  it("keeps the dense row genre slot empty when there are no genre values", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...track, genres: [], styles: [], track_genres: [], local_tags: "" }}
        density="dense"
        layout="row"
      />
    );

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("keeps unreconciled local tags visible as plain text in the dense card", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...track, track_genres: [], local_tags: "Feminist Anthem", genres: [], styles: [] }}
        density="dense"
      />
    );

    expect(screen.getByText("Feminist Anthem").closest("a")).toBeNull();
  });

  it.each([
    { score: 0.93, label: "93%" },
    { score: 0.8, label: "80%" },
    { score: 0.7, label: "70%" },
  ])("preserves the dense-card similarity score band for $label", ({ score, label }) => {
    renderWithProviders(<TrackResult track={{ ...track, _semanticScore: score }} density="dense" />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("shows a dense-card album without a year when the year is missing", () => {
    renderWithProviders(<TrackResult track={{ ...track, year: "" }} density="dense" />);
    expect(screen.getByRole("link", { name: track.album }).textContent).toBe(track.album);
  });

  it("shows queue duration and uses the placeholder when dense-row artwork fails", () => {
    const { container } = renderWithProviders(
      <TrackResult track={{ ...track, local_audio_url: undefined }} density="dense" layout="row" />
    );
    expect(screen.getByText("2:28")).toBeTruthy();
    const image = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toContain("data:image/svg+xml");
  });
});

describe("TrackResult state styling across layouts", () => {
  const layouts = [
    ["card", {}],
    ["dense card", { density: "dense" as const }],
    ["row", { layout: "row" as const }],
    ["dense row", { density: "dense" as const, layout: "row" as const }],
  ] as const;

  it.each(layouts)("renders selected, data-issue and score states in the %s layout", (_name, props) => {
    const noBpm = { ...track, bpm: undefined, hasVectors: false } as unknown as Track;
    for (const [score, label] of [[0.95, "95"], [0.8, "80"], [0.5, "50"]] as const) {
      const { unmount } = renderWithProviders(
        <TrackResult
          track={{ ...noBpm, _semanticScore: score } as Track}
          isSelected
          onToggleSelect={vi.fn()}
          {...props}
        />
      );
      // The dense row has no room for a score badge.
      if (_name !== "dense row") {
        expect(screen.getAllByText(new RegExp(`^${label}(\\.0)?%$`)).length).toBeGreaterThan(0);
      }
      unmount();
    }

    const healthy = { ...track, bpm: "120", hasVectors: true } as Track;
    for (const isSelected of [true, false]) {
      const { unmount } = renderWithProviders(
        <TrackResult track={healthy} isSelected={isSelected} onToggleSelect={vi.fn()} {...props} />
      );
      expect(screen.getAllByText(track.title).length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("TrackResult row layout (#685)", () => {
  const longAlbum = "Cumbia Beat Vol. 1 (Experimental Guitar-Driven Tropical Sounds From Perú 1966 1976)";

  it("puts title, artist and Album · Year on three lines of the first cell", () => {
    renderWithProviders(<TrackResult track={{ ...track, album: "Abraxas", year: "1970", release_id: "1065960" }} layout="row" />);

    const grid = screen.getByTestId("track-row-grid");
    const first = grid.children[0] as HTMLElement;
    const albumLine = within(first).getByTestId("track-album-line");
    expect(albumLine.textContent).toBe("Abraxas · 1970");
    expect(within(first).getByText(track.title)).toBeTruthy();
    expect(within(first).getByText(track.artist)).toBeTruthy();
    expect(albumLine.closest("a")?.getAttribute("href")).toBe(`/albums/1065960?friend_id=${track.friend_id}`);
  });

  it("truncates a long album title with an ellipsis and a tooltip", () => {
    renderWithProviders(<TrackResult track={{ ...track, album: longAlbum, year: "1976" }} layout="row" />);

    const albumLine = screen.getByTestId("track-album-line");
    expect(albumLine.getAttribute("title")).toBe(`${longAlbum} · 1976`);
    const style = getComputedStyle(albumLine);
    expect(style.textOverflow).toBe("ellipsis");
    expect(style.whiteSpace).toBe("nowrap");
  });

  it("leaves the year off the album line when the track has none", () => {
    renderWithProviders(<TrackResult track={{ ...track, album: "Abraxas", year: "" }} layout="row" />);

    expect(screen.getByTestId("track-album-line").textContent).toBe("Abraxas");
  });

  it("keeps a long library identifier, the position and the extras whole in the Release cell", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...track, position: "B2", library_identifier: "LP-349-DELUXE-BOX-SET", username: "saegey" }}
        layout="row"
        showUsername
        playlistCount={3}
        sortPositionChange={{ currentPosition: 3, previousPosition: 1 }}
      />
    );

    const release = screen.getByTestId("track-release");
    expect(within(release).getByText("LP-349-DELUXE-BOX-SET-B2")).toBeTruthy();
    expect(within(release).getByText(/#3 was #1/)).toBeTruthy();
    expect(within(release).getByText("saegey")).toBeTruthy();
    expect(within(release).getByText("3 playlists")).toBeTruthy();
    // It wraps rather than clipping, and no badge is allowed to be squeezed.
    expect(getComputedStyle(release).flexWrap).toBe("wrap");
    expect(getComputedStyle(within(release).getByText("LP-349-DELUXE-BOX-SET-B2")).flexShrink).toBe("0");
  });

  it("joins the position to the library identifier as one tag, and shows it alone without one", () => {
    const { rerender } = renderWithProviders(
      <TrackResult track={{ ...track, position: "B1", library_identifier: "LP-123" }} layout="row" />
    );
    const release = screen.getByTestId("track-release");
    expect(within(release).getByText("LP-123-B1")).toBeTruthy();
    expect(within(release).queryByText("B1")).toBeNull();

    rerender(<TrackResult track={{ ...track, position: "B1", library_identifier: null }} layout="row" />);
    expect(within(screen.getByTestId("track-release")).getByText("B1")).toBeTruthy();

    rerender(<TrackResult track={{ ...track, position: "", library_identifier: "LP-123" }} layout="row" />);
    expect(within(screen.getByTestId("track-release")).getByText("LP-123")).toBeTruthy();
  });

  it("keeps the identifier and the position apart on the card", () => {
    renderWithProviders(<TrackResult track={{ ...track, position: "B1", library_identifier: "LP-123" }} />);

    expect(screen.getByText("LP-123")).toBeTruthy();
    expect(screen.getByText("B1")).toBeTruthy();
  });

  it("no longer carries the album or the side in separate columns", () => {
    renderWithProviders(<TrackResult track={{ ...track, album: "Abraxas", position: "A1" }} layout="row" />);

    expect(screen.getAllByText(/Abraxas/)).toHaveLength(1);
  });

  it("shows only the Camelot code in the row, with the key name as a tooltip", () => {
    renderWithProviders(<TrackResult track={{ ...track, key: "Bb minor", key_confidence: 0.4 }} layout="row" />);

    const code = screen.getByText("3A");
    expect(getComputedStyle(code).flexShrink).toBe("0");
    expect(screen.queryByText("Bb minor")).toBeNull();
    expect(code.parentElement?.getAttribute("title")).toBe("Bb minor");
  });

  it("keeps the full key name on the card, as a tooltip on a phone", () => {
    renderWithProviders(<TrackResult track={{ ...track, key: "Bb minor" }} />);

    expect(screen.getByTestId("track-card-key").getAttribute("title")).toBe("Bb minor");
    // Desktop shows the name; a phone shows the dot and Camelot code only.
    expect(getComputedStyle(screen.getByText("Bb minor")).display).toBe("none");
  });

  it("gives a single long genre tag an ellipsis and a tooltip instead of cutting it mid-letter", () => {
    renderWithProviders(
      <TrackResult
        track={{
          ...track,
          track_genres: [{ id: "r", name: "Rock en Español", slug: "rock-en-espanol", parent_id: null, parent_name: null }],
        }}
        layout="row"
      />
    );

    const tag = within(screen.getByTestId("track-genres")).getByText("Rock en Español");
    expect(tag.getAttribute("title")).toBe("Rock en Español");
  });

  it("wraps genre tags on the card instead of shrinking them", () => {
    renderWithProviders(<TrackResult track={track} />);

    const desktopRow = screen.getByTestId("track-genres").firstElementChild as HTMLElement;
    expect(getComputedStyle(desktopRow).flexWrap).toBe("wrap");
  });

  it("is tall enough for three lines", () => {
    expect(TRACK_ROW_HEIGHT).toBe(80);
  });

  it("shares one grid with the header so the columns cannot drift", () => {
    renderWithProviders(
      <>
        <TrackListHeader />
        <TrackResult track={track} layout="row" />
      </>
    );

    const rowGrid = screen.getByTestId("track-row-grid");
    const headerGrid = screen.getByText("Release").parentElement as HTMLElement;
    expect(getComputedStyle(rowGrid).gridTemplateColumns).toContain("minmax(150px");
    expect(getComputedStyle(headerGrid).gridTemplateColumns).toBe(getComputedStyle(rowGrid).gridTemplateColumns);
    expect(TRACK_ROW_GRID_TEMPLATE.split(/\s(?![^()]*\))/)).toHaveLength(6);
    // Same columns, same order, in the header and the row.
    const labels = ["Track", "Release", "Time", "BPM / Key", "Genre", "Rating"];
    expect(Array.from(headerGrid.children).map((el) => el.textContent)).toEqual(labels);
    expect(headerGrid.children).toHaveLength(rowGrid.children.length);
    // The key sits beside BPM, in the same cell in the header and the row.
    expect(headerGrid.children[3].querySelector("[data-col=key]")).toBeTruthy();
    expect(rowGrid.children[3].querySelector("[data-col=key]")).toBeTruthy();
    ["genre", "rating"].forEach((col, i) => {
      expect(headerGrid.children[4 + i].getAttribute("data-col")).toBe(col);
      expect(rowGrid.children[4 + i].getAttribute("data-col")).toBe(col);
    });
  });
});

describe("TrackResult card (#722)", () => {
  const cardTrack = {
    ...track,
    library_identifier: "LP-099",
    position: "B2",
    duration_seconds: 263,
    bpm: "124",
    key: "A major",
    notes: "Great opener",
  } as Track;

  it("lists the meta line as library ID, side, duration, BPM, key, then the notes icon", () => {
    renderWithProviders(<TrackResult track={cardTrack} />);

    const meta = screen.getByTestId("track-card-meta");
    const order = ["LP-099", "B2", "4:23", "124 BPM", "11B", "Has notes"];
    const positions = order.map((text) => {
      const el = text === "Has notes" ? within(meta).getByRole("button", { name: text }) : within(meta).getByText(text);
      return Array.from(meta.children).findIndex((child) => child.contains(el));
    });
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(new Set(positions).size).toBe(order.length);
  });

  it("sets the library ID as bold accent text in the label face, not a chip", () => {
    renderWithProviders(<TrackResult track={cardTrack} />);

    const id = screen.getByText("LP-099");
    expect(id.closest("[data-scope=badge]")).toBeNull();
    expect(getComputedStyle(id).fontWeight).toContain("bold");
  });

  it("shows the key as plain inline text: code in bold, name beside it, no chip", () => {
    renderWithProviders(<TrackResult track={cardTrack} />);

    const key = screen.getByTestId("track-card-key");
    expect(within(key).getByText("11B")).toBeTruthy();
    expect(within(key).getByText("A major")).toBeTruthy();
    expect(getComputedStyle(key).borderWidth).toBe("0px");
    expect(getComputedStyle(within(key).getByText("11B")).fontWeight).toContain("bold");
  });

  it("puts a '!' after the key name only below the confidence threshold", async () => {
    const { rerender, user } = renderWithProviders(
      <TrackResult track={{ ...cardTrack, key_confidence: 0.42 }} />
    );
    const key = screen.getByTestId("track-card-key");
    const bang = within(key).getByRole("button", { name: "Uncertain key" });
    expect(bang.textContent).toBe("!");
    expect(key.lastElementChild).toBe(bang);
    await user.click(bang);
    expect(await screen.findByText(/42% confident/)).toBeTruthy();

    rerender(<TrackResult track={{ ...cardTrack, key_confidence: 0.9 }} />);
    expect(within(screen.getByTestId("track-card-key")).queryByRole("button")).toBeNull();
  });

  it("flags an uncertain BPM with a '!' too", () => {
    renderWithProviders(<TrackResult track={{ ...cardTrack, bpm_confidence: 0.02 }} />);

    expect(screen.getByRole("button", { name: "Uncertain BPM" })).toBeTruthy();
  });

  it("reserves 32px for the corner menu on a phone and puts the menu in the corner", () => {
    renderWithProviders(<TrackResult track={cardTrack} buttons={<button type="button">Menu</button>} />);

    const titleRow = screen.getByRole("link", { name: track.title }).parentElement as HTMLElement;
    expect(getComputedStyle(titleRow).paddingRight).toBe("32px");
    const artistRow = screen.getByText(track.artist).closest("a")?.parentElement as HTMLElement;
    expect(getComputedStyle(artistRow).paddingRight).toBe("32px");
    const actions = screen.getByTestId("track-card-actions");
    expect(getComputedStyle(actions).position).toBe("absolute");
    expect(actions.contains(screen.getByRole("button", { name: "Menu" }))).toBe(true);
    // The meta line is not inset.
    expect(getComputedStyle(screen.getByTestId("track-card-meta")).paddingRight).toBe("0");
  });

  it("carries the container shadow (the outline is checked in the browser)", () => {
    renderWithProviders(<TrackResult track={cardTrack} />);

    const style = getComputedStyle(screen.getByTestId("track-card"));
    // Semantic tokens stay as CSS variables in jsdom.
    expect(style.boxShadow).toContain("shadows-md");
  });

  it("shows the album with the artist on one line, and the year only on desktop", () => {
    renderWithProviders(<TrackResult track={cardTrack} />);

    expect(screen.getByTestId("track-album-line").textContent).toContain(`${track.album} (${track.year})`);
    expect(getComputedStyle(screen.getByText(`(${track.year})`)).display).toBe("none");
  });

  it("keeps a card with no BPM, no key and no genres compact", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...cardTrack, bpm: null, key: null, track_genres: [], local_tags: "", styles: [], genres: [], notes: "" }}
      />
    );

    expect(screen.getByText("No BPM")).toBeTruthy();
    expect(screen.queryByTestId("track-card-key")).toBeNull();
    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("keeps the footer slot", () => {
    renderWithProviders(<TrackResult track={cardTrack} footer={<span>#3 · 12 plays</span>} />);

    expect(screen.getByText("#3 · 12 plays")).toBeTruthy();
  });

  it("omits the duration when the track has none", () => {
    renderWithProviders(<TrackResult track={{ ...cardTrack, duration_seconds: undefined, duration: "" }} />);

    expect(within(screen.getByTestId("track-card-meta")).queryByText(/^\d+:\d{2}$/)).toBeNull();
  });

  it("drops the genre and rating row when both are turned off, and keeps it for the rating alone", () => {
    const { rerender } = renderWithProviders(<TrackResult track={cardTrack} showGenres={false} showRating={false} />);
    expect(screen.queryByTestId("track-genres")).toBeNull();
    expect(screen.queryByRole("radio", { name: "4 stars", hidden: true })).toBeNull();

    rerender(<TrackResult track={cardTrack} showGenres={false} />);
    expect(screen.getByRole("radio", { name: "4 stars", hidden: true })).toBeTruthy();
    expect(screen.queryByTestId("track-genres")).toBeNull();
  });
});
