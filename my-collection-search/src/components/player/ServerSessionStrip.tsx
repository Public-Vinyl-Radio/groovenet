"use client";

import React from "react";
import { Button, Flex, Text } from "@chakra-ui/react";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";

/**
 * The queue's `SERVER SESSION` strip: whose queue this is, and **Play here**
 * to bring audio back to this device. Play here sends the server nothing; it
 * keeps playing its queue.
 */
export default function ServerSessionStrip() {
  const target = useOptionalPlaybackTarget();
  if (!target || target.target === "") return null;
  const name =
    target.remote.player?.name ??
    target.players.find((p) => p.id === target.target)?.name ??
    target.target;
  return (
    <Flex
      as="section"
      aria-label="Server session"
      flexShrink={0}
      align="center"
      gap="8px"
      px="16px"
      py="10px"
      bg="bg.panel"
      borderBottomWidth="outline"
      borderColor="border.ink"
    >
      <Text
        as="span"
        h="20px"
        px="6px"
        display="inline-flex"
        alignItems="center"
        flexShrink={0}
        bg="border.ink"
        color="bg"
        fontFamily="mono"
        fontSize="10px"
        fontWeight="semibold"
        letterSpacing="0.08em"
      >
        SERVER SESSION
      </Text>
      <Text flex="1" minW={0} fontSize="13px" color="fg.muted" truncate>
        {name} · shared queue
      </Text>
      <Button size="xs" variant="outline" flexShrink={0} onClick={target.playHere}>
        Play here
      </Button>
    </Flex>
  );
}
