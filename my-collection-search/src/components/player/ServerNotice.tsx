"use client";

import React from "react";
import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";

type Notice = {
  tone: "confirm" | "error";
  text: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** Cancel for a confirm, × for a passing problem; none for a state the server holds. */
  dismiss?: { label: string; onClick: () => void };
};

/**
 * What a server needs the person to see or decide, most urgent first: a
 * speaker confirm (#797 isn't configured everywhere yet, so play can come back
 * AVAILABILITY_UNKNOWN or SPEAKER_OCCUPIED), locked browser access, the
 * server's own playback error, then a failed request. Never auto-acknowledged.
 */
export function useServerNotice(): Notice | null {
  const target = useOptionalPlaybackTarget();
  const openPicker = usePlaybackTargetDialog((s) => s.setOpen);
  if (!target || target.target === "") return null;
  const { remote, controller } = target;
  const name =
    remote.player?.name ??
    target.players.find((p) => p.id === target.target)?.name ??
    target.target;
  const ack = remote.acknowledgement;
  if (ack && controller) {
    const unknown = ack.code === "AVAILABILITY_UNKNOWN";
    return {
      tone: "confirm",
      text: unknown
        ? "Speaker status unknown. Playing may interrupt another sender."
        : "Speaker in use by another sender.",
      action: {
        label: unknown ? "Play anyway" : "Take over",
        onClick: () => void controller.acknowledge(),
        disabled: remote.busy,
      },
      dismiss: { label: "Cancel", onClick: controller.dismissAcknowledgement },
    };
  }
  if (!target.authorized) {
    return {
      tone: "error",
      text: `Unlock server access to control ${name}. It keeps playing meanwhile.`,
      action: { label: "Unlock", onClick: () => openPicker(true) },
    };
  }
  if (remote.player?.state.error)
    return { tone: "error", text: `Playback error: ${remote.player.state.error.message}` };
  if (remote.problem && controller)
    return {
      tone: "error",
      text: remote.problem,
      dismiss: { label: "Dismiss", onClick: controller.dismissProblem },
    };
  if (target.problem)
    return {
      tone: "error",
      text: target.problem,
      dismiss: { label: "Dismiss", onClick: () => target.reportProblem(null) },
    };
  return null;
}

/** The notice as a compact outlined strip; renders nothing while there is none. */
export default function ServerNotice({ notice }: { notice?: Notice | null }) {
  const own = useServerNotice();
  const current = notice === undefined ? own : notice;
  if (!current) return null;
  return (
    <Flex
      data-testid="server-notice"
      role={current.tone === "confirm" ? "alertdialog" : "alert"}
      aria-label={current.tone === "confirm" ? "Confirm playback" : undefined}
      align="center"
      gap="8px"
      minH="48px"
      pl="12px"
      pr="4px"
      py="6px"
      borderWidth="outline"
      borderColor="border.ink"
      bg="bg.panel"
    >
      <Text flex="1" minW={0} fontSize="13px" lineHeight="18px">
        {current.text}
      </Text>
      {current.action && (
        <Button
          size="xs"
          variant="solid"
          flexShrink={0}
          disabled={current.action.disabled}
          onClick={current.action.onClick}
        >
          {current.action.label}
        </Button>
      )}
      {current.dismiss &&
        (current.tone === "confirm" ? (
          <Button size="xs" variant="ghost" flexShrink={0} onClick={current.dismiss.onClick}>
            {current.dismiss.label}
          </Button>
        ) : (
          <IconButton
            size="xs"
            variant="ghost"
            aria-label={current.dismiss.label}
            flexShrink={0}
            onClick={current.dismiss.onClick}
          >
            <FiX />
          </IconButton>
        ))}
      {!current.dismiss && <Box w="8px" flexShrink={0} />}
    </Flex>
  );
}
