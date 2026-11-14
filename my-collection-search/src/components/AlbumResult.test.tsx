// @vitest-environment jsdom
import React from "react";
const playerMocks = vi.hoisted(() => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({ usePlaybackPlayer: () => playerMocks }));
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Album } from "@/types/track";
import { TRACK_CARD_COVER_SIZE, TRACK_ROW_COVER_SIZE } from "@/components/TrackResult";

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbum: () => undefined }));
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAlbumsQuery", () => ({
  useUpdateAlbumMutation: () => ({ mutateAsync: vi.fn(), mutate }),
}));
// The care dialog has its own tests; here it only has to open, for this album.
vi.mock("@/components/records/RecordActionDialog", () => ({
  default: (props: {
    releaseId: string;
    friendId: number;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label="Log care">
      {props.releaseId}:{props.friendId}
      <button onClick={() => props.onOpenChange(false)}>Close care</button>
    </div>
  ),
}));
const api = vi.hoisted(() => ({
  getAlbumWithTracks: vi.fn(),
  queueAlbumDownloads: vi.fn(),
  fetchAlbumDiscogsRawRelease: vi.fn(),
}));
vi.mock("@/services/internalApi/albums", () => api);
vi.mock("@/components/AlbumArtworkDialog", () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div role="dialog" aria-label="Cover art" /> : null,
}));
vi.mock("@/components/DeleteAlbumDialog", () => ({
  default: (props: { open: boolean; onDeleted: () => void }) =>
    props.open ? (
      <div role="alertdialog" aria-label="Delete album">
        <button onClick={props.onDeleted}>Confirm delete</button>
      </div>
    ) : null,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));

import AlbumResult from "./AlbumResult";
import AlbumTable from "./AlbumTable";

const album: Album = {
  release_id: "rel",
  friend_id: 7,
  title: "Blue Lines",
  artist: "Massive Attack",
  track_count: 9,
};

afterEach(() => {
  vi.clearAllMocks();
  setViewportWidth(1280);
});

describe("AlbumResult care action", () => {
  it("opens the care dialog for this album from its menu, and closes it", async () => {
    const { user } = renderWithProviders(<AlbumResult album={album} />);

    expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Log care/i }));

    const dialog = await screen.findByRole("dialog", { name: "Log care" });
    expect(dialog.textContent).toContain("rel:7");

    await user.click(screen.getByRole("button", { name: "Close care" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull());
  });
});

