"use client";

import React from "react";
import RetroDialog from "@/components/ui/RetroDialog";
import { Group, PositionStepper, type ModalAction } from "@/components/ui/RetroModalParts";
import { TrackStripHeader } from "@/components/TrackActionsModal";
import type { Track } from "@/types/track";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: Track;
  /** Zero-based position of the track in the playlist. */
  index: number;
  total: number;
  onMove: (toIndex: number) => void;
  trackActions: ModalAction[];
  discover: ModalAction[];
  danger: ModalAction[];
};

/** The phone playlist-track actions menu as a centred modal (#751). */
export default function PlaylistTrackActionsModal({
  open,
  onOpenChange,
  track,
  index,
  total,
  onMove,
  trackActions,
  discover,
  danger,
}: Props) {
  const close = () => onOpenChange(false);
  return (
    <RetroDialog open={open} onOpenChange={onOpenChange} header={<TrackStripHeader track={track} />}>
      <PositionStepper
        index={index}
        total={total}
        onMove={(to) => {
          onMove(to);
          close();
        }}
      />
      <Group label="Track" actions={trackActions} onDone={close} />
      <Group label="Discover" actions={discover} onDone={close} />
      <Group label="Danger" actions={danger} danger onDone={close} />
    </RetroDialog>
  );
}
