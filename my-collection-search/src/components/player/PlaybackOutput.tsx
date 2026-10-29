"use client";

import React from "react";
import { chakra, Icon, Text } from "@chakra-ui/react";
import { FiChevronDown, FiSmartphone, FiVolume1 } from "react-icons/fi";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { useDeviceLabel } from "@/lib/deviceLabel";

export type PlaybackOutputKind = "device" | "airplay" | "server";

/**
 * Where audio plays right now: this device ("This iPhone"), AirPlay from it,
 * or a music server by name. Null without a PlaybackTargetProvider, so the
 * entry points hide.
 */
export function usePlaybackOutputState(): { kind: PlaybackOutputKind; label: string } | null {
  const target = useOptionalPlaybackTarget();
  const device = useDeviceLabel();
  if (!target) return null;
  if (target.target === "")
    return target.airPlayActive
      ? { kind: "airplay", label: "AirPlay" }
      : { kind: "device", label: device };
  const name =
    target.remote.player?.name ??
    target.players.find((player) => player.id === target.target)?.name ??
    target.target;
  return { kind: "server", label: name };
}

/** Short label for nav triggers: "This Mac" or the server's name. */
export function usePlaybackTargetLabel(): string | null {
  return usePlaybackOutputState()?.label ?? null;
}

/** The output plus a way to open the Play on picker. */
function usePlaybackOutput() {
  const state = usePlaybackOutputState();
  const setOpen = usePlaybackTargetDialog((s) => s.setOpen);
  if (state === null) return null;
  return { ...state, open: () => setOpen(true) };
}

const Trigger = chakra("button");

/** Outlined while on this device; filled (surface, ink edge) once audio plays elsewhere. */
function triggerCss(kind: PlaybackOutputKind) {
  const remote = kind !== "device";
  return {
    display: "flex",
    alignItems: "center",
    borderWidth: "outline",
    borderColor: remote ? "border.ink" : "border",
    bg: remote ? "bg.panel" : "transparent",
    color: "fg",
    cursor: "pointer",
    textAlign: "left",
    _hover: { bg: "bg.muted" },
  } as const;
}

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
      css={triggerCss(output.kind)}
    >
      <Icon as={FiSmartphone} boxSize="18px" />
      <Text
        fontFamily="mono"
        fontSize="11px"
        letterSpacing="0.08em"
        fontWeight="semibold"
        color="fg.muted"
      >
        PLAY ON
      </Text>
      <Text flex="1" minW={0} fontSize="15px" fontWeight="semibold" truncate>
        {output.label}
      </Text>
      <Icon as={FiChevronDown} boxSize="16px" />
    </Trigger>
  );
}

/** The desktop bar's output button: the server's name, or `THIS MAC`. */
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
      maxW="200px"
      px="10px"
      gap="8px"
      flexShrink={0}
      minW={0}
      css={triggerCss(output.kind)}
    >
      <Icon as={FiSmartphone} boxSize="16px" flexShrink={0} />
      <Text
        fontFamily="mono"
        fontSize="11px"
        fontWeight="semibold"
        letterSpacing="0.06em"
        textTransform="uppercase"
        truncate
      >
        {output.label}
      </Text>
      <Icon as={FiChevronDown} boxSize="12px" flexShrink={0} />
    </Trigger>
  );
}

/** The mini player's `ON LOUNGE` / `AIRPLAY` tag under the artist; nothing while on this device. */
export function OutputTag() {
  const output = usePlaybackOutputState();
  if (!output || output.kind === "device") return null;
  const text = output.kind === "airplay" ? "AIRPLAY" : `ON ${output.label.toUpperCase()}`;
  return (
    <Text
      as="span"
      data-testid="output-tag"
      mt="2px"
      display="inline-flex"
      alignItems="center"
      gap="4px"
      maxW="100%"
      fontFamily="mono"
      fontSize="10px"
      lineHeight="12px"
      fontWeight="semibold"
      letterSpacing="0.08em"
    >
      <Icon as={FiVolume1} boxSize="10px" flexShrink={0} />
      <Text as="span" truncate>
        {text}
      </Text>
    </Text>
  );
}
