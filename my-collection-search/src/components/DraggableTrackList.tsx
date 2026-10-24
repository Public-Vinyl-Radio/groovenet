"use client";

import React from "react";
import { Box } from "@chakra-ui/react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DroppableProvided,
  DraggableProvided,
  DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import TrackResultStore from "@/components/TrackResultStore";
import { TrackListHeader } from "@/components/TrackResult";
import { useDragAndDropList } from "@/hooks/useDragAndDropList";
import type { Track } from "@/types/track";
import type { SortPositionChange } from "@/hooks/usePlaylistMutations";

interface DraggableTrackListProps {
  /** Array of track IDs in order */
  tracksPlaylist: { track_id: string; friend_id: number }[];
  /** Array of track objects for fallback */
  tracks: Track[];
  /** Function to move tracks within the list */
  moveTrack: (fromIndex: number, toIndex: number) => void;
  /** Unique ID for the droppable area */
  droppableId: string;
  /** Function to render action buttons for each track */
  renderTrackButtons?: (
    track: Track | undefined,
    index: number
  ) => React.ReactNode;
  /** Additional props for TrackResultStore */
  trackResultProps?: {
    density?: "standard" | "dense";
    layout?: "card" | "row";
    onRowClick?: (track: Track | undefined, index: number) => void;
    playlistCount?: Record<string, number>;
  };
  /** Current playing track index (for highlighting) */
  currentTrackIndex?: number | null;
  sortPositionChanges?: Record<string, SortPositionChange>;
}

export default function DraggableTrackList({
  tracksPlaylist,
  tracks,
  moveTrack,
  droppableId,
  renderTrackButtons,
  trackResultProps = {},
  currentTrackIndex,
  sortPositionChanges = {},
}: DraggableTrackListProps) {
  const { onDragEnd } = useDragAndDropList(moveTrack);
  // Standard-density rows are a table: one outlined block with a header. The queue's dense rows are not.
  const isTable =
    trackResultProps?.layout === "row" && trackResultProps?.density !== "dense";

  const list = (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={droppableId}>
        {(provided: DroppableProvided) => (
          <Box ref={provided.innerRef} {...provided.droppableProps}>
            {tracksPlaylist.map((trackPlay, idx) => {
              // Find the track in the tracks array for fallback
              const track = tracks.find(
                (t) =>
                  t.track_id === trackPlay.track_id &&
                  t.friend_id === trackPlay.friend_id
              );
              // Playlists can contain duplicate track refs; include index to ensure uniqueness.
              const draggableKey = `${trackPlay.track_id}:${trackPlay.friend_id}:${idx}`;
              const isCurrentTrack = currentTrackIndex === idx;
              const useDenseRow = trackResultProps?.density === "dense" && trackResultProps?.layout === "row";
              const sortPositionChange =
                sortPositionChanges[
                  `${trackPlay.track_id}:${trackPlay.friend_id}:${idx}`
                ];

              return (
                <Draggable
                  key={draggableKey}
                  draggableId={draggableKey}
                  index={idx}
                >
                  {(
                    dragProvided: DraggableProvided,
                    snapshot: DraggableStateSnapshot
                  ) => (
                    <Box
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      opacity={snapshot.isDragging ? 0.9 : 1}
                      bg={
                        isTable && snapshot.isDragging
                          ? "bg.panel"
                          : isCurrentTrack
                            ? "bg.muted"
                            : undefined
                      }
                      borderRadius={
                        isTable ? undefined : isCurrentTrack ? (useDenseRow ? "xl" : "md") : undefined
                      }
                      // The block's shadow doesn't travel with a lifted row, so it gets its own.
                      {...(isTable && snapshot.isDragging
                        ? { borderWidth: "outline", borderColor: "border.ink", boxShadow: "md" }
                        : {})}
                    >
                      <TrackResultStore
                        key={`${droppableId}-${trackPlay.track_id}:${trackPlay.friend_id}:${idx}`}
                        trackId={trackPlay.track_id}
                        friendId={trackPlay.friend_id}
                        fallbackTrack={track}
                        buttons={
                          renderTrackButtons
                            ? renderTrackButtons(track, idx)
                            : undefined
                        }
                        density={trackResultProps?.density}
                        layout={trackResultProps?.layout}
                        onRowClick={
                          trackResultProps?.onRowClick
                            ? () => trackResultProps.onRowClick?.(track, idx)
                            : undefined
                        }
                        playlistCount={
                          trackResultProps?.playlistCount?.[
                            `${trackPlay.track_id}:${trackPlay.friend_id}`
                          ]
                        }
                        sortPositionChange={sortPositionChange}
                        listPosition={isTable ? idx + 1 : undefined}
                      />
                    </Box>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </Box>
        )}
      </Droppable>
    </DragDropContext>
  );

  if (!isTable) return list;
  return (
    <Box
      data-testid="track-table"
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      css={{ containerType: "inline-size" }}
    >
      <TrackListHeader />
      {list}
    </Box>
  );
}
