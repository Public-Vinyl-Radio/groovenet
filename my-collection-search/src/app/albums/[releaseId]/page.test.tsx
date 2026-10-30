// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";

// Only the record-care wiring is under test; everything else is stubbed.
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useParams: () => ({ releaseId: "rel" }),
  useSearchParams: () => new URLSearchParams("friend_id=7"),
  useRouter: () => ({ push: routerPush }),
}));
const updateAlbum = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAlbumsQuery", () => ({
  useAlbumDetailQuery: () => ({ error: null }),
  useUpdateAlbumMutation: () => ({ mutate: updateAlbum, mutateAsync: vi.fn() }),
}));
const openForTracks = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAddToPlaylistDialog", () => ({
  useAddToPlaylistDialog: () => ({
    openForTracks,
    playlistDialog: <div data-testid="playlist-dialog" />,
    nameDialog: null,
  }),
}));
const spins = vi.hoisted(() => ({
  current: { data: undefined, spins: [] } as { data: unknown; spins: unknown[] },
}));
vi.mock("@/hooks/useAlbumSpins", () => ({
  ALBUM_SPINS_PAGE: 8,
  useAlbumSpins: () => spins.current,
}));
vi.mock("@/components/spins/SpinFormDialog", () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div role="dialog" aria-label="Log spin" /> : null,
}));
vi.mock("@/components/TrackActionsMenu", () => ({
  default: (props: { track: { title: string } }) => (
    <button aria-label={`Actions for ${props.track.title}`}>menu</button>
  ),
}));
const album = vi.hoisted(() => ({
  current: {
    release_id: "rel",
    friend_id: 7,
    title: "Blue Lines",
    artist: "Massive Attack",
    track_count: 0,
  } as Record<string, unknown>,
}));
vi.mock("@/hooks/useAlbum", () => ({
  useAlbum: () => album.current,
  useAlbumHydrated: () => true,
}));
const albumTracks = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("@/hooks/useTrack", () => ({
  useTracksByRelease: () => albumTracks.current,
  useTracksByReleaseHydrated: () => true,
}));
const replacePlaylist = vi.hoisted(() => vi.fn());
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));
const queueDownloads = vi.hoisted(() => vi.fn());
const enrichQueue = vi.hoisted(() => vi.fn());
vi.mock("@/stores/enrichmentStore", () => ({
  useEnrichmentStore: (select: (state: { setQueue: typeof enrichQueue }) => unknown) =>
    select({ setQueue: enrichQueue }),
}));
vi.mock("@/services/internalApi/albums", () => ({
  fetchAlbumDiscogsRawRelease: vi.fn(() => new Promise(() => {})),
  queueAlbumDownloads: queueDownloads,
}));
vi.mock("@/components/spins/AlbumSpinPanel", () => ({ default: () => null }));
vi.mock("@/components/records/AlbumRecordCarePanel", () => ({
  default: (props: { releaseId: string; friendId: number }) => (
    <section aria-label="Copies & care">
      {props.releaseId}:{props.friendId}
    </section>
  ),
}));
vi.mock("@/components/records/RecordActionDialog", () => ({
  default: (props: { open: boolean; releaseId: string; onOpenChange: (open: boolean) => void }) =>
    props.open ? (
      <div role="dialog" aria-label="Log care">
        <button onClick={() => props.onOpenChange(false)}>Close care</button>
      </div>
    ) : null,
}));

vi.mock("@/components/AlbumArtworkDialog", () => ({
  default: (props: { open: boolean; releaseId: string; onOpenChange: (open: boolean) => void }) =>
    props.open ? (
      <div role="dialog" aria-label="Cover art">
        <button onClick={() => props.onOpenChange(false)}>Close art</button>
      </div>
    ) : null,
}));

vi.mock("@/components/DeleteAlbumDialog", () => ({
  default: (props: {
    open: boolean;
    releaseId: string;
    onClose: () => void;
    onDeleted: () => void;
    notify: (opts: { title: string; type: string }) => void;
  }) =>
    props.open ? (
      <div role="dialog" aria-label="Delete album">
        <button onClick={() => props.onClose()}>Close delete</button>
        <button
          onClick={() => {
            props.notify({ title: "Album deleted.", type: "success" });
            props.onDeleted();
          }}
        >
          Confirm delete
        </button>
      </div>
    ) : null,
}));

