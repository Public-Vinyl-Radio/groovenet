"use client";

import React from "react";
import { Box, chakra, EmptyState, Flex, Text, VStack } from "@chakra-ui/react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { FiX } from "react-icons/fi";
import { LuGripVertical, LuMusic } from "react-icons/lu";
import type { Track } from "@/types/track";
import { camelotOf } from "@/lib/mixCompat";
import Artwork from "@/components/player/Artwork";
import { artworkAlt, artworkOf, trackDurationLabel } from "@/components/player/trackMeta";

type Props = {
  playlist: Track[];
  currentTrackIndex: number | null;
  moveTrack: (fromIndex: number, toIndex: number) => void;
  removeTrack: (index: number) => void;
  playTrack: (index: number) => void;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text as="span" fontFamily="mono" fontSize="11px" letterSpacing="0.08em" fontWeight="semibold" color="fg.muted">
    {children}
  </Text>
);

function Divider({ label, count }: { label: string; count: number }) {
  return (
    <Flex align="center" gap="10px" px="16px" pt="18px" pb="6px">
      <SectionLabel>{label}</SectionLabel>
      <Box flex="1" h="1px" bg="border" />
      <Text as="span" fontFamily="mono" fontSize="11px" color="fg.muted">
        {count}
      </Text>
    </Flex>
  );
}

/** Duration over the Camelot key, in mono. */
function TrackFigures({ track }: { track: Track }) {
  return (
    <Box flexShrink={0} textAlign="right" fontFamily="mono" fontSize="12px" lineHeight="16px">
      <Text>{trackDurationLabel(track)}</Text>
      <Text color="fg.muted">{camelotOf(track.key) ?? ""}</Text>
    </Box>
  );
}

function TrackText({ track }: { track: Track }) {
  return (
    <Flex direction="column" flex="1" minW={0}>
      <Text fontSize="15px" lineHeight="20px" fontWeight="semibold" truncate title={track.title}>
        {track.title}
      </Text>
      <Text fontSize="13px" lineHeight="18px" color="fg.muted" truncate title={track.artist}>
        {track.artist}
      </Text>
    </Flex>
  );
}

const RowButton = chakra("button", {
  base: {
    flex: "1",
    minW: 0,
    minH: "60px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textAlign: "left",
    cursor: "pointer",
    color: "fg",
  },
});

const IconKey = chakra("button", {
  base: {
    w: "44px",
    h: "44px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "fg.muted",
    cursor: "pointer",
    _hover: { bg: "bg.muted", color: "fg" },
  },
});

/** One draggable section of the queue; `offset` maps its rows back to queue indices. */
function QueueSection({
  id,
  offset,
  tracks,
  removeTrack,
  playTrack,
}: {
  id: string;
  offset: number;
  tracks: Track[];
  removeTrack: (index: number) => void;
  playTrack: (index: number) => void;
}) {
  return (
    <Droppable droppableId={id}>
      {(drop) => (
        <chakra.ol ref={drop.innerRef} {...drop.droppableProps} listStyleType="none" m={0} px="4px">
          {tracks.map((track, i) => {
            const index = offset + i;
            const key = `${track.track_id}:${track.friend_id}:${index}`;
            return (
              <Draggable key={key} draggableId={key} index={i}>
                {(drag, snapshot) => (
                  <chakra.li
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    display="flex"
                    alignItems="center"
                    gap="8px"
                    minH="64px"
                    borderBottomWidth="rule"
                    borderColor="border"
                    bg="bg"
                    {...(snapshot.isDragging
                      ? { borderWidth: "outline", borderColor: "border.ink", boxShadow: "md" }
                      : {})}
                  >
                    <Box
                      as="span"
                      {...drag.dragHandleProps}
                      aria-label={`Reorder ${track.title}`}
                      w="44px"
                      h="44px"
                      flexShrink={0}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="fg.muted"
                      cursor="grab"
                    >
                      <LuGripVertical size={16} />
                    </Box>
                    <RowButton onClick={() => playTrack(index)} aria-label={`Play ${track.title} by ${track.artist}`}>
                      <Artwork src={artworkOf(track)} alt="" size="44px" />
                      <TrackText track={track} />
                      <TrackFigures track={track} />
                    </RowButton>
                    <IconKey aria-label={`Remove ${track.title} from queue`} onClick={() => removeTrack(index)}>
                      <FiX size={16} />
                    </IconKey>
                  </chakra.li>
                )}
              </Draggable>
            );
          })}
          {drop.placeholder}
        </chakra.ol>
      )}
    </Droppable>
  );
}

/**
 * The queue (#792), shared by the phone queue and the desktop panel: the
 * playing track as an outlined row, then UP NEXT, then what has already
 * played. Rows are full-width title and artist, duration and key in mono,
 * a drag handle and a remove key; tapping a row plays it.
 */
export default function QueueList({ playlist, currentTrackIndex, moveTrack, removeTrack, playTrack }: Props) {
  const current = currentTrackIndex === null ? null : playlist[currentTrackIndex] ?? null;
  const nextOffset = currentTrackIndex === null ? 0 : currentTrackIndex + 1;
  const upNext = playlist.slice(nextOffset);
  const played = currentTrackIndex === null ? [] : playlist.slice(0, currentTrackIndex);

  const onDragEnd = React.useCallback(
    ({ source, destination }: DropResult) => {
      // Rows move within their own section.
      if (!destination || destination.droppableId !== source.droppableId) return;
      if (destination.index === source.index) return;
      const offset = source.droppableId === "queue-up-next" ? nextOffset : 0;
      moveTrack(offset + source.index, offset + destination.index);
    },
    [moveTrack, nextOffset]
  );

  if (playlist.length === 0) {
    return (
      <EmptyState.Root size="sm" py={10}>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <LuMusic />
          </EmptyState.Indicator>
          <VStack textAlign="center">
            <EmptyState.Title>Queue is empty</EmptyState.Title>
            <EmptyState.Description>Add tracks to your queue to see them here.</EmptyState.Description>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <Box pb="16px">
      {current && (
        <>
          <Box px="16px" pt="12px" pb="6px">
            <SectionLabel>NOW PLAYING</SectionLabel>
          </Box>
          <Flex
            data-testid="queue-now-playing"
            aria-current="true"
            align="center"
            gap="12px"
            ml="16px"
            mr="22px"
            p="8px"
            borderWidth="outline"
            borderColor="border.ink"
            boxShadow="sm"
            bg="bg.panel"
          >
            <Artwork src={artworkOf(current)} alt={artworkAlt(current)} size="48px" />
            <TrackText track={current} />
            <TrackFigures track={current} />
          </Flex>
        </>
      )}
      <DragDropContext onDragEnd={onDragEnd}>
        {upNext.length > 0 && (
          <>
            <Divider label="UP NEXT" count={upNext.length} />
            <QueueSection id="queue-up-next" offset={nextOffset} tracks={upNext} removeTrack={removeTrack} playTrack={playTrack} />
          </>
        )}
        {played.length > 0 && (
          <>
            <Divider label="PLAYED" count={played.length} />
            <QueueSection id="queue-played" offset={0} tracks={played} removeTrack={removeTrack} playTrack={playTrack} />
          </>
        )}
      </DragDropContext>
    </Box>
  );
}
