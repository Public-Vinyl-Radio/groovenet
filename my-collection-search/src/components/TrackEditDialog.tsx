"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Track } from "@/types/track";
import type { TrackEditFormProps } from "@/components/track-edit/types";
import { useTrackByIdQuery } from "@/hooks/useTrackByIdQuery";

const TrackEditForm = dynamic(() => import("./TrackEditForm"), { ssr: false });

export interface TrackEditDialogProps {
  editTrack: Track | null;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  initialFocusRef: React.RefObject<HTMLButtonElement | null>;
  onSave: (data: TrackEditFormProps) => void | Promise<void>;
}

export default function TrackEditDialog({
  editTrack,
  dialogOpen,
  setDialogOpen,
  initialFocusRef,
  onSave,
}: TrackEditDialogProps) {
  const [loaded, setLoaded] = useState<TrackEditFormProps | null>(null);

  const prevOpenRef = useRef<boolean>(dialogOpen);
  const { data: fetchedTrack } = useTrackByIdQuery(
    editTrack?.track_id,
    editTrack?.friend_id,
    dialogOpen
  );

  useEffect(() => {
    const justOpened = dialogOpen && !prevOpenRef.current;
    prevOpenRef.current = dialogOpen;
    if (!justOpened) return;

    setLoaded(null);
  }, [dialogOpen]);

  // Map fetched data to form props when available
  useEffect(() => {
    if (!fetchedTrack || !dialogOpen) return;
    const data = fetchedTrack;
    const toNumberOrNull = (v: unknown): number | null => {
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
      }
      return null;
    };
    const mapped: TrackEditFormProps = {
      track_id: data.track_id,
      title: data.title,
      artist: data.artist,
      album: data.album,
      local_tags: data.local_tags,
      track_genres: data.track_genres,
      notes: data.notes,
      bpm: toNumberOrNull(data.bpm),
      key: data.key,
      danceability: toNumberOrNull(data.danceability),
      apple_music_url: data.apple_music_url,
      youtube_url: data.youtube_url,
      soundcloud_url: data.soundcloud_url,
      star_rating: data.star_rating,
      duration_seconds: data.duration_seconds,
      friend_id: data.friend_id,
      local_audio_url: data.local_audio_url,
    };
    setLoaded(mapped);
  }, [fetchedTrack, editTrack?.username, dialogOpen]);

  if (!editTrack || !editTrack.username) return null;

  return (
    <TrackEditForm
      track={(loaded ? loaded : null)!}
      menuTrack={editTrack}
      onSave={onSave}
      dialogOpen={dialogOpen}
      setDialogOpen={setDialogOpen}
      initialFocusRef={initialFocusRef}
    />
  );
}