import AlbumDetailPage from "./page";

afterEach(() => vi.clearAllMocks());

describe("album page record care", () => {
  it("shows the copies panel and logs care from the album menu", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);

    expect((await screen.findByRole("region", { name: "Copies & care" })).textContent).toBe(
      "rel:7",
    );

    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Log care/i }));
    expect(await screen.findByRole("dialog", { name: "Log care" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close care" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull());
  });
});

describe("album page genre badges", () => {
  const base = {
    release_id: "rel",
    friend_id: 7,
    title: "Blue Lines",
    artist: "Massive Attack",
    track_count: 0,
  };
  const taxonomy = [
    {
      id: "e",
      name: "Electronic",
      slug: "electronic",
      parent_id: null,
      source: "discogs",
      track_count: 0,
      album_count: 0,
      aliases: ["trip-hop"],
      children: [],
    },
  ];

  afterEach(() => {
    album.current = base;
  });

  it("links Discogs genres and styles the taxonomy knows to album search", async () => {
    album.current = { ...base, genres: ["Electronic"], styles: ["Trip Hop", "Trip-Hop"] };
    const { queryClient } = renderWithProviders(<AlbumDetailPage />);
    queryClient.setQueryData(queryKeys.genreTree(), taxonomy);

    const link = await screen.findByRole("link", {
      name: "Search albums in Electronic",
      hidden: true,
    });
    expect(link.getAttribute("href")).toBe("/albums?genre=electronic");
    expect(
      (
        await screen.findByRole("link", { name: "Search albums in Trip-Hop", hidden: true })
      ).getAttribute("href"),
    ).toBe("/albums?genre=electronic");
    expect(screen.getByText("Trip Hop").closest("a")).toBeNull();
  });

  it("shows styles alone when the album has no Discogs genres", async () => {
    album.current = { ...base, genres: [], styles: ["Dub"] };
    renderWithProviders(<AlbumDetailPage />);

    expect(await screen.findByText("Dub")).toBeTruthy();
  });
});

describe("album page cover art (#494)", () => {
  it("opens the artwork dialog from the album menu and from the cover itself", async () => {
    album.current = {
      release_id: "rel",
      friend_id: 7,
      title: "Blue Lines",
      artist: "Massive Attack",
      track_count: 0,
      album_thumbnail: "https://i.discogs.com/a.jpg",
      audio_file_album_art_url: "/uploads/album-covers/apple.jpg",
    };
    const { user } = renderWithProviders(<AlbumDetailPage />);

    const cover = await screen.findByRole("button", { name: "Change cover art" });
    expect((cover.querySelector("img") as HTMLImageElement).getAttribute("src")).toBe(
      "/uploads/album-covers/apple.jpg",
    );

    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Cover art/i }));
    expect(await screen.findByRole("dialog", { name: "Cover art" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close art" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cover art" })).toBeNull());

    await user.click(cover);
    expect(await screen.findByRole("dialog", { name: "Cover art" })).toBeTruthy();
  });
});

describe("album page delete (#511)", () => {
  it("opens the delete dialog from the album menu and can be dismissed without deleting", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);

    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Delete album/i }));
    expect(await screen.findByRole("dialog", { name: "Delete album" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete album" })).toBeNull());
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("navigates to the albums list once the album is deleted", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);

    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Delete album/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm delete" }));

    expect(routerPush).toHaveBeenCalledWith("/albums");
  });
});

