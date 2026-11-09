"use client";

import React from "react";
import { Command, defaultFilter } from "cmdk";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useUsername } from "@/providers/UsernameProvider";
import { usePlaylistsQuery } from "@/hooks/usePlaylistsQuery";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import { useGenreTaxonomyQuery, useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { importPlaylist } from "@/services/internalApi/playlists";
import { searchTracks } from "@/services/internalApi/tracks";
import { searchAlbums, getAlbumWithTracks } from "@/services/internalApi/albums";
import { listArtists } from "@/services/internalApi/artists";
import type { ArtistListItem } from "@/api-contract/schemas";
import { matchGenresForPalette, genreHref } from "@/lib/genres/links";
import type { GenreOption } from "@/lib/genres/options";
import { isTrackSearchMode } from "@/components/search/searchModes";
import type { Album, Track } from "@/types/track";
import { useAddToPlaylistDialog } from "@/hooks/useAddToPlaylistDialog";
import {
  AlbumRow,
  ArtistRow,
  PreviewPane,
  TrackRow,
  type PaletteSubject,
} from "@/components/CommandPaletteParts";
import { toaster } from "@/components/ui/toaster";
import { analytics } from "@/lib/analytics/client";
import type { AnalyticsEvents } from "@/lib/analytics/events";
import styles from "./CommandPalette.module.css";

type TrackHit = Track;
type AlbumHit = Album;

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/tracks", label: "Tracks" },
  { href: "/albums", label: "Albums" },
  { href: "/artists", label: "Artists" },
  { href: "/genres", label: "Genres" },
  { href: "/playlists", label: "Playlists" },
  { href: "/jobs", label: "Jobs" },
  { href: "/settings", label: "Settings" },
];

// Items carrying this prefix always sort first (cmdk scores top out at 1).
const PINNED_PREFIX = "\u0000pinned ";
const pinnedFilter = (value: string, search: string, keywords?: string[]): number =>
  value.startsWith(PINNED_PREFIX) ? 2 : defaultFilter(value, search, keywords);

const isEditableTarget = (el: EventTarget | null): boolean => {
  if (!el || !(el as HTMLElement).closest) return false;
  return !!(el as HTMLElement).closest("input, textarea, [contenteditable='true']");
};