it("badges effective album genres/styles, including intentionally empty replacements", async () => {
  const { rerender } = renderWithProviders(
    <AlbumResult
      album={{
        ...album,
        genres: ["Source"],
        styles: ["Source Style"],
        effective_genres: ["Jazz"],
        effective_styles: ["Fusion"],
      }}
    />,
  );
  expect(screen.getAllByText("Jazz").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Fusion").length).toBeGreaterThan(0);
  expect(screen.queryByText("Source")).toBeNull();
  rerender(
    <AlbumResult
      album={{
        ...album,
        genres: ["Source"],
        styles: ["Source Style"],
        effective_genres: [],
        effective_styles: [],
      }}
    />,
  );
  expect(screen.queryByText("Source Style")).toBeNull();
  expect(screen.queryByText("Fusion")).toBeNull();
});

const full: Album = {
  ...album,
  label: "Virgin",
  country: "UK",
  year: "1991",
  catalog_number: "WBRLP1",
  library_identifier: "LP-42",
  genres: ["Electronic"],
  styles: ["Trip Hop"],
};

const playableTracks: Array<{
  track_id: string;
  friend_id: number;
  position: string;
  local_audio_url?: string;
}> = [
  { track_id: "b1", friend_id: 7, position: "B1", local_audio_url: "/b.mp3" },
  { track_id: "a1", friend_id: 7, position: "A1", local_audio_url: "/a.mp3" },
];

async function openCardActions(tracks = playableTracks) {
  cleanup();
  setViewportWidth(390);
  api.getAlbumWithTracks.mockResolvedValue({ tracks });
  const view = renderWithProviders(
    <AlbumResult album={{ ...full, discogs_url: "https://discogs.com/release/rel" }} />,
  );
  await view.user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
  return view;
}

describe("AlbumResult full actions", () => {
  it("fetches tracks lazily, then shows the full phone action set in order", async () => {
    const { user } = await openCardActions();
    expect(api.getAlbumWithTracks).toHaveBeenCalledWith("rel", 7);
    const dialog = screen.getByRole("dialog");
    for (const action of [
      "Play",
      "Add to queue",
      "Log care",
      "Edit",
      "Enrich album",
      "Cover art",
      "Download missing audio",
      "View raw Discogs file",
      "Delete album",
    ]) {
      expect(await within(dialog).findByText(action)).toBeTruthy();
    }
    expect(within(dialog).getByRole("link", { name: "View on Discogs" }).getAttribute("href")).toBe(
      "https://discogs.com/release/rel",
    );
    expect(within(dialog).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/albums/rel/edit?friend_id=7",
    );
    await user.click(within(dialog).getByText("Add to queue"));
    expect(playerMocks.appendToQueue).toHaveBeenCalledWith([
      expect.objectContaining({ track_id: "a1" }),
      expect.objectContaining({ track_id: "b1" }),
    ]);
  });

  it("plays, downloads, enriches, opens cover and raw viewers, and asks before delete", async () => {
    let view = await openCardActions();
    await view.user.click(within(screen.getByRole("dialog")).getByText("Play"));
    expect(playerMocks.replacePlaylist).toHaveBeenCalledWith(
      [expect.objectContaining({ track_id: "a1" }), expect.objectContaining({ track_id: "b1" })],
      { autoplay: true, startIndex: 0 },
    );

    view = await openCardActions();
    api.queueAlbumDownloads.mockResolvedValue({ tracksQueued: 1 });
    await view.user.click(within(screen.getByRole("dialog")).getByText("Download missing audio"));
    expect(api.queueAlbumDownloads).toHaveBeenCalledWith("rel", 7);

    view = await openCardActions();
    await view.user.click(within(screen.getByRole("dialog")).getByText("Enrich album"));
    expect(routerPush).toHaveBeenCalledWith("/enrich");

    view = await openCardActions();
    await view.user.click(within(screen.getByRole("dialog")).getByText("Cover art"));
    expect(await screen.findByRole("dialog", { name: "Cover art" })).toBeTruthy();

    api.fetchAlbumDiscogsRawRelease.mockResolvedValue({
      file_path: "rel.json",
      data: { title: "Blue Lines" },
    });
    view = await openCardActions();
    await view.user.click(within(screen.getByRole("dialog")).getByText("View raw Discogs file"));
    expect(await screen.findByRole("dialog", { name: "Discogs Raw Release File" })).toBeTruthy();

    view = await openCardActions();
    await view.user.click(within(screen.getByRole("dialog")).getByText("Delete album"));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete album" });
    await view.user.click(within(confirm).getByText("Confirm delete"));
    expect(routerPush).toHaveBeenCalledWith("/albums");
  });

  it.each([
    { tracks: [] as typeof playableTracks },
    { tracks: [{ track_id: "no-audio", friend_id: 7, position: "A1" }] as typeof playableTracks },
  ])("hides Play and Add to queue if the album has no playable audio", async ({ tracks }) => {
    cleanup();
    setViewportWidth(390);
    let resolveTracks!: (value: { tracks: typeof playableTracks }) => void;
    api.getAlbumWithTracks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTracks = resolve;
        }),
    );
    const view = renderWithProviders(
      <AlbumResult album={{ ...full, discogs_url: "https://discogs.com/release/rel" }} />,
    );
    await view.user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await act(async () => resolveTracks({ tracks }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => {
      expect(within(dialog).queryByText("Play")).toBeNull();
      expect(within(dialog).queryByText("Add to queue")).toBeNull();
    });
  });
});

