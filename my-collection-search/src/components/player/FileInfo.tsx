"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Box, Button, Drawer, Flex, Link, Popover, Portal, Text } from "@chakra-ui/react";
import { MetaTag, SourceTag, StatusTag } from "@/components/ui/RoleTags";
import type { Track } from "@/types/track";
import { fileInfo, fileSources } from "./audioQuality";

export function FileInfoDetails({
  track,
  fullPath = false,
  onReprobe,
}: {
  track: Track;
  fullPath?: boolean;
  onReprobe?: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function reprobe() {
    setPending(true);
    setError(null);
    try {
      await onReprobe?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-probe failed");
    } finally {
      setPending(false);
    }
  }
  const info = fileInfo(track);
  const source = fileSources[info.source];
  return (
    <Box p={4}>
      <Flex gap={2} wrap="wrap" mb={3}>
        <SourceTag stroke={source.stroke}>{source.label}</SourceTag>
        {info.lossless !== null && info.lossless !== undefined && (
          <StatusTag tone={info.lossless ? "success" : "neutral"}>
            {info.lossless ? "Lossless" : "Lossy"}
          </StatusTag>
        )}
        {info.streamed && <MetaTag>Streamed</MetaTag>}
      </Flex>
      {info.streamed && (
        <Text fontSize="sm" mb={3}>
          Nominal stream values, not measured. Quality may vary during playback.
        </Text>
      )}
      {!info.streamed && !track.audio_probed_at && (
        <Text fontSize="sm" mb={3}>
          No metadata yet. Re-probe on the track page to measure this file.
        </Text>
      )}
      <Box as="dl" fontSize="sm">
        {[
          ...info.details,
          ...(fullPath ? [["Full path", track.local_audio_url ?? "No local file"]] : []),
        ].map(([label, value]) => (
          <Flex key={label} gap={3} py={1} borderBottomWidth="rule" borderColor="border">
            <Box as="dt" color="fg.muted" flexShrink={0} w="100px">
              {label}
            </Box>
            <Box as="dd" minW={0} overflowWrap="anywhere" fontFamily="mono">
              {value}
            </Box>
          </Flex>
        ))}
      </Box>
      {!info.streamed && track.audio_probed_at && (
        <Text mt={3} fontSize="xs" color="fg.muted">
          Probed {new Date(track.audio_probed_at).toLocaleString()}
        </Text>
      )}
      {onReprobe && (
        <Button mt={3} minH="44px" loading={pending} onClick={() => void reprobe()}>
          Re-probe
        </Button>
      )}
      {error && (
        <Text role="alert" color="fg.error" mt={3}>
          {error}
        </Text>
      )}
      {!fullPath && (
        <Link asChild mt={3} minH="44px">
          <NextLink
            href={`/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`}
          >
            View track
          </NextLink>
        </Link>
      )}
    </Box>
  );
}

// Phones keep the standard 20px tag with a 44px invisible hit area.
const touchTarget = {
  position: "relative",
  _before: { content: '""', position: "absolute", inset: "-12px", bg: "transparent" },
} as const;

export default function FileInfo({
  track,
  mobile = false,
  fullPath = false,
  onReprobe,
  open: controlledOpen,
  onOpenChange,
}: {
  track: Track;
  mobile?: boolean;
  fullPath?: boolean;
  onReprobe?: () => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const info = fileInfo(track);
  const badge = (
    <MetaTag
      asChild
      variant={info.lossless ? "lossless" : "plain"}
      cursor="pointer"
      {...(mobile ? touchTarget : {})}
    >
      <button type="button" aria-label={`File info: ${info.label}`}>
        {info.label}
      </button>
    </MetaTag>
  );
  if (mobile)
    return (
      <Drawer.Root open={open} onOpenChange={(e) => setOpen(e.open)} placement="bottom">
        <Drawer.Trigger asChild>{badge}</Drawer.Trigger>
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content
              bg="bg.panel"
              borderWidth="outline"
              borderColor="border.ink"
              boxShadow="md"
              maxH="85dvh"
              pb="env(safe-area-inset-bottom, 0px)"
            >
              <Flex bg="border.ink" color="bg" align="center" pl={4} pr={1}>
                <Drawer.Title flex={1} fontFamily="label">
                  File info
                </Drawer.Title>
                <Drawer.CloseTrigger asChild>
                  <Button variant="ghost" color="bg" minH="44px" position="static">
                    Close
                  </Button>
                </Drawer.CloseTrigger>
              </Flex>
              <Drawer.Body p={0} overflowY="auto">
                <FileInfoDetails track={track} fullPath={fullPath} onReprobe={onReprobe} />
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    );
  return (
    <Popover.Root
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      positioning={{ placement: "top-start" }}
    >
      <Popover.Trigger asChild>{badge}</Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            bg="bg.panel"
            borderWidth="outline"
            borderColor="border.ink"
            boxShadow="md"
            w="360px"
            maxW="calc(100vw - 24px)"
            maxH="80dvh"
            overflowY="auto"
          >
            <Flex bg="border.ink" color="bg" align="center" pl={4} pr={1}>
              <Popover.Title flex={1} fontFamily="label">
                File info
              </Popover.Title>
              <Popover.CloseTrigger asChild>
                <Button variant="ghost" color="bg" minH="44px" position="static">
                  Close
                </Button>
              </Popover.CloseTrigger>
            </Flex>
            <FileInfoDetails track={track} fullPath={fullPath} onReprobe={onReprobe} />
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