// Broader guard for Space — also skip buttons/links so they still activate normally
const isInteractiveTarget = (el: EventTarget | null): boolean => {
  if (!el || !(el as HTMLElement).closest) return false;
  return !!(el as HTMLElement).closest(
    "input, textarea, [contenteditable='true'], button, a, select, [role='button'], [role='menuitem'], [role='option'], [role='tab']",
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
    appendToQueue,
    enqueueNext,
  } = usePlaybackPlayer();
  const { openForTrack, playlistDialog, nameDialog } = useAddToPlaylistDialog();

  const { paletteOpen: open, setPaletteOpen: setOpen, scope: pageScope } = useCommandPalette();

  const [scopeRemoved, setScopeRemoved] = React.useState(false);
  const scope = scopeRemoved ? undefined : pageScope;
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState("");
  const [trackHits, setTrackHits] = React.useState<TrackHit[]>([]);
  const [albumHits, setAlbumHits] = React.useState<AlbumHit[]>([]);
  const [artistHits, setArtistHits] = React.useState<ArtistListItem[]>([]);
  const [loadingTracks, setLoadingTracks] = React.useState(false);
  // The result whose actions are showing (Tab / →); null is the main list.
  const [sub, setSub] = React.useState<PaletteSubject | null>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — toggle palette
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
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
    setScopeRemoved(false);
    setSub(null);
  }, [open]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open) return;
      const q = query.trim();
      if (q.length === 0) {
        setTrackHits([]);
        setAlbumHits([]);
        setArtistHits([]);
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

      const [trackResult, albumResult, artistResult] = await Promise.all([
        searchTracks(trackParams).catch((err) => {
          console.error("Command palette track search error:", err);
          return null;
        }),
        searchAlbums(albumParams).catch((err) => {
          console.error("Command palette album search error:", err);
          return null;
        }),
        // By name or any alias, within this collection (#709).
        listArtists({ q, limit: 5, friend_id: friend?.id }).catch((err) => {
          console.error("Command palette artist search error:", err);
          return null;
        }),
      ]);
      if (cancelled) return;
      setTrackHits(trackResult?.hits ?? []);
      setAlbumHits(albumResult?.hits ?? []);
      setArtistHits(artistResult?.items ?? []);
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
    [genreLookup, genreOptions, query],
  );

  const filteredPlaylists = React.useMemo(() => {
    const playlistItems = Array.isArray(playlists) ? playlists : [];
    const q = query.trim().toLowerCase();
    if (!q) return playlistItems.slice(0, 8);
    return playlistItems.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
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
    analytics.track("command_palette_used", { command, scope: scope?.id ?? "global" });

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
    router.push(`/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`);
    close();
  };

  const onPlayTrack = (track: TrackHit) => {
    used("play_track");
    replacePlaylist([track], { autoplay: true, startIndex: 0 });
    close();
  };

  const onOpenGenre = (genre: GenreOption) => {
    used("open_genre");
    router.push(genreHref(genre.slug));
    close();
  };

  const onOpenArtist = (artist: ArtistListItem) => {
    used("open_artist");
    router.push(`/artists/${encodeURIComponent(artist.slug)}`);
    close();
  };

  const onFilterTracksByArtist = (artist: ArtistListItem) => {
    used("filter_tracks_by_artist");
    router.push(`/tracks?artist=${encodeURIComponent(artist.slug)}`);
    close();
  };

  const onQueueTrackNext = (track: TrackHit) => {
    used("queue_track_next");
    enqueueNext(track);
    toaster.create({ title: "Playing next", description: track.title, type: "success" });
    close();
  };

  const onQueueTrack = (track: TrackHit) => {
    used("queue_track");
    appendToQueue(track);
    toaster.create({ title: "Added to queue", description: track.title, type: "success" });
    close();
  };

  const onAddTrackToPlaylist = (track: TrackHit) => {
    used("add_track_to_playlist");
    close();
    openForTrack(track);
  };

  // The track page's Suggestions section is where similar-vibe tracks are ranked.
  const onFindSimilarVibe = (track: TrackHit) => {
    used("find_similar_vibe");
    router.push(
      `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}#suggestions-heading`,
    );
    close();
  };

  const onQueueAlbum = async (album: AlbumHit) => {
    used("queue_album");
    close();
    try {
      const { tracks } = await getAlbumWithTracks(album.release_id, album.friend_id);
      const playable = tracks.filter((t) => !!t.local_audio_url);
      if (playable.length === 0) {
        toaster.create({ title: "Album has no playable tracks", type: "info" });
        return;
      }
      appendToQueue(playable);
      toaster.create({ title: `Added ${playable.length} tracks to the queue`, type: "success" });
    } catch (err) {
      console.error("Failed to queue album:", err);
      toaster.create({ title: "Failed to queue album", type: "error" });
    }
  };

  const onOpenAlbum = (album: AlbumHit) => {
    used("open_album");
    router.push(`/albums/${encodeURIComponent(album.release_id)}?friend_id=${album.friend_id}`);
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

  const trackValue = (t: TrackHit) => `open ${t.title} ${t.artist} ${t.album}`;
  const albumValue = (al: AlbumHit) => `${trimmedQuery} open ${al.title} ${al.artist}`;
  const artistValue = (ar: ArtistListItem) => `${trimmedQuery} open artist ${ar.name}`;

  const highlightedSubject = React.useMemo<PaletteSubject | null>(() => {
    const track = trackHits.find((hit) => trackValue(hit) === highlighted);
    if (track) return { kind: "track", track };
    const album = albumHits.find((hit) => albumValue(hit) === highlighted);
    if (album) return { kind: "album", album };
    const artist = artistHits.find((hit) => artistValue(hit) === highlighted);
    if (artist) return { kind: "artist", artist };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted, trackHits, albumHits, artistHits, trimmedQuery]);

  const openActions = (subject: PaletteSubject) => {
    setSub(subject);
    setHighlighted(`${PINNED_PREFIX}action-0`);
  };
  const closeActions = () => {
    setSub(null);
    setHighlighted("");
  };

  type SubAction = { id: string; label: string; run: () => void };
  const subActions: SubAction[] = !sub
    ? []
    : sub.kind === "track"
      ? [
          { id: "next", label: "Queue next", run: () => onQueueTrackNext(sub.track) },
          { id: "queue", label: "Add to queue", run: () => onQueueTrack(sub.track) },
          { id: "playlist", label: "Add to playlist…", run: () => onAddTrackToPlaylist(sub.track) },
          { id: "vibe", label: "Find similar vibe", run: () => onFindSimilarVibe(sub.track) },
          { id: "open", label: "Open", run: () => onOpenTrack(sub.track) },
        ]
      : sub.kind === "album"
        ? [
            { id: "queue", label: "Queue album", run: () => void onQueueAlbum(sub.album) },
            { id: "play", label: "Play", run: () => void onPlayAlbum(sub.album) },
            { id: "open", label: "Open", run: () => onOpenAlbum(sub.album) },
          ]
        : [
            {
              id: "tracks",
              label: `Tracks by ${sub.artist.name}`,
              run: () => onFilterTracksByArtist(sub.artist),
            },
            { id: "open", label: "Open", run: () => onOpenArtist(sub.artist) },
          ];

  // ⌘Enter / Ctrl+Enter plays whichever track or album row is highlighted.
  const onCommandKeyDown = (e: React.KeyboardEvent) => {
    if (sub) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        closeActions();
      }
      return;
    }
    if (e.key === "Tab" || e.key === "ArrowRight") {
      const input = e.target as HTMLInputElement;
      const atEnd = input.selectionStart === input.value.length;
      if (highlightedSubject && (e.key === "Tab" || atEnd)) {
        e.preventDefault();
        openActions(highlightedSubject);
      }
      return;
    }
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
    const t = trackHits.find((hit) => trackValue(hit) === highlighted);
    const al = t ? undefined : albumHits.find((hit) => albumValue(hit) === highlighted);
    if (!t && !al) return;
    e.preventDefault();
    e.stopPropagation();
    if (t) onPlayTrack(t);
    else if (al) void onPlayAlbum(al);
  };

  // Only reachable once the Search group has rendered, which requires a query.
  const onSearchTracksQuery = () => {
    used("search_tracks_query");
    const params = new URLSearchParams({ q: trimmedQuery });
    const urlMode = searchParams?.get("mode");
    params.set("mode", isTrackSearchMode(urlMode) ? urlMode : "hybrid");
    router.push(`/tracks?${params.toString()}`);
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
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        overlayClassName={styles.overlay}
        className={styles.dialog}
        label="Command Palette"
      >
        <RadixDialog.Title className={styles.srOnly}>Command Palette</RadixDialog.Title>
        <Command
          className={styles.command}
          filter={pinnedFilter}
          value={highlighted}
          onValueChange={setHighlighted}
          onKeyDown={onCommandKeyDown}
        >
          <div className={styles.inputRow}>
            {scope && <span className={styles.scopeChip}>{scope.label} ›</span>}
            <Command.Input
              autoFocus
              placeholder="Search tracks, albums, genres, artists, playlists, or actions…"
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                if (scope?.onSearch && value.trim()) setHighlighted(`${PINNED_PREFIX}scope`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && sub) {
                  event.preventDefault();
                  event.stopPropagation();
                  closeActions();
                  return;
                }
                if (event.key === "Backspace" && query === "" && scope) {
                  event.preventDefault();
                  setScopeRemoved(true);
                }
              }}
              className={styles.input}
            />
          </div>
          <div className={styles.body}>
            <Command.List className={styles.list}>
              {sub && (
                <Command.Group
                  heading={
                    sub.kind === "track"
                      ? sub.track.title
                      : sub.kind === "album"
                        ? sub.album.title
                        : sub.artist.name
                  }
                  className={styles.group}
                >
                  {subActions.map((action, i) => (
                    <Command.Item
                      key={action.id}
                      value={`${PINNED_PREFIX}action-${i}`}
                      className={styles.item}
                      onSelect={action.run}
                    >
                      <span className={styles.itemTitle}>{action.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!sub && (
                <>
                  <Command.Empty className={styles.empty}>
                    {loadingTracks ? "Searching…" : "No results."}
                  </Command.Empty>

                  {scope?.onSearch && trimmedQuery && (
                    <Command.Group heading={scope.label} className={styles.group}>
                      <Command.Item
                        value={`${PINNED_PREFIX}scope`}
                        className={styles.item}
                        onSelect={() => {
                          used("scoped_search");
                          scope.onSearch?.(trimmedQuery);
                          close();
                        }}
                      >
                        <span className={styles.itemTitle}>
                          Search {scope.label} for &quot;{trimmedQuery}&quot;
                        </span>
                      </Command.Item>
                    </Command.Group>
                  )}
                  {scope?.actions && (
                    <Command.Group heading={`${scope.label} actions`} className={styles.group}>
                      {scope.actions.map((action) => (
                        <Command.Item
                          key={action.id}
                          value={`page ${action.label}`}
                          disabled={action.disabled}
                          className={styles.item}
                          onSelect={() => {
                            used(action.id);
                            close();
                            action.onSelect();
                          }}
                        >
                          <span className={styles.itemTitle}>{action.label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {trimmedQuery.length > 0 && (
                    <>
                      <Command.Group heading="Search" className={styles.group}>
                        <Command.Item
                          value={`${PINNED_PREFIX}tracks`}
                          onSelect={onSearchTracksQuery}
                          className={styles.item}
                        >
                          <span className={styles.itemTitle}>
                            Search tracks for &quot;{trimmedQuery}&quot;
                          </span>
                        </Command.Item>
                        <Command.Item
                          value={`${PINNED_PREFIX}albums`}
                          onSelect={onSearchAlbumsQuery}
                          className={styles.item}
                        >
                          <span className={styles.itemTitle}>
                            Search albums for &quot;{trimmedQuery}&quot;
                          </span>
                        </Command.Item>
                      </Command.Group>
                      <Command.Separator className={styles.separator} />
                    </>
                  )}

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
                      <span className={styles.itemTitle}>{isPlaying ? "Pause" : "Play"}</span>
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
                        <span className={styles.itemTitle}>Create Playlist From Queue</span>
                        <span className={styles.itemMeta}>{playlistLength} tracks in queue</span>
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
                          <span className={styles.itemMeta}>{pl.tracks?.length ?? 0} tracks</span>
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
                            <Command.Item
                              key={`genre-${genre.id}`}
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
                          );
                        })}
                      </Command.Group>
                    </>
                  )}

                  {trimmedQuery.length > 0 && artistHits.length > 0 && (
                    <>
                      <Command.Separator className={styles.separator} />
                      <Command.Group heading="Artists" className={styles.group}>
                        {artistHits.map((artist) => (
                          <Command.Item
                            key={`ar-${artist.id}`}
                            value={artistValue(artist)}
                            onSelect={() => onOpenArtist(artist)}
                            className={styles.item}
                          >
                            <ArtistRow artist={artist} />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    </>
                  )}

                  {trimmedQuery.length > 0 && albumHits.length > 0 && (
                    <>
                      <Command.Separator className={styles.separator} />
                      <Command.Group heading="Albums" className={styles.group}>
                        {albumHits.map((album) => (
                          <Command.Item
                            key={`al-${album.release_id}-${album.friend_id}`}
                            value={albumValue(album)}
                            onSelect={() => onOpenAlbum(album)}
                            className={styles.item}
                          >
                            <AlbumRow album={album} />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    </>
                  )}

                  <Command.Separator className={styles.separator} />

                  <Command.Group heading="Tracks" className={styles.group}>
                    {trackHits.map((track) => (
                      <Command.Item
                        key={`tr-${track.track_id}-${track.friend_id}`}
                        value={trackValue(track)}
                        onSelect={() => onOpenTrack(track)}
                        className={styles.item}
                      >
                        <TrackRow track={track} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
            <PreviewPane subject={sub ?? highlightedSubject} />
          </div>

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
              <kbd className={styles.kbd}>{sub ? "←" : "tab"}</kbd>
              {sub ? "back" : "actions"}
            </span>
            <span className={styles.footerHint}>
              <kbd className={styles.kbd}>⌘↵</kbd>
              play
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
      {playlistDialog}
      {nameDialog}
    </>
  );
}