describe("AlbumResult card", () => {
  it("sizes the cover like a track card and keeps it at the top", () => {
    renderWithProviders(<AlbumResult album={full} />);
    const wrap = screen.getByTestId("album-card").firstElementChild as HTMLElement;
    const cover = wrap.firstElementChild as HTMLElement;
    expect(getComputedStyle(wrap).alignSelf).toBe("start");
    expect(getComputedStyle(cover).width).toBe(TRACK_CARD_COVER_SIZE.base);
    expect(getComputedStyle(cover).height).toBe(TRACK_CARD_COVER_SIZE.base);
  });

  it("shows label, country and year, the meta line and the genre tags", () => {
    renderWithProviders(<AlbumResult album={full} missingTags={["missing_audio"]} />);
    expect(screen.getByTestId("album-card")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Blue Lines" }).getAttribute("href")).toBe(
      "/albums/rel?friend_id=7",
    );
    expect(screen.getByText(/Virgin/).textContent).toContain("UK");
    expect(screen.getByText(/Virgin/).textContent).toContain("(1991)");
    const meta = screen.getByTestId("album-card-meta").textContent;
    expect(meta).toContain("LP-42");
    expect(meta).toContain("9 tracks");
    expect(meta).toContain("Cat WBRLP1");
    expect(meta).toContain("No audio");
    expect(screen.getByText("Electronic")).toBeTruthy();
    expect(screen.getByText("Trip Hop")).toBeTruthy();
  });

  it("shows at most two genre tags and counts the rest", () => {
    renderWithProviders(
      <AlbumResult
        album={{ ...full, genres: ["Electronic", "Rock"], styles: ["Trip Hop", "Downtempo"] }}
      />,
    );
    const genres = screen.getByTestId("album-genres");
    expect(genres.textContent).toContain("Electronic");
    expect(genres.textContent).toContain("Rock");
    expect(genres.textContent).not.toContain("Trip Hop");
    const more = screen.getByLabelText("2 more genres");
    expect(more.textContent).toBe("+2");
    expect(more.getAttribute("title")).toBe("Trip Hop, Downtempo");
  });

  it("has no +N at two tags or fewer, and a row keeps them all", () => {
    renderWithProviders(<AlbumResult album={full} />);
    expect(screen.queryByLabelText(/more genres/)).toBeNull();
  });

  it("omits optional parts and the year 0", () => {
    renderWithProviders(<AlbumResult album={{ ...album, track_count: 1, year: "0" }} />);
    const meta = screen.getByTestId("album-card-meta").textContent;
    expect(meta).toContain("1 track");
    expect(meta).not.toContain("tracks");
    expect(meta).not.toContain("Cat");
    expect(screen.queryByText(/\(0\)/)).toBeNull();
    expect(screen.getByTestId("album-genres").getAttribute("aria-label")).toBeNull();
  });

  it("saves a rating", async () => {
    const { user } = renderWithProviders(<AlbumResult album={full} />);
    await user.click(screen.getAllByRole("radio", { hidden: true })[2]);
    expect(mutate).toHaveBeenCalledWith({ release_id: "rel", friend_id: 7, album_rating: 3 });
  });
});

describe("AlbumResult row", () => {
  it("sizes the cover like a track row", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult album={full} layout="row" />
      </AlbumTable>,
    );
    const cover = screen.getByTestId("album-row").querySelector("[data-cover-placeholder], img")
      ?.parentElement as HTMLElement;
    expect(cover).toBeTruthy();
    expect(getComputedStyle(cover).width).toBe(TRACK_ROW_COVER_SIZE.base);
  });

  it("keeps every genre tag", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult
          album={{ ...full, genres: ["Electronic", "Rock"], styles: ["Trip Hop", "Downtempo"] }}
          layout="row"
        />
      </AlbumTable>,
    );
    const row = screen.getByTestId("album-row").textContent;
    expect(row).toContain("Downtempo");
    expect(screen.queryByLabelText(/more genres/)).toBeNull();
  });

  it("renders the table cells with tags for each active Missing filter", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult
          album={full}
          layout="row"
          missingTags={[
            "missing_library_identifier",
            "missing_local_cover_art_url",
            "missing_audio",
          ]}
        />
      </AlbumTable>,
    );
    const row = screen.getByTestId("album-row");
    expect(row.textContent).toContain("Virgin · 1991");
    expect(row.textContent).toContain("LP-42");
    expect(row.textContent).toContain("No identifier");
    expect(row.textContent).toContain("No local cover");
    expect(row.textContent).toContain("No audio");
    expect(row.textContent).toContain("Electronic");
    expect(screen.getByRole("columnheader", { name: "Release" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Genre" })).toBeTruthy();
  });

  it("copes with a bare album", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult album={{ ...album, track_count: 0 }} layout="row" />
      </AlbumTable>,
    );
    expect(screen.getByTestId("album-row").textContent).not.toContain("No audio");
  });
});

