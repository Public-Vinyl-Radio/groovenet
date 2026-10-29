// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { DropResult } from "@hello-pangea/dnd";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

// Drag and drop is the library's; capture the drop handler to check the index mapping.
const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((r: DropResult) => void),
  dragging: false,
}));
vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({
    onDragEnd,
    children,
  }: {
    onDragEnd: (r: DropResult) => void;
    children: React.ReactNode;
  }) => {
    dnd.onDragEnd = onDragEnd;
    return <>{children}</>;
  },
  Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
    children({ innerRef: () => {}, droppableProps: {}, placeholder: null }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: { role: "button", tabIndex: 0 } },
      { isDragging: dnd.dragging },
    ),
}));

import QueueList from "@/components/player/QueueList";

const track = (n: number, over: Partial<Track> = {}) =>
  ({
    track_id: `t${n}`,
    friend_id: 1,
    title: `Title ${n}`,
    artist: `Artist ${n}`,
    duration_seconds: 120 + n,
    key: "D minor",
    local_tags: "Cumbia, Salsa",
    genres: ["Latin"],
    ...over,
  }) as Track;

const playlist = [track(0), track(1), track(2), track(3), track(4)];

function renderList(
  currentTrackIndex: number | null,
  over: Partial<React.ComponentProps<typeof QueueList>> = {},
) {
  const fns = { moveTrack: vi.fn(), removeTrack: vi.fn(), playTrack: vi.fn() };
  const utils = renderWithProviders(
    <QueueList playlist={playlist} currentTrackIndex={currentTrackIndex} {...fns} {...over} />,
  );
  return { ...utils, ...fns };
}

describe("QueueList", () => {
  it("shows the playing track outlined, then UP NEXT, then what has played", () => {
    renderList(2);
    const now = screen.getByTestId("queue-now-playing");
    expect(within(now).getByText("Title 2")).toBeTruthy();
    expect(within(now).getByText("2:02")).toBeTruthy();
    expect(within(now).getByText("7A")).toBeTruthy();
    expect(screen.getByText("UP NEXT")).toBeTruthy();
    expect(screen.getByText("PLAYED")).toBeTruthy();
    const rows = screen
      .getAllByRole("button", { name: /^Play / })
      .map((b) => b.getAttribute("aria-label"));
    expect(rows).toEqual([
      "Play Title 3 by Artist 3",
      "Play Title 4 by Artist 4",
      "Play Title 0 by Artist 0",
      "Play Title 1 by Artist 1",
    ]);
  });

  it("never shows genre tags", () => {
    renderList(0);
    expect(screen.queryByText(/Cumbia|Salsa|Latin/i)).toBeNull();
  });

  it("puts every track up next before playback starts", () => {
    renderList(null);
    expect(screen.queryByTestId("queue-now-playing")).toBeNull();
    expect(screen.queryByText("PLAYED")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Play / })).toHaveLength(5);
  });

  it("plays and removes by queue index", async () => {
    const { user, playTrack, removeTrack } = renderList(2);
    await user.click(screen.getByRole("button", { name: "Play Title 4 by Artist 4" }));
    expect(playTrack).toHaveBeenCalledWith(4);
    await user.click(screen.getByRole("button", { name: "Remove Title 0 from queue" }));
    expect(removeTrack).toHaveBeenCalledWith(0);
  });

  it("gives each row a 44px drag handle named for its track", () => {
    renderList(2);
    expect(screen.getByRole("button", { name: "Reorder Title 3" })).toBeTruthy();
  });

  it("maps a drop back to queue indices within a section", () => {
    const { moveTrack } = renderList(1);
    const drop = (id: string, from: number, to: number | null, toId = id) =>
      dnd.onDragEnd!({
        source: { droppableId: id, index: from },
        destination: to === null ? null : { droppableId: toId, index: to },
      } as DropResult);

    drop("queue-up-next", 0, 2);
    expect(moveTrack).toHaveBeenLastCalledWith(2, 4);
    drop("queue-played", 0, 0);
    drop("queue-up-next", 0, null);
    drop("queue-up-next", 0, 0, "queue-played");
    expect(moveTrack).toHaveBeenCalledTimes(1);
  });

  it("maps a drop in the played section from the top of the queue", () => {
    const { moveTrack } = renderList(3);
    dnd.onDragEnd!({
      source: { droppableId: "queue-played", index: 0 },
      destination: { droppableId: "queue-played", index: 2 },
    } as DropResult);
    expect(moveTrack).toHaveBeenCalledWith(0, 2);
  });

  it("outlines a lifted row with its own shadow", () => {
    dnd.dragging = true;
    renderList(2);
    const row = screen.getByRole("button", { name: "Reorder Title 3" }).closest("li")!;
    const css = [...row.classList]
      .flatMap((c) =>
        Array.from(document.styleSheets)
          .flatMap((s) => Array.from(s.cssRules))
          .map((r) => r.cssText)
          .filter((t) => t.includes(`.${c}`)),
      )
      .join("\n");
    expect(css).toMatch(/box-shadow:\s*var\(--chakra-shadows-md\)/);
    dnd.dragging = false;
  });

  it("shows no playing row when the index has run past the queue", () => {
    renderList(9);
    expect(screen.queryByTestId("queue-now-playing")).toBeNull();
  });

  it("says so when the queue is empty", () => {
    renderList(null, { playlist: [] });
    expect(screen.getByText("Queue is empty")).toBeTruthy();
  });

  it("leaves the key blank when it is unknown", () => {
    renderList(0, { playlist: [track(0, { key: null })] });
    expect(screen.queryByText("7A")).toBeNull();
  });
});
