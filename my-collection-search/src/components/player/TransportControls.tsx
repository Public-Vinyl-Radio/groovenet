"use client";

import React from "react";
import { chakra, Flex, type SystemStyleObject } from "@chakra-ui/react";
import { FiPause, FiPlay, FiSkipBack, FiSkipForward } from "react-icons/fi";

export type TransportProps = {
  isPlaying: boolean;
  canPrev: boolean;
  canNext: boolean;
  /** False while the queue is empty. */
  canPlay: boolean;
  onPrev: () => void;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
};

/** A key in the strip, or a bare transport button: square, no radius, a background step on hover. */
const keyCss: SystemStyleObject = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bg: "bg",
  color: "fg",
  cursor: "pointer",
  transition: "background 0.1s ease",
  _hover: { bg: "bg.muted" },
  _active: { bg: "bg.emphasized" },
  _disabled: { opacity: 0.4, cursor: "not-allowed", bg: "bg" },
  "& svg": { flexShrink: 0 },
};

/** The solid key: an ink fill, ground-coloured glyph. Pressed dims rather than moves. */
const solidKeyCss: SystemStyleObject = {
  ...keyCss,
  bg: "border.ink",
  color: "bg",
  _hover: { bg: "border.ink", filter: "brightness(0.9)" },
  _active: { bg: "border.ink", filter: "brightness(0.8)" },
  _disabled: { bg: "border.ink", color: "bg", opacity: 0.5, cursor: "not-allowed" },
};

const Key = chakra("button");

function stop(handler: () => void) {
  return (event: React.MouseEvent) => {
    event.stopPropagation();
    handler();
  };
}

function PlayPauseGlyph({ isPlaying, size }: { isPlaying: boolean; size: number }) {
  return isPlaying ? (
    <FiPause size={size} fill="currentColor" />
  ) : (
    <FiPlay size={size} fill="currentColor" />
  );
}

const STRIP = {
  // Now playing: a full-width row of 64px keys, the play key wider.
  lg: { h: "64px", cols: "1fr 1.4fr 1fr", w: "auto", icon: 24, playIcon: 26, shadow: "md" },
  // The desktop bar: 52 / 68 / 52 x 40px.
  md: { h: "40px", cols: "52px 68px 52px", w: "fit-content", icon: 18, playIcon: 18, shadow: "sm" },
} as const;

/**
 * Previous / play-pause / next as one joined row of keys (#792): a 2px ink
 * outline round all three, ink rules between them, a hard shadow, and the
 * play-pause key solid. Used by Now playing and the desktop bar.
 */
export function TransportStrip({
  size = "lg",
  ...t
}: TransportProps & { size?: keyof typeof STRIP }) {
  const s = STRIP[size];
  return (
    <chakra.div
      role="group"
      aria-label="Transport"
      display="grid"
      gridTemplateColumns={s.cols}
      w={s.w}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow={s.shadow}
      // The shadow is outside the box; keep it inside the column.
      mr={size === "lg" ? "6px" : undefined}
    >
      <Key
        aria-label="Previous"
        h={s.h}
        css={keyCss}
        onClick={stop(t.onPrev)}
        disabled={!t.canPrev}
      >
        <FiSkipBack size={s.icon} />
      </Key>
      <Key
        aria-label={t.isPlaying ? "Pause" : "Play"}
        h={s.h}
        css={solidKeyCss}
        borderInlineWidth="outline"
        borderColor="border.ink"
        onClick={stop(t.isPlaying ? t.onPause : t.onPlay)}
        disabled={!t.isPlaying && !t.canPlay}
      >
        <PlayPauseGlyph isPlaying={t.isPlaying} size={s.playIcon} />
      </Key>
      <Key aria-label="Next" h={s.h} css={keyCss} onClick={stop(t.onNext)} disabled={!t.canNext}>
        <FiSkipForward size={s.icon} />
      </Key>
    </chakra.div>
  );
}

/** The mini player's 48px square play-pause: solid ink, hard shadow. */
export function SquarePlayButton({
  isPlaying,
  canPlay,
  onPlay,
  onPause,
}: Pick<TransportProps, "isPlaying" | "canPlay" | "onPlay" | "onPause">) {
  return (
    <Key
      aria-label={isPlaying ? "Pause" : "Play"}
      w="48px"
      h="48px"
      flexShrink={0}
      css={solidKeyCss}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="sm"
      onClick={stop(isPlaying ? onPause : onPlay)}
      disabled={!isPlaying && !canPlay}
    >
      <PlayPauseGlyph isPlaying={isPlaying} size={16} />
    </Key>
  );
}

/** A bare 44px transport button (mini player next, the queue's compact transport). */
export function BareTransportButton({
  kind,
  onClick,
  disabled,
}: {
  kind: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Key
      aria-label={kind === "prev" ? "Previous" : "Next"}
      w="44px"
      h="48px"
      flexShrink={0}
      css={{
        ...keyCss,
        bg: "transparent",
        _disabled: { opacity: 0.4, cursor: "not-allowed", bg: "transparent" },
      }}
      onClick={stop(onClick)}
      disabled={disabled}
    >
      {kind === "prev" ? <FiSkipBack size={20} /> : <FiSkipForward size={20} />}
    </Key>
  );
}

/** Previous, the square play key and next: the queue's compact transport. */
export function CompactTransport(t: TransportProps) {
  return (
    <Flex align="center" gap="10px">
      <BareTransportButton kind="prev" onClick={t.onPrev} disabled={!t.canPrev} />
      <SquarePlayButton {...t} />
      <BareTransportButton kind="next" onClick={t.onNext} disabled={!t.canNext} />
    </Flex>
  );
}
