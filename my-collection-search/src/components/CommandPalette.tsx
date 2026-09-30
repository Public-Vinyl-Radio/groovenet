"use client";

import React from "react";
import { Command } from "cmdk";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useRouter, usePathname } from "next/navigation";
import { useUsername } from "@/providers/UsernameProvider";
import { usePlaylistsQuery } from "@/hooks/usePlaylistsQuery";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import { importPlaylist } from "@/services/internalApi/playlists";
import { searchTracks } from "@/services/internalApi/tracks";
import type { Track } from "@/types/track";
import { toaster } from "@/components/ui/toaster";
import { analytics } from "@/lib/analytics/client";
import type { AnalyticsEvents } from "@/lib/analytics/events";
import styles from "./CommandPalette.module.css";

type TrackHit = Track;

const NAV_ITEMS = [
  { href: "/", label: "Tracks" },
  { href: "/albums", label: "Albums" },
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
  const { friend } = useUsername();
  const { playlists } = usePlaylistsQuery({ enabled: true });
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
        return;
      }
      setLoadingTracks(true);
      try {
        const params: Parameters<typeof searchTracks>[0] = {
          q,
          limit: 8,
          offset: 0,
        };
        if (friend?.id) {
          params.filter = `friend_id = ${friend.id}`;
        }
        const res = await searchTracks(params);
        if (cancelled) return;
        setTrackHits(res.hits ?? []);
      } catch (err) {
        console.error("Command palette track search error:", err);
        if (!cancelled) setTrackHits([]);
      } finally {
        if (!cancelled) setLoadingTracks(false);
      }
    };

    const handle = setTimeout(run, 180);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, friend?.id]);

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
          placeholder="Search tracks, playlists, or actions…"
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
