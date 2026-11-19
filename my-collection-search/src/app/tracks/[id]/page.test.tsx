// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

const modalProps = vi.hoisted(() => vi.fn());
const replacePlaylist = vi.hoisted(() => vi.fn());
const reprobe = vi.hoisted(() => vi.fn());
const setTrack = vi.hoisted(() => vi.fn());
const currentLibraryFriend = vi.hoisted(() => ({ id: 6, username: "dj" }));
const queries = vi.hoisted(() => ({
  trackQuery: {
    isLoading: false,
    error: null,
    data: { track_id: "t1", friend_id: 6, title: "Song" } as Record<string, unknown>,
  },
  playlistsQuery: {},
  audioMetadataQuery: {},
  essentiaQuery: {},
  identityEmbeddingPreviewQuery: { id: "identity" },
  contextEmbeddingPreviewQuery: { id: "context" },
  audioVibeEmbeddingPreviewQuery: { id: "vibe" },
  extractCoverMutation: {},
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useSearchParams: () => new URLSearchParams("friend_id=6"),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist }),
}));
vi.mock("@/services/internalApi/tracks", () => ({ reprobeTrackAudio: reprobe }));
vi.mock("@/stores/trackStore", () => ({ useTrackStore: { getState: () => ({ setTrack }) } }));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: currentLibraryFriend }),
}));
const lyricsApi = vi.hoisted(() => ({
  fetchTrackLyrics: vi.fn(),
  saveTrackLyrics: vi.fn(),
  clearTrackLyrics: vi.fn(),
}));
vi.mock("@/services/internalApi/trackLyrics", () => lyricsApi);
vi.mock("@/hooks/useTrackDetailQueries", () => ({ useTrackDetailQueries: () => queries }));
vi.mock("@/components/AlbumArtworkDialog", () => ({
  default: (props: {
    open: boolean;
    releaseId: string;
    albumTitle?: string;
    onOpenChange: (open: boolean) => void;
  }) =>
    props.open ? (
      <div role="dialog" aria-label="Cover art">
        {props.releaseId}:{props.albumTitle}
        <button onClick={() => props.onOpenChange(false)}>Close art</button>
      </div>
    ) : null,
}));
vi.mock("@/hooks/useTrack", () => ({ useTrack: () => undefined }));
vi.mock("@/components/TrackActionsMenu", () => ({
  default: (props: {
    prominent?: boolean;
    onChangeArtwork?: () => void;
    onOpenTrackDebug?: () => void;
    onOpenFileInfo?: () => void;
    onOpenLyrics?: () => void;
    hasLyrics?: boolean;
  }) => (
    <div
      data-testid="header-menu"
      data-prominent={String(props.prominent)}
      data-has-lyrics={String(props.hasLyrics)}
    >
      {props.onOpenLyrics && <button onClick={props.onOpenLyrics}>Header lyrics</button>}
      {props.onChangeArtwork && <button onClick={props.onChangeArtwork}>Header cover art</button>}
      <button onClick={props.onOpenTrackDebug}>Header debug</button>
      <button onClick={props.onOpenFileInfo}>Header file info</button>
    </div>
  ),
}));
vi.mock("@/components/RelatedTracksSection", () => ({ default: () => null }));
vi.mock("@/components/track-detail", () => ({
  TrackPlaylistsSection: () => null,
  TrackLyricsDialog: (props: { trackId: string; friendId: number; open: boolean }) =>
    props.open ? (
      <div role="dialog" aria-label="Lyrics">
        {props.trackId}:{props.friendId}
      </div>
    ) : null,
  TrackHeader: (props: {
    showUsername?: boolean;
    onChangeArtwork?: () => void;
    menuInPageHeader?: boolean;
    fileInfoOpen?: boolean;
    onReprobe?: () => Promise<void>;
  }) => (
    <div
      data-testid="track-result"
      data-show-username={String(props.showUsername)}
      data-menu-in-page-header={String(props.menuInPageHeader)}
    >
      {props.onChangeArtwork && <button onClick={props.onChangeArtwork}>Cover Art...</button>}
      {props.fileInfoOpen && <button onClick={() => void props.onReprobe?.()}>Probe</button>}
    </div>
  ),
  TrackDebugModal: (props: unknown) => {
    modalProps(props);
    return null;
  },
}));

