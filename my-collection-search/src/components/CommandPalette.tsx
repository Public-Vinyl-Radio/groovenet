"use client";

import React from "react";
import { Command } from "cmdk";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useUsername } from "@/providers/UsernameProvider";
import { usePlaylistsQuery } from "@/hooks/usePlaylistsQuery";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import { useGenreTaxonomyQuery, useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { importPlaylist } from "@/services/internalApi/playlists";
import { searchTracks } from "@/services/internalApi/tracks";
import { searchAlbums, getAlbumWithTracks } from "@/services/internalApi/albums";
import { matchGenresForPalette, genreSearchHref } from "@/lib/genres/links";
import type { GenreOption } from "@/lib/genres/options";
import { isTrackSearchMode } from "@/components/search/SearchModeToggle";
import type { Album, Track } from "@/types/track";
import { toaster } from "@/components/ui/toaster";
import { analytics } from "@/lib/analytics/client";
import type { AnalyticsEvents } from "@/lib/analytics/events";
import styles from "./CommandPalette.module.css";

type TrackHit = Track;
type AlbumHit = Album;

const NAV_ITEMS = [
  { href: "/", label: "Tracks" },
  { href: "/albums", label: "Albums" },
  { href: "/genres", label: "Genres" },
  { href: "/playlists", label: "Playlists" },
  { href: "/jobs", label: "Jobs" },
  { href: "/settings", label: "Settings" },
];

const isEditableTarget = (el: EventTarget | null): boolean => {
  if (!el || !(el as HTMLElement).closest) return false;
  return !!(el as HTMLElement).closest("input, textarea, [contenteditable='true']");
};

// Broader guard for Space — also skip buttons/links so they still activate normally
const isInteractiveTarget = (el: EventTarget | null): boolean => {
  if (!el || !(el as HTMLElement).closest) return false;
  return !!(el as HTMLElement).closest(
    "input, textarea, [contenteditable='true'], button, a, select, [role='button'], [role='menuitem'], [role='option'], [role='tab']"
  );
};

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { friend } = useUsername();
  const { playlists } = usePlaylistsQuery({ enabled: true });
  const { genres: genreOptions } = useGenreTaxonomyQuery();
  const genreLookup = useGenreLookup();
  const {
    playlist,
    playlistLength,
    isPlaying,
    play,
    pause,
    playNext,
    playPrev,
    clearQueue,
    replacePlaylist,
  } = usePlaylistPlayer();

  const { paletteOpen: open, setPaletteOpen: setOpen } = useCommandPalette();

  const [query, setQuery] = React.useState("");
  const [trackHits, setTrackHits] = React.useState<TrackHit[]>([]);
  const [albumHits, setAlbumHits] = React.useState<AlbumHit[]>([]);
  const [loadingTracks, setLoadingTracks] = React.useState(false);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — toggle palette
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // Player shortcuts — skip when palette is open (so typing in the palette doesn't trigger them)
      if (open) return;

      // Space — play/pause (only when queue has tracks)
      if (e.key === " ") {
        if (isInteractiveTarget(e.target)) return;
        if (playlist && playlist.length > 0) {
          e.preventDefault();
          if (isPlaying) pause();
          else play();
        }
        return;
      }

      // ] — next track
      if (e.key === "]") {
        if (isEditableTarget(e.target)) return;
        playNext();
        return;
      }

      // [ — previous track
      if (e.key === "[") {
        if (isEditableTarget(e.target)) return;
        playPrev();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isPlaying, play, pause, playNext, playPrev, playlist, setOpen]);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open) return;
      const q = query.trim();
      if (q.length === 0) {
        setTrackHits([]);
        setAlbumHits([]);
        return;
      }
      setLoadingTracks(true);
      const trackParams: Parameters<typeof searchTracks>[0] = {
        q,
        limit: 8,
        offset: 0,
      };
      if (friend?.id) {
        trackParams.filter = `friend_id = ${friend.id}`;
      }
      const albumParams: Parameters<typeof searchAlbums>[0] = { q, limit: 5 };
      if (friend?.id) albumParams.friend_id = friend.id;

      const [trackResult, albumResult] = await Promise.all([
        searchTracks(trackParams).catch((err) => {
          console.error("Command palette track search error:", err);
          return null;
        }),
        searchAlbums(albumParams).catch((err) => {
          console.error("Command palette album search error:", err);
          return null;
        }),
      ]);
      if (cancelled) return;
      setTrackHits(trackResult?.hits ?? []);
      setAlbumHits(albumResult?.hits ?? []);
      setLoadingTracks(false);
    };

    const handle = setTimeout(run, 180);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, friend?.id]);

  const genreMatches = React.useMemo<GenreOption[]>(
    () => matchGenresForPalette(genreLookup, genreOptions, query),
    [genreLookup, genreOptions, query]
  );

  const filteredPlaylists = React.useMemo(() => {
    const playlistItems = Array.isArray(playlists) ? playlists : [];
    const q = query.trim().toLowerCase();
    if (!q) return playlistItems.slice(0, 8);
    return playlistItems
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [playlists, query]);

  const handleCreatePlaylistFromQueue = React.useCallback(async () => {
    if (!playlist || playlist.length === 0) {
      toaster.create({
        title: "Queue is empty",
        description: "Add tracks to the player queue first.",
        type: "info",
      });
      return;
    }
    const name = window.prompt("New playlist name");
    if (!name || !name.trim()) return;

    const tracks = playlist
      .filter((t) => t.track_id && typeof t.friend_id === "number")
      .map((t) => ({ track_id: t.track_id, friend_id: t.friend_id }));
    if (tracks.length === 0) {
      toaster.create({
        title: "No valid tracks in queue",
        type: "error",
      });
      return;
    }

    try {
      const created = await importPlaylist(name.trim(), tracks);
      toaster.create({
        title: "Playlist created",
        description: name.trim(),
        type: "success",
      });
      if (created?.id) {
        router.push(`/playlists/${created.id}`);
      } else {
        router.push("/playlists");
      }
    } catch (err) {
      console.error("Failed to create playlist from queue:", err);
      toaster.create({ title: "Failed to create playlist", type: "error" });
    }
  }, [playlist, router]);

  const used = (command: AnalyticsEvents["command_palette_used"]["command"]) =>
    analytics.track("command_palette_used", { command });

  const onNavigate = (href: string) => {
    used("navigate");
    if (pathname === href) {
      close();
      return;
    }
    router.push(href);
    close();
  };

  const onOpenTrack = (track: TrackHit) => {
    used("open_track");
    router.push(
      `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`
    );
    close();
  };

  const onPlayTrack = (track: TrackHit) => {
    used("play_track");
    replacePlaylist([track], { autoplay: true, startIndex: 0 });
    close();
  };

  const onOpenGenre = (genre: GenreOption) => {
    used("open_genre");
    router.push(`/genres/${encodeURIComponent(genre.slug)}`);
    close();
  };

  const onSearchGenreTracks = (genre: GenreOption) => {
    used("search_genre_tracks");
    router.push(genreSearchHref(genre.slug, "tracks"));
    close();
  };

  const onSearchGenreAlbums = (genre: GenreOption) => {
    used("search_genre_albums");
    router.push(genreSearchHref(genre.slug, "albums"));
    close();
  };

  const onOpenAlbum = (album: AlbumHit) => {
    used("open_album");
    router.push(
      `/albums/${encodeURIComponent(album.release_id)}?friend_id=${album.friend_id}`
    );
    close();
  };

  const onPlayAlbum = async (album: AlbumHit) => {
    used("play_album");
    close();
    try {
      const { tracks } = await getAlbumWithTracks(album.release_id, album.friend_id);
      if (tracks.length === 0) {
        toaster.create({ title: "Album has no tracks", type: "info" });
        return;
      }
      replacePlaylist(tracks, { autoplay: true, startIndex: 0 });
    } catch (err) {
      console.error("Failed to play album:", err);
      toaster.create({ title: "Failed to play album", type: "error" });
    }
  };

  const trimmedQuery = query.trim();

  // Only reachable once the Search group has rendered, which requires a query.
  const onSearchTracksQuery = () => {
    used("search_tracks_query");
    const params = new URLSearchParams({ q: trimmedQuery });
    const urlMode = searchParams?.get("mode");
    params.set("mode", isTrackSearchMode(urlMode) ? urlMode : "hybrid");
    router.push(`/?${params.toString()}`);
    close();
  };

  const onSearchAlbumsQuery = () => {
    used("search_albums_query");
    router.push(`/albums?q=${encodeURIComponent(trimmedQuery)}`);
    close();
  };

  const onOpenPlaylist = (id?: number) => {
    if (!id) return;
    used("open_playlist");
    router.push(`/playlists/${id}`);
    close();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      overlayClassName={styles.overlay}
      className={styles.dialog}
      label="Command Palette"
    >
      <RadixDialog.Title className={styles.srOnly}>
        Command Palette
      </RadixDialog.Title>
      <Command className={styles.command}>
        <Command.Input
          autoFocus
          placeholder="Search tracks, albums, genres, playlists, or actions…"
          value={query}
          onValueChange={setQuery}
          className={styles.input}
        />
        <Command.List className={styles.list}>
          <Command.Empty className={styles.empty}>
            {loadingTracks ? "Searching…" : "No results."}
          </Command.Empty>

          <Command.Group heading="Navigation" className={styles.group}>
            {NAV_ITEMS.map((item) => (
              <Command.Item
                key={item.href}
                value={item.label}
                onSelect={() => onNavigate(item.href)}
                className={styles.item}
              >
                <div className={styles.itemLabel}>
                  <span className={styles.itemTitle}>{item.label}</span>
                  <span className={styles.itemMeta}>{item.href}</span>
                </div>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Separator className={styles.separator} />

          <Command.Group heading="Player" className={styles.group}>
            <Command.Item
              value="Play/Pause"
              onSelect={() => {
                used("play_pause");
                if (isPlaying) pause();
                else play();
                close();
              }}
              className={styles.item}
            >
              <span className={styles.itemTitle}>
                {isPlaying ? "Pause" : "Play"}
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.kbd}>Space</kbd>
              </span>
            </Command.Item>
            <Command.Item
              value="Next track"
              onSelect={() => {
                used("next_track");
                playNext();
                close();
              }}
              className={styles.item}
            >
              <span className={styles.itemTitle}>Next Track</span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.kbd}>]</kbd>
              </span>
            </Command.Item>
            <Command.Item
              value="Previous track"
              onSelect={() => {
                used("previous_track");
                playPrev();
                close();
              }}
              className={styles.item}
            >
              <span className={styles.itemTitle}>Previous Track</span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.kbd}>[</kbd>
              </span>
            </Command.Item>
            <Command.Item
              value="Clear queue"
              onSelect={() => {
                used("clear_queue");
                clearQueue();
                close();
              }}
              className={styles.item}
            >
              <span className={styles.itemTitle}>Clear Queue</span>
            </Command.Item>
            <Command.Item
              value="Create playlist from queue"
              onSelect={() => {
                used("create_playlist_from_queue");
                handleCreatePlaylistFromQueue();
                close();
              }}
              className={styles.item}
            >
              <div className={styles.itemLabel}>
                <span className={styles.itemTitle}>
                  Create Playlist From Queue
                </span>
                <span className={styles.itemMeta}>
                  {playlistLength} tracks in queue
                </span>
              </div>
            </Command.Item>
          </Command.Group>

          <Command.Separator className={styles.separator} />

          <Command.Group heading="Playlists" className={styles.group}>
            {filteredPlaylists.map((pl) => (
              <Command.Item
                key={`pl-${pl.id}`}
                value={pl.name}
                onSelect={() => onOpenPlaylist(pl.id)}
                className={styles.item}
              >
                <div className={styles.itemLabel}>
                  <span className={styles.itemTitle}>{pl.name}</span>
                  <span className={styles.itemMeta}>
                    {pl.tracks?.length ?? 0} tracks
                  </span>
                </div>
              </Command.Item>
            ))}
          </Command.Group>

          {trimmedQuery.length > 0 && genreMatches.length > 0 && (
            <>
              <Command.Separator className={styles.separator} />
              <Command.Group heading="Genres" className={styles.group}>
                {genreMatches.map((genre) => {
                  const breadcrumb = genre.parent_name
                    ? `${genre.parent_name} › ${genre.name}`
                    : genre.name;
                  return (
                    <React.Fragment key={`genre-${genre.id}`}>
                      <Command.Item
                        value={`${trimmedQuery} open genre ${genre.name}`}
                        onSelect={() => onOpenGenre(genre)}
                        className={styles.item}
                      >
                        <div className={styles.itemLabel}>
                          <span className={styles.itemTitle}>{genre.name}</span>
                          <span className={styles.itemMeta}>
                            Open Genre · {breadcrumb} · {genre.track_count} tracks
                          </span>
                        </div>
                      </Command.Item>
                      <Command.Item
                        value={`${trimmedQuery} search tracks in genre ${genre.name}`}
                        onSelect={() => onSearchGenreTracks(genre)}
                        className={styles.item}
                      >
                        <div className={styles.itemLabel}>
                          <span className={styles.itemTitle}>
                            Search Tracks in {genre.name}
                          </span>
                          <span className={styles.itemMeta}>
                            {breadcrumb} · {genre.track_count} tracks
                          </span>
                        </div>
                      </Command.Item>
                      <Command.Item
                        value={`${trimmedQuery} search albums in genre ${genre.name}`}
                        onSelect={() => onSearchGenreAlbums(genre)}
                        className={styles.item}
                      >
                        <div className={styles.itemLabel}>
                          <span className={styles.itemTitle}>
                            Search Albums in {genre.name}
                          </span>
                          <span className={styles.itemMeta}>
                            {breadcrumb} · {genre.track_count} tracks
                          </span>
                        </div>
                      </Command.Item>
                    </React.Fragment>
                  );
                })}
              </Command.Group>
            </>
          )}

          {trimmedQuery.length > 0 && albumHits.length > 0 && (
            <>
              <Command.Separator className={styles.separator} />
              <Command.Group heading="Albums" className={styles.group}>
                {albumHits.map((album) => (
                  <React.Fragment key={`al-${album.release_id}-${album.friend_id}`}>
                    <Command.Item
                      value={`${trimmedQuery} open ${album.title} ${album.artist}`}
                      onSelect={() => onOpenAlbum(album)}
                      className={styles.item}
                    >
                      <div className={styles.itemLabel}>
                        <span className={styles.itemTitle}>{album.title}</span>
                        <span className={styles.itemMeta}>
                          Open Album · {album.artist}
                        </span>
                      </div>
                    </Command.Item>
                    <Command.Item
                      value={`${trimmedQuery} play ${album.title} ${album.artist}`}
                      onSelect={() => onPlayAlbum(album)}
                      className={styles.item}
                    >
                      <div className={styles.itemLabel}>
                        <span className={styles.itemTitle}>
                          Play: {album.title}
                        </span>
                        <span className={styles.itemMeta}>
                          Play Now · {album.artist}
                        </span>
                      </div>
                    </Command.Item>
                  </React.Fragment>
                ))}
              </Command.Group>
            </>
          )}

          <Command.Separator className={styles.separator} />

          <Command.Group heading="Tracks" className={styles.group}>
            {trackHits.map((track) => (
              <React.Fragment key={`tr-${track.track_id}-${track.friend_id}`}>
                <Command.Item
                  value={`open ${track.title} ${track.artist} ${track.album}`}
                  onSelect={() => onOpenTrack(track)}
                  className={styles.item}
                >
                  <div className={styles.itemLabel}>
                    <span className={styles.itemTitle}>
                      {track.title || track.track_id}
                    </span>
                    <span className={styles.itemMeta}>
                      Open Track · {track.artist} · {track.album}
                    </span>
                  </div>
                </Command.Item>
                <Command.Item
                  value={`play ${track.title} ${track.artist} ${track.album}`}
                  onSelect={() => onPlayTrack(track)}
                  className={styles.item}
                >
                  <div className={styles.itemLabel}>
                    <span className={styles.itemTitle}>
                      Play: {track.title || track.track_id}
                    </span>
                    <span className={styles.itemMeta}>
                      Play Now · {track.artist} · {track.album}
                    </span>
                  </div>
                </Command.Item>
              </React.Fragment>
            ))}
          </Command.Group>

          {trimmedQuery.length > 0 && (
            <>
              <Command.Separator className={styles.separator} />
              <Command.Group heading="Search" className={styles.group}>
                <Command.Item
                  value={`${trimmedQuery} search tracks for ${trimmedQuery}`}
                  onSelect={onSearchTracksQuery}
                  className={styles.item}
                >
                  <span className={styles.itemTitle}>
                    Search tracks for &quot;{trimmedQuery}&quot;
                  </span>
                </Command.Item>
                <Command.Item
                  value={`${trimmedQuery} search albums for ${trimmedQuery}`}
                  onSelect={onSearchAlbumsQuery}
                  className={styles.item}
                >
                  <span className={styles.itemTitle}>
                    Search albums for &quot;{trimmedQuery}&quot;
                  </span>
                </Command.Item>
              </Command.Group>
            </>
          )}
        </Command.List>

        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>↑</kbd>
            <kbd className={styles.kbd}>↓</kbd>
            navigate
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>↵</kbd>
            select
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>esc</kbd>
            dismiss
          </span>
          <span className={styles.footerSpacer} />
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>Space</kbd>
            play/pause
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>[</kbd>
            <kbd className={styles.kbd}>]</kbd>
            prev / next
          </span>
        </div>
      </Command>
    </Command.Dialog>
  );
}
