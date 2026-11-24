"use client";

import React, { useState } from "react";
import RetroDialog from "@/components/ui/RetroDialog";
import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { describePlayerError } from "@groovenet/client/player-session";
import type { ServerPlayerErrorState } from "@groovenet/contracts";

export type Notice = {
  tone: "confirm" | "error" | "info";
  text: string;
  /** A second, quieter line: which speaker, when, and what the engine said (#1241). */
  detail?: string | null;
  action?: { label: string; onClick?: () => void; disabled?: boolean };
  /** Cancel for a confirm, × for a passing problem; none for a state the server holds. */
  dismiss?: { label: string; onClick: () => void };
  takeover?: { key: string; name: string; engine: string; confirm: () => void };
};

/**
 * A session that lost its speaker (#1241): which one, when, and the next step.
 * Once it is listed again, the stale error becomes "is back" with Play; until
 * then, choosing another speaker is offered, never done for the person.
 * Null for errors that are not about a speaker.
 */
export function lostSpeakerNotice(
  error: ServerPlayerErrorState,
  controls?: { play: () => void; choose: () => void; disabled: boolean },
): Notice | null {
  const view = describePlayerError(error);
  if (!view?.detail) return null;
  if (view.back)
    return {
      tone: "info",
      text: view.headline,
      detail: view.detail,
      ...(controls
        ? { action: { label: "Play", onClick: controls.play, disabled: controls.disabled } }
        : {}),
    };
  return {
    tone: "error",
    text: `Playback error: ${view.headline}`,
    detail: view.detail,
    ...(controls ? { action: { label: "Choose speaker", onClick: controls.choose } } : {}),
  };
}

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
  if (remote.player?.state.error) {
    const player = remote.player;
    const busy = player.state.error!.code === "DEVICE_BUSY";
    const lost = lostSpeakerNotice(
      player.state.error!,
      controller
        ? {
            play: () => void controller.command({ type: "play" }),
            choose: () => openPicker(true),
            disabled: remote.busy || !remote.connected,
          }
        : undefined,
    );
    if (lost) return lost;
    return {
      tone: "error",
      text: `Playback error: ${player.state.error!.message}`,
      ...(busy && controller
        ? {
            action: {
              label: "Stop engine and take over",
              disabled: remote.busy || !remote.connected,
            },
            takeover: {
              key: `${player.id}:${player.revision}`,
              name: player.name,
              engine: player.engine_id,
              confirm: () =>
                void controller.command({ type: "engine.stop", takeover: true }, player.revision),
            },
          }
        : {}),
    };
  }
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
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const current = notice === undefined ? own : notice;
  if (!current) return null;
  return (
    <>
      <Flex
        data-testid="server-notice"
        role={
          current.tone === "confirm" ? "alertdialog" : current.tone === "info" ? "status" : "alert"
        }
        aria-label={current.tone === "confirm" ? "Confirm playback" : undefined}
        align="center"
        gap="8px"
        minH="48px"
        pl="12px"
        pr="4px"
        py="6px"
        borderWidth="outline"
        borderRadius="md"
        borderColor="border.ink"
        bg="bg.panel"
      >
        <Box flex="1" minW={0}>
          <Text fontSize="13px" lineHeight="18px">
            {current.text}
          </Text>
          {current.detail && (
            <Text
              data-testid="server-notice-detail"
              fontSize="12px"
              lineHeight="16px"
              color="fg.muted"
            >
              {current.detail}
            </Text>
          )}
        </Box>
        {current.action && (
          <Button
            size="xs"
            variant="solid"
            flexShrink={0}
            disabled={current.action.disabled}
            onClick={() =>
              current.takeover ? setConfirmation(current.takeover.key) : current.action!.onClick?.()
            }
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
      {current.takeover && (
        <RetroDialog
          open={confirmation === current.takeover.key}
          onOpenChange={() => setConfirmation(null)}
          title="Take over engine?"
          footer={
            <Flex gap="8px">
              <Button size="sm" variant="outline" onClick={() => setConfirmation(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="solid"
                disabled={current.action?.disabled}
                onClick={() => {
                  setConfirmation(null);
                  current.takeover!.confirm();
                }}
              >
                Stop engine and take over
              </Button>
            </Flex>
          }
        >
          <Text>
            Something else is playing or paused on {current.takeover.name} /{" "}
            {current.takeover.engine}. Stop it and play this queue?
          </Text>
        </RetroDialog>
      )}
    </>
  );
}