describe("AlbumResult compact card", () => {
  it("is one link with no nested links, genre tags, menu or rating", () => {
    renderWithProviders(
      <AlbumResult
        album={{
          ...full,
          title: "A very long album title ".repeat(10),
          effective_genres: ["Jazz"],
          year: "1991",
          format: "LP",
        }}
        size="compact"
      />,
    );
    const card = screen.getByTestId("album-card");
    expect(card.getAttribute("data-size")).toBe("compact");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/albums/rel?friend_id=7");
    expect(card.getAttribute("aria-label")).toMatch(/^Open A very long album/);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(card.querySelector("a")).toBeNull();
    expect(card.querySelector("[data-cover-placeholder]")).toBeTruthy();
    expect(screen.getByTitle(/^A very long album title/)).toBeTruthy();
    // The artist is plain text inside the tile, never an ArtistLink.
    expect(screen.getByText("Massive Attack").closest("a")).toBe(card);
    expect(screen.getByTestId("album-card-meta").textContent).toBe("1991 · LP");
    expect(screen.queryByText("Jazz")).toBeNull();
    expect(screen.queryByText("LP-42")).toBeNull();
    expect(screen.queryByRole("button", { name: "Album actions" })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("leaves the default meta line out when there is no year or format", () => {
    renderWithProviders(
      <AlbumResult album={{ ...full, year: "0", format: undefined }} size="compact" />,
    );
    expect(screen.queryByTestId("album-card-meta")).toBeNull();
  });

  it("puts the caller's meta in place of year · format", () => {
    renderWithProviders(
      <AlbumResult
        album={{ ...full, year: "1991", format: "LP" }}
        size="compact"
        meta={<span>6 PLAYS</span>}
      />,
    );
    expect(screen.getByTestId("album-card-meta").textContent).toBe("6 PLAYS");
    expect(screen.queryByText("1991 · LP")).toBeNull();
  });

  it("follows a responsive size: compact on phones, full from md", () => {
    setViewportWidth(390);
    const { unmount } = renderWithProviders(
      <AlbumResult album={full} size={{ base: "compact", md: "full" }} />,
    );
    expect(screen.getByTestId("album-card").getAttribute("data-size")).toBe("compact");
    unmount();
    setViewportWidth(1280);
    renderWithProviders(<AlbumResult album={full} size={{ base: "compact", md: "full" }} />);
    expect(screen.getByTestId("album-card").getAttribute("data-size")).toBe("full");
    expect(screen.getAllByRole("button", { name: "Album actions" }).length).toBeGreaterThan(0);
  });

  it("defaults a responsive value without a base to the full card", () => {
    setViewportWidth(390);
    renderWithProviders(<AlbumResult album={full} size={{ md: "compact" }} />);
    expect(screen.getByTestId("album-card").getAttribute("data-size")).toBe("full");
  });

  it("is never compact as a table row", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult album={full} layout="row" size="compact" />
      </AlbumTable>,
    );
    expect(screen.getByTestId("album-row")).toBeTruthy();
  });
});

describe("AlbumResult full card", () => {
  it("is the default size and renders a caller's meta on its own line", () => {
    renderWithProviders(<AlbumResult album={full} meta={<span>Appears on · 2 tracks</span>} />);
    expect(screen.getByTestId("album-card").getAttribute("data-size")).toBe("full");
    expect(screen.getByTestId("album-card-extra").textContent).toBe("Appears on · 2 tracks");
  });

  it("has no extra line without meta", () => {
    renderWithProviders(<AlbumResult album={full} />);
    expect(screen.queryByTestId("album-card-extra")).toBeNull();
  });
});

it.each([
  ["/chosen.jpg", "/discogs.jpg", "/chosen.jpg"],
  ["", "/discogs.jpg", "/discogs.jpg"],
  ["", "", undefined],
])("uses the resolved cover in album actions (%s, %s)", async (chosen, discogs, expected) => {
  const { user } = renderWithProviders(
    <AlbumResult
      album={{
        ...album,
        audio_file_album_art_url: chosen,
        album_thumbnail: discogs,
      }}
    />,
  );
  await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.querySelector("img")?.getAttribute("src")).toBe(expected);
});
