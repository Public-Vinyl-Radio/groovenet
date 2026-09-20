import React from 'react';
import { DropResult } from '@hello-pangea/dnd';

/**
 * Shared hook for drag-and-drop list operations
 * Used by both PlaylistViewer and QueueDrawer components
 */
export function useDragAndDropList(moveTrack: (fromIndex: number, toIndex: number) => void) {
  const onDragEnd = React.useCallback(
    (result: DropResult) => {
      const { destination, source } = result;

      // Dropped outside the list
      if (!destination) return;

      // Dropped in the same position
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      ) {
        return;
      }

      // Perform the move operation
      moveTrack(source.index, destination.index);
    },
    [moveTrack]
  );

  return { onDragEnd };
}