import TrackPage from "./page";

beforeEach(() => {
  currentLibraryFriend.id = 6;
  lyricsApi.fetchTrackLyrics.mockReset().mockResolvedValue({ kind: "none" });
  setViewportWidth(1280);
});

describe("TrackPage", () => {
  it("labels the phone bar Track and keeps the full title as the h1", () => {
    renderWithProviders(<TrackPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Song" })).toBeTruthy();
    expect(screen.getByTestId("page-header-phone-title").textContent).toBe("Track");
  });

  it("opens the lyrics dialog from the menu for the owner's track with lyrics", async () => {
    lyricsApi.fetchTrackLyrics.mockResolvedValue({
      kind: "lyrics",
      lyrics: { text: "Words", source: "embedded", updated_at: "2026-11-11" },
    });
    const { user } = renderWithProviders(<TrackPage />);
    const item = await screen.findByRole("button", { name: "Header lyrics", hidden: true });
    expect(screen.getByTestId("header-menu").getAttribute("data-has-lyrics")).toBe("true");
    expect(screen.queryByRole("dialog", { name: "Lyrics" })).toBeNull();
    await user.click(item);
    expect(screen.getByRole("dialog", { name: "Lyrics" }).textContent).toBe("t1:6");
    expect(lyricsApi.fetchTrackLyrics).toHaveBeenCalledWith("t1", 6);
  });

  it("offers Add lyrics on the owner's track without any", async () => {
    renderWithProviders(<TrackPage />);
    await screen.findByRole("button", { name: "Header lyrics", hidden: true });
    expect(screen.getByTestId("header-menu").getAttribute("data-has-lyrics")).toBe("false");
  });

  it("has no lyrics item on a friend's track", async () => {
    lyricsApi.fetchTrackLyrics.mockResolvedValue({ kind: "not_owner" });
    renderWithProviders(<TrackPage />);
    await waitFor(() => expect(lyricsApi.fetchTrackLyrics).toHaveBeenCalled());
    // Let the read settle, then check the item never appears.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: "Header lyrics", hidden: true })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Lyrics" })).toBeNull();
  });

  it("hands the debug modal the context embedding preview", () => {
    renderWithProviders(<TrackPage />);
    expect(modalProps).toHaveBeenCalledWith(
      expect.objectContaining({
        identityEmbeddingPreviewQuery: { id: "identity" },
        contextEmbeddingPreviewQuery: { id: "context" },
        audioVibeEmbeddingPreviewQuery: { id: "vibe" },
      }),
    );
  });
});

describe("TrackPage play action", () => {
  it("plays audio from the header and disables the action without it", async () => {
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      local_audio_url: "/audio/song.m4a",
    };
    const { user, unmount } = renderWithProviders(<TrackPage />);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(replacePlaylist).toHaveBeenCalledWith([queries.trackQuery.data], {
      autoplay: true,
      startIndex: 0,
    });
    expect(screen.queryByRole("heading", { name: "File" })).toBeNull();
    unmount();
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    const play = screen.getByRole("button", { name: "Play" }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(play.title).toBe("No audio file for this track");
  });
});

describe("TrackPage file info", () => {
  it("opens the shared details and writes a re-probe result to the store", async () => {
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      local_audio_url: "/audio/song.m4a",
    };
    const updated = { ...queries.trackQuery.data, audio_codec: "aac" };
    reprobe.mockResolvedValueOnce(updated);
    const { user } = renderWithProviders(<TrackPage />);
    await user.click(screen.getByRole("button", { name: "Header file info", hidden: true }));
    await user.click(screen.getByRole("button", { name: "Probe" }));
    await waitFor(() => expect(setTrack).toHaveBeenCalledWith(updated));
    expect(reprobe).toHaveBeenCalledWith(queries.trackQuery.data);
  });
});