describe("album page layout (#727)", () => {
  const base = {
    release_id: "rel",
    friend_id: 7,
    title: "Blue Lines",
    artist: "Massive Attack",
    track_count: 2,
  };
  const tracks = [
    {
      track_id: "a1",
      friend_id: 7,
      title: "Safe",
      artist: "Massive Attack",
      position: "A1",
      duration: "3:00",
      local_audio_url: "/a.mp3",
    },
    {
      track_id: "b1",
      friend_id: 7,
      title: "Daydreaming",
      artist: "Massive Attack",
      position: "B1",
      duration: "4:00",
      local_audio_url: "/b.mp3",
    },
  ];

  beforeEach(() => {
    album.current = base;
    albumTracks.current = tracks;
    spins.current = { data: {}, spins: [{ session: { played_at: "2026-06-05T19:43:00Z" } }] };
  });
  afterEach(() => {
    albumTracks.current = [];
    spins.current = { data: undefined, spins: [] };
    setViewportWidth(1280);
  });

  it("shows a breadcrumb and an album card whose stats read the tracks and spins", async () => {
    renderWithProviders(<AlbumDetailPage />);
    expect(await screen.findByTestId("page-header-breadcrumbs")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Blue Lines" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Blue Lines" })).toBeTruthy();
    expect(screen.getByText("A 3:00 · B 4:00")).toBeTruthy();
  });

  it("plays the album, a side and a track", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);
    await user.click(await screen.findByRole("button", { name: /Play album/ }));
    expect(replacePlaylist).toHaveBeenLastCalledWith(tracks, { autoplay: true, startIndex: 0 });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Album Enqueued" }));

    await user.click(screen.getByRole("button", { name: "Play side B" }));
    expect(replacePlaylist).toHaveBeenLastCalledWith([tracks[1]], {
      autoplay: true,
      startIndex: 0,
    });
    await user.click(screen.getByRole("button", { name: "Play Safe" }));
    expect(replacePlaylist).toHaveBeenLastCalledWith([tracks[0]], {
      autoplay: true,
      startIndex: 0,
    });
  });

  it("adds the whole album to a playlist and opens the spin form", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);
    await user.click(await screen.findByRole("button", { name: /Add to playlist/ }));
    expect(openForTracks).toHaveBeenCalledWith(tracks, "Blue Lines");
    expect(screen.getByTestId("playlist-dialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Log spin/ }));
    expect(await screen.findByRole("dialog", { name: "Log spin" })).toBeTruthy();
  });

  it("saves a rating", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getAllByRole("radio", { hidden: true })[3]);
    expect(updateAlbum).toHaveBeenCalledWith({ release_id: "rel", friend_id: 7, album_rating: 4 });
  });

  it("queues missing downloads and reports the result", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);
    queueDownloads
      .mockResolvedValueOnce({ tracksQueued: 2 })
      .mockResolvedValueOnce({ tracksQueued: 0 })
      .mockRejectedValueOnce(new Error("nope"));
    for (const title of ["Downloads Queued", "No Downloads Needed", "Download Failed"]) {
      await user.click((await screen.findAllByRole("button", { name: "Album actions" }))[0]);
      await user.click(await screen.findByRole("button", { name: /Download missing/i }));
      await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title })));
    }
  });

  it("sends the tracks to enrichment", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);
    await user.click((await screen.findAllByRole("button", { name: "Album actions" }))[0]);
    await user.click(await screen.findByRole("button", { name: /Enrich album/i }));
    expect(enrichQueue).toHaveBeenCalledWith([
      { trackId: "a1", friendId: 7 },
      { trackId: "b1", friendId: 7 },
    ]);
    expect(routerPush).toHaveBeenCalledWith("/enrich");
  });

  it("warns instead of playing or enriching an album with no tracks", async () => {
    albumTracks.current = [];
    const { user } = renderWithProviders(<AlbumDetailPage />);
    expect(
      ((await screen.findByRole("button", { name: /Play album/ })) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText("No tracks found for this album.")).toBeTruthy();
    expect(replacePlaylist).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    expect(screen.queryByRole("button", { name: /Enrich album/i })).toBeNull();
  });

  it("puts a back link and the overflow menu in a phone top bar", async () => {
    setViewportWidth(390);
    renderWithProviders(<AlbumDetailPage />);
    expect(
      (await screen.findByRole("link", { name: "Back to Albums", hidden: true })).getAttribute(
        "href",
      ),
    ).toBe("/albums");
    expect(screen.getAllByRole("button", { name: "Album actions" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("album-track-list")).toBeTruthy();
  });
});

it("shows and closes the raw Discogs file in the shared data viewer", async () => {
  const { user } = renderWithProviders(<AlbumDetailPage />);
  await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
  await user.click(await screen.findByRole("button", { name: /View raw Discogs file/i }));
  expect(await screen.findByRole("dialog", { name: "Discogs Raw Release File" })).toBeTruthy();
  await user.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
