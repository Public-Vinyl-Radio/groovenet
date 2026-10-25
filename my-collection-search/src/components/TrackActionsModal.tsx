"use client";

import React from "react";
import { Box, Image, Link, Text, chakra } from "@chakra-ui/react";
import NextLink from "next/link";
import { FiPlay, FiPlusSquare, FiList } from "react-icons/fi";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { RatingStars } from "@/components/TrackResult";
import { keyToCamelot } from "@/lib/playlistOrder";
import type { Track } from "@/types/track";

export type ModalAction = {
  label: string;
  onClick?: () => void;
  /** An internal route (client navigation) or, with `external`, a new tab. */
  href?: string;
  external?: boolean;
  disabled?: boolean;
};

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

const overline = {
  fontFamily: "label",
  fontSize: "12px",
  lineHeight: "16px",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
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

function Tile({
  icon,
  label,
  solid,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  solid?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      h="68px"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="6px"
      borderWidth="outline"
      borderColor="border.ink"
      bg={solid ? "border.ink" : "bg"}
      color={solid ? "bg" : "fg"}
      boxShadow={solid ? "sm" : "xs"}
      _hover={{ filter: "brightness(1.08)" }}
      _active={{ filter: "brightness(0.94)" }}
    >
      <Box fontSize="20px" aria-hidden="true" display="flex">
        {icon}
      </Box>
      <Text {...overline} lineHeight="14px" fontSize="11px" fontWeight="semibold">
        {label}
      </Text>
    </Box>
  );
}

function ActionButton({ action, danger, onDone }: { action: ModalAction; danger?: boolean; onDone: () => void }) {
  const style = {
    h: "44px",
    px: "10px",
    display: "flex",
    alignItems: "center",
    gap: 2,
    borderWidth: "outline",
    borderColor: danger ? "status.missing.border" : "border",
    color: danger ? "danger.fg" : "fg",
    fontFamily: "label",
    fontSize: "13px",
    fontWeight: "semibold",
    letterSpacing: "0.02em",
    textAlign: "left" as const,
    minW: 0,
    _hover: { bg: danger ? "danger.subtle" : "bg.muted", textDecoration: "none" },
    _disabled: { opacity: 0.4, cursor: "not-allowed" },
  };
  const label = (
    <Text as="span" lineClamp={1}>
      {action.label}
    </Text>
  );
  if (action.href && !action.disabled) {
    return action.external ? (
      <Link {...style} href={action.href} target="_blank" rel="noopener noreferrer" onClick={onDone}>
        {label}
      </Link>
    ) : (
      <Link {...style} as={NextLink} href={action.href} onClick={onDone}>
        {label}
      </Link>
    );
  }
  return (
    <chakra.button
      {...style}
      disabled={action.disabled}
      onClick={() => {
        action.onClick?.();
        onDone();
      }}
    >
      {label}
    </chakra.button>
  );
}

function Group({
  label,
  actions,
  danger,
  onDone,
}: {
  label: string;
  actions: ModalAction[];
  danger?: boolean;
  onDone: () => void;
}) {
  if (actions.length === 0) return null;
  return (
    <Box p="10px 14px 12px 12px" borderTopWidth="rule" borderColor="border" display="flex" flexDirection="column" gap={2}>
      <Text {...overline} color={danger ? "danger.fg" : "fg.muted"}>
        {label}
      </Text>
      <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        {actions.map((action) => (
          <ActionButton key={action.label} action={action} danger={danger} onDone={onDone} />
        ))}
      </Box>
    </Box>
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
  const art = track.audio_file_album_art_url || track.album_thumbnail;
  const catalogue = catalogueLine(track);
  const tiles = [
    onPlay && { label: "Play", icon: <FiPlay fill="currentColor" />, solid: true, onClick: onPlay },
    { label: "Queue", icon: <FiPlusSquare />, onClick: onQueue },
    { label: "Playlist", icon: <FiList />, onClick: onPlaylist },
  ].filter((tile): tile is NonNullable<typeof tile> => Boolean(tile));

  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      header={
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
      }
    >
      <Box display="grid" gridTemplateColumns={`repeat(${tiles.length}, minmax(0, 1fr))`} gap="10px" p="14px 14px 12px 12px">
        {tiles.map((tile) => (
          <Tile
            key={tile.label}
            icon={tile.icon}
            label={tile.label}
            solid={"solid" in tile ? tile.solid : false}
            onClick={() => {
              tile.onClick();
              close();
            }}
          />
        ))}
      </Box>
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
