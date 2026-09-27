"use client";

import React from "react";
import { Badge, Box, Button, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { FiChevronDown, FiChevronUp, FiTrash2 } from "react-icons/fi";
import { Tooltip } from "@/components/ui/tooltip";
import {
  describeProvenance,
  formatTrackLine,
  summarizeSpin,
  type SpinListItem,
} from "./spinSummary";

type Props = {
  item: SpinListItem;
  onDelete: (spinId: number) => void;
  deletePending: boolean;
};

function formatPlayedAt(dateString: string): string {
  return new Date(dateString).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AlbumSpinRow({ item, onDelete, deletePending }: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const summary = summarizeSpin(item);
  const provenance = describeProvenance(item);

  return (
    <Flex
      align="start"
      gap={2}
      px={3}
      py={2}
      borderBottomWidth="1px"
      _last={{ borderBottomWidth: 0 }}
      minW={0}
    >
      <Stack gap={0.5} flex="1" minW={0}>
        <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
          {summary.headline}
        </Text>
        <HStack gap={1.5} wrap="wrap" align="center">
          <Tooltip content={provenance.description} showArrow>
            <Badge
              size="xs"
              variant="subtle"
              colorPalette={provenance.label === "Auto" ? "purple" : "gray"}
            >
              {provenance.label}
            </Badge>
          </Tooltip>
          {item.session.context_type && (
            <Badge size="xs" variant="outline">{item.session.context_type}</Badge>
          )}
          <Text fontSize="xs" color="fg.muted">
            {formatPlayedAt(item.session.played_at)}
          </Text>
          {summary.hasMoreTracks && (
            <Button
              size="2xs"
              variant="plain"
              color="fg.muted"
              px={0}
              h="auto"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : "Show"} {summary.tracks.length} track
              {summary.tracks.length === 1 ? "" : "s"}
              {expanded ? <FiChevronUp /> : <FiChevronDown />}
            </Button>
          )}
        </HStack>
        {item.session.note && (
          <Text fontSize="xs" color="fg.muted" whiteSpace="pre-wrap">
            {item.session.note}
          </Text>
        )}
        {expanded && (
          <Box as="ol" listStyleType="none" mt={1} pl={2} borderLeftWidth="2px">
            {summary.tracks.map((track) => (
              <Text as="li" key={track.key} fontSize="xs" lineClamp={1}>
                {formatTrackLine(track)}
              </Text>
            ))}
          </Box>
        )}
      </Stack>
      <Button
        size="xs"
        variant="ghost"
        colorPalette="red"
        loading={deletePending}
        onClick={() => onDelete(item.session.id)}
        aria-label="Delete spin"
        minW="28px"
        h="28px"
        p={0}
        flexShrink={0}
      >
        <FiTrash2 />
      </Button>
    </Flex>
  );
}
