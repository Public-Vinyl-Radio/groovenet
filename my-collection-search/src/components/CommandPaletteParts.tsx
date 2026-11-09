"use client";

import React from "react";
import { FiPlay } from "react-icons/fi";
import Cover from "@/components/Cover";
import { artworkOf, trackDurationLabel } from "@/components/player/trackMeta";
import { artistCountsLabel } from "@/components/ArtistFilter";
import { keyToCamelot } from "@/lib/playlistOrder";
import type { ArtistListItem } from "@/api-contract/schemas";
import type { Album, Track } from "@/types/track";
import styles from "./CommandPalette.module.css";

/** What the palette can highlight and act on. */
export type PaletteSubject =
  | { kind: "track"; track: Track }
  | { kind: "album"; album: Album }
  | { kind: "artist"; artist: ArtistListItem };

/** The track's DJ genre: taxonomy links first, then the free-text tags, then Discogs genres. */
export function genresOf(track: Track): string[] {
  const linked = (track.track_genres ?? []).map((g) => g.name).filter(Boolean);
  if (linked.length > 0) return linked;
  const tags = (track.local_tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 0) return tags;
  return (track.genres ?? []).filter(Boolean);
}

/** `4:02 · 128 BPM · 8A`, skipping whatever the hit does not carry. */
export function trackMetaParts(track: Track): string[] {
  const bpm = parseFloat(String(track.bpm ?? ""));
  const camelot = track.key ? keyToCamelot(track.key) : "";
  return [
    trackDurationLabel(track) || null,
    Number.isFinite(bpm) && bpm > 0 ? `${Math.round(bpm)} BPM` : null,
    /^\d{1,2}[AB]$/i.test(camelot) ? camelot.toUpperCase() : null,
  ].filter((part): part is string => Boolean(part));
}

export function albumMetaParts(album: Album): string[] {
  const year = album.year && album.year !== "0" ? String(album.year) : null;
  const count = album.track_count;
  return [
    year,
    typeof count === "number" ? `${count} ${count === 1 ? "track" : "tracks"}` : null,
  ].filter((part): part is string => Boolean(part));
}

function RowCover({ src }: { src: string | null }) {
  return <Cover src={src ?? undefined} alt="" size="40px" aria-hidden="true" />;
}

export function TrackRow({ track }: { track: Track }) {
  const parts = trackMetaParts(track);
  const genre = genresOf(track)[0];
  const meta = [...parts, genre].filter(Boolean).join(" · ");
  return (
    <>
      <RowCover src={artworkOf(track)} />
      <div className={styles.itemLabel}>
        <span className={styles.itemTitle}>{track.title || track.track_id}</span>
        <span className={styles.itemMeta}>
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </span>
        {meta && <span className={styles.itemMono}>{meta}</span>}
      </div>
      {track.local_audio_url && (
        <span className={styles.playable} role="img" aria-label="Has audio" title="Has audio">
          <FiPlay aria-hidden="true" />
        </span>
      )}
    </>
  );
}

export function AlbumRow({ album }: { album: Album }) {
  const meta = albumMetaParts(album).join(" · ");
  return (
    <>
      <RowCover src={artworkOf(album)} />
      <div className={styles.itemLabel}>
        <span className={styles.itemTitle}>{album.title}</span>
        <span className={styles.itemMeta}>{album.artist}</span>
        {meta && <span className={styles.itemMono}>{meta}</span>}
      </div>
    </>
  );
}

export function ArtistRow({ artist }: { artist: ArtistListItem }) {
  const counts = artistCountsLabel(artist);
  return (
    <div className={styles.itemLabel}>
      <span className={styles.itemTitle}>{artist.name}</span>
      <span className={styles.itemMeta}>Open Artist{counts ? ` · ${counts}` : ""}</span>
    </div>
  );
}

/** The right-hand panel (desktop only): the highlighted hit, from data already loaded. */
export function PreviewPane({ subject }: { subject: PaletteSubject | null }) {
  if (!subject) return null;

  if (subject.kind === "track") {
    const { track } = subject;
    const meta = trackMetaParts(track).join(" · ");
    const genres = genresOf(track);
    const rating = track.star_rating ?? 0;
    return (
      <aside className={styles.preview} aria-label="Preview" data-testid="palette-preview">
        <Cover src={artworkOf(track) ?? undefined} alt="" size="160px" aria-hidden="true" />
        <div className={styles.previewTitle}>{track.title || track.track_id}</div>
        <div className={styles.itemMeta}>{track.artist}</div>
        {track.album && <div className={styles.itemMeta}>{track.album}</div>}
        {meta && <div className={styles.itemMono}>{meta}</div>}
        {genres.length > 0 && <div className={styles.itemMono}>{genres.join(" · ")}</div>}
        {rating > 0 && (
          <div className={styles.itemMono} role="img" aria-label={`Rated ${rating} of 5`}>
            {"★".repeat(rating)}
            {"☆".repeat(Math.max(0, 5 - rating))}
          </div>
        )}
        {track.local_audio_url && <div className={styles.itemMono}>Has audio</div>}
        {track.notes?.trim() && <p className={styles.previewNotes}>{track.notes.trim()}</p>}
      </aside>
    );
  }

  if (subject.kind === "album") {
    const { album } = subject;
    return (
      <aside className={styles.preview} aria-label="Preview" data-testid="palette-preview">
        <Cover src={artworkOf(album) ?? undefined} alt="" size="160px" aria-hidden="true" />
        <div className={styles.previewTitle}>{album.title}</div>
        <div className={styles.itemMeta}>{album.artist}</div>
        {albumMetaParts(album).length > 0 && (
          <div className={styles.itemMono}>{albumMetaParts(album).join(" · ")}</div>
        )}
        {album.label && <div className={styles.itemMono}>{album.label}</div>}
      </aside>
    );
  }

  const { artist } = subject;
  const counts = artistCountsLabel(artist);
  return (
    <aside className={styles.preview} aria-label="Preview" data-testid="palette-preview">
      <div className={styles.previewTitle}>{artist.name}</div>
      {counts && <div className={styles.itemMono}>{counts}</div>}
    </aside>
  );
}
