"use client";

import React from "react";
import { chakra, Icon, Text } from "@chakra-ui/react";
import { FiChevronDown, FiSpeaker } from "react-icons/fi";
import { usePlaybackTargetLabel } from "@/components/player/PlaybackTargetControl";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";

/**
 * Where audio plays, and a way to change it. For now both entry points open
 * the existing playback-target dialog; the output picker replaces it (#793).
 * Null without a PlaybackTargetProvider, so the entry points hide.
 */
function usePlaybackOutput() {
  const label = usePlaybackTargetLabel();
  const setOpen = usePlaybackTargetDialog((s) => s.setOpen);
  if (label === null) return null;
  return { label, open: () => setOpen(true) };
}

const Trigger = chakra("button");

const triggerCss = {
  display: "flex",
  alignItems: "center",
  borderWidth: "outline",
  borderColor: "border.ink",
  bg: "bg.panel",
  color: "fg",
  cursor: "pointer",
  textAlign: "left",
  _hover: { bg: "bg.muted" },
} as const;

/** Now playing's `PLAY ON` row (phones). */
export function PlayOnRow() {
  const output = usePlaybackOutput();
  if (!output) return null;
  return (
    <Trigger
      aria-haspopup="dialog"
      aria-label={`Play on: ${output.label}`}
      onClick={output.open}
      h="48px"
      w="100%"
      px="12px"
      gap="10px"
      css={triggerCss}
    >
      <Icon as={FiSpeaker} boxSize="18px" />
      <Text fontFamily="mono" fontSize="11px" letterSpacing="0.08em" fontWeight="semibold" color="fg.muted">
        PLAY ON
      </Text>
      <Text flex="1" minW={0} fontSize="15px" fontWeight="semibold" truncate>
        {output.label}
      </Text>
      <Icon as={FiChevronDown} boxSize="16px" />
    </Trigger>
  );
}

/** The desktop bar's output button. */
export function OutputButton() {
  const output = usePlaybackOutput();
  if (!output) return null;
  return (
    <Trigger
      aria-haspopup="dialog"
      aria-label={`Play on: ${output.label}`}
      title={`Play on: ${output.label}`}
      onClick={output.open}
      h="40px"
      maxW="220px"
      px="10px"
      gap="8px"
      flexShrink={1}
      minW={0}
      css={triggerCss}
    >
      <Icon as={FiSpeaker} boxSize="16px" flexShrink={0} />
      <Text fontFamily="mono" fontSize="11px" fontWeight="semibold" letterSpacing="0.06em" textTransform="uppercase" truncate>
        {output.label}
      </Text>
      <Icon as={FiChevronDown} boxSize="12px" flexShrink={0} />
    </Trigger>
  );
}