describe("TrackPage username attribution", () => {
  // The URL's friend_id is fixed at 6 by the next/navigation mock above.
  it("hides the username when the track is in the library already being browsed", () => {
    currentLibraryFriend.id = 6;
    renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("track-result").dataset.showUsername).toBe("false");
  });

  it("shows the username when the track belongs to a different library", () => {
    currentLibraryFriend.id = 99;
    renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("track-result").dataset.showUsername).toBe("true");
  });
});

describe("TrackPage header meta", () => {
  it("shows each fact once: no meta on the title, the card holds them (#1231)", () => {
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      library_identifier: "LP-322",
      duration_seconds: 252,
      bpm: "124",
      key: "A minor",
    };
    renderWithProviders(<TrackPage />);
    expect(screen.queryByTestId("page-header-meta")).toBeNull();
  });

  it("ends the trail at the album, which stays a link, and names the track only in the h1", () => {
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      release_id: "r9",
      album: "Blue Lines",
    };
    renderWithProviders(<TrackPage />);
    const trail = screen.getByTestId("page-header-breadcrumbs");
    expect(trail.textContent).toBe("Tracks/Blue Lines");
    expect(within(trail).getByRole("link", { name: "Blue Lines", hidden: true })).toBeTruthy();
    expect(trail.querySelector("[aria-current]")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to Blue Lines", hidden: true }).getAttribute("href"),
    ).toBe("/albums/r9?friend_id=6");
  });

  it("trails just Tracks for a track with no album", () => {
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("page-header-breadcrumbs").textContent).toBe("Tracks");
    expect(
      screen.getByRole("link", { name: "Back to Tracks", hidden: true }).getAttribute("href"),
    ).toBe("/tracks");
  });
});

describe("TrackPage cover art (#494)", () => {
  it("opens the album artwork dialog from the track menu", async () => {
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      release_id: "r9",
      album: "Blue Lines",
    };
    const { user } = renderWithProviders(<TrackPage />);

    await user.click(screen.getByRole("button", { name: "Header cover art", hidden: true }));
    expect(screen.getByRole("dialog", { name: "Cover art" }).textContent).toContain(
      "r9:Blue Lines",
    );

    await user.click(screen.getByRole("button", { name: "Close art" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cover art" })).toBeNull());
  });

  it("offers no cover art action for a track without an album", () => {
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    expect(screen.queryByRole("button", { name: "Cover Art..." })).toBeNull();
  });
});

describe("TrackPage breadcrumbs", () => {
  it("trails Tracks > Album > Track for a track on a release", () => {
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      release_id: "r9",
      album: "Blue Lines",
    };
    renderWithProviders(<TrackPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Song" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to Blue Lines", hidden: true }).getAttribute("href"),
    ).toBe("/albums/r9?friend_id=6");
    expect(screen.getByRole("link", { name: "Tracks", hidden: true }).getAttribute("href")).toBe(
      "/tracks",
    );
  });

  it("skips the album crumb when the album is unknown", () => {
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    expect(
      screen.getByRole("link", { name: "Back to Tracks", hidden: true }).getAttribute("href"),
    ).toBe("/tracks");
    expect(screen.queryByRole("link", { name: "Blue Lines" })).toBeNull();
  });
});

describe("TrackPage actions menu placement", () => {
  it("puts the menu in the page header on desktop too, not the track card", () => {
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("header-menu").dataset.prominent).toBe("false");
  });

  it("moves the menu into the page header on a phone", async () => {
    setViewportWidth(375);
    queries.trackQuery.data = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      release_id: "r9",
      album: "Blue Lines",
    };
    const { user } = renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("header-menu").dataset.prominent).toBe("true");

    await user.click(screen.getByRole("button", { name: "Header cover art" }));
    expect(screen.getByRole("dialog", { name: "Cover art" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Header debug" }));
    expect(modalProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }));
  });

  it("offers no cover art in the header menu for a track without an album", () => {
    setViewportWidth(375);
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    expect(screen.queryByRole("button", { name: "Header cover art" })).toBeNull();
  });
});
