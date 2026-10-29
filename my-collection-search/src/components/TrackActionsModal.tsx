"use client";

import React from "react";
import { Box, Image, Text } from "@chakra-ui/react";
import { FiPlay, FiPlusSquare, FiList } from "react-icons/fi";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import {
  Group,
  TileRow,
  overline,
  type ModalAction,
  type ModalTile,
} from "@/components/ui/RetroModalParts";
import { RatingStars } from "@/components/TrackResult";
import { keyToCamelot } from "@/lib/playlistOrder";
import type { Track } from "@/types/track";

export type { ModalAction };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: Track;
  onPlay?: () => void;
  onQueue: () => void;
  onPlaylist: () => void;
  /** The star rating row; omitted outside a track card. */
  rating?: { value: number; onChange: (value: number) => void };
  library: ModalAction[];
  audio: ModalAction[];
  openIn: ModalAction[];
  danger: ModalAction[];
};

/** The catalogue line of the strip: LP ID · side · BPM · key. */
export function catalogueLine(track: Track): string {
  const camelot = keyToCamelot(track.key);
  const bpm = track.bpm ? Math.round(Number(track.bpm)) : NaN;
  return [
    track.library_identifier,
    track.position ? `Side ${track.position}` : null,
    Number.isFinite(bpm) && bpm > 0 ? `${bpm} BPM` : null,
    camelot && camelot !== "-" ? camelot : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The label strip of a track modal: art, catalogue line, title and artist. */
export function TrackStripHeader({ track }: { track: Track }) {
  const art = track.audio_file_album_art_url || track.album_thumbnail;
  const catalogue = catalogueLine(track);
  return (
    <>
      <Box
        boxSize="44px"
        flexShrink={0}
        borderWidth="outline"
        borderColor="bg"
        bg="fg.muted"
        overflow="hidden"
      >
        {art && <Image src={art} alt="" boxSize="full" objectFit="cover" />}
      </Box>
      <Box flex="1" minW={0}>
        {catalogue && (
          <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8} lineClamp={1}>
            {catalogue}
          </Text>
        )}
        <RetroDialogTitle fontSize="16px" lineHeight="22px" fontWeight="semibold" lineClamp={1}>
          {track.title}
        </RetroDialogTitle>
        <Text fontSize="13px" lineHeight="18px" opacity={0.8} lineClamp={1}>
          {track.artist}
        </Text>
      </Box>
    </>
  );
}

/** The phone track actions menu as a centred modal (#735). */
export default function TrackActionsModal({
  open,
  onOpenChange,
  track,
  onPlay,
  onQueue,
  onPlaylist,
  rating,
  library,
  audio,
  openIn,
  danger,
}: Props) {
  const close = () => onOpenChange(false);
  const tiles: ModalTile[] = [
    ...(onPlay
      ? [{ label: "Play", icon: <FiPlay fill="currentColor" />, solid: true, onClick: onPlay }]
      : []),
    { label: "Queue", icon: <FiPlusSquare />, onClick: onQueue },
    { label: "Playlist", icon: <FiList />, onClick: onPlaylist },
  ];

  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      header={<TrackStripHeader track={track} />}
    >
      <TileRow tiles={tiles} onDone={close} />
      {rating && (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          p="4px 8px 8px 12px"
          borderTopWidth="rule"
          borderColor="border"
          css={{ "& .track-result-rating": { opacity: 1 } }}
        >
          <Text {...overline} color="fg.muted">
            Rating
          </Text>
          <RatingStars size="sm" value={rating.value} onChange={rating.onChange} />
        </Box>
      )}
      <Group label="Library" actions={library} onDone={close} />
      <Group label="Audio" actions={audio} onDone={close} />
      <Group label="Open in" actions={openIn} onDone={close} />
      <Group label="Danger" actions={danger} danger onDone={close} />
    </RetroDialog>
  );
}

/** The "Open in" actions for the streaming links a track has. */
export function openInActions(track: Track): ModalAction[] {
  const links: [string, string | undefined][] = [
    ["Apple Music", track.apple_music_url],
    ["YouTube", track.youtube_url],
    ["SoundCloud", track.soundcloud_url],
  ];
  return links.flatMap(([label, href]) => (href ? [{ label, href, external: true }] : []));
}
