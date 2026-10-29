// @vitest-environment jsdom
import React from "react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack, trackInPlaylist } from "@/stories/fixtures/track";
import DraggableTrackList from "./DraggableTrackList";

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));

describe("DraggableTrackList dense rows", () => {
  it("forwards the dense row layout and associates row clicks with the playlist index", () => {
    const onRowClick = vi.fn();
    renderWithProviders(
      <DraggableTrackList
        tracksPlaylist={[
          { track_id: sampleTrack.track_id, friend_id: sampleTrack.friend_id! },
          { track_id: trackInPlaylist.track_id, friend_id: trackInPlaylist.friend_id! },
        ]}
        tracks={[sampleTrack, trackInPlaylist]}
        moveTrack={vi.fn()}
        droppableId="queue-test"
        currentTrackIndex={1}
        trackResultProps={{
          density: "dense",
          layout: "row",
          onRowClick,
        }}
      />,
    );

    const rows = screen.getAllByTestId("track-result-dense-row");
    expect(rows).toHaveLength(2);
    expect(rows[1].closest("[data-rfd-drag-handle-draggable-id]")).toBeTruthy();
    fireEvent.click(rows[1]);
    expect(onRowClick).toHaveBeenCalledWith(trackInPlaylist, 1);
  });
});

describe("DraggableTrackList table rows", () => {
  const refs = [
    { track_id: sampleTrack.track_id, friend_id: sampleTrack.friend_id! },
    { track_id: trackInPlaylist.track_id, friend_id: trackInPlaylist.friend_id! },
    // The same track twice: draggable keys must stay unique.
    { track_id: sampleTrack.track_id, friend_id: sampleTrack.friend_id! },
  ];
  const renderRows = (props: Partial<React.ComponentProps<typeof DraggableTrackList>> = {}) =>
    renderWithProviders(
      <DraggableTrackList
        tracksPlaylist={refs}
        tracks={[sampleTrack, trackInPlaylist]}
        moveTrack={vi.fn()}
        droppableId="playlist-test"
        trackResultProps={{ layout: "row" }}
        {...props}
      />,
    );

  it("is one outlined block under a single header, numbering each row", () => {
    renderRows();
    const table = screen.getByTestId("track-table");
    expect(within(table).getByText("Release")).toBeTruthy();
    expect(within(table).getAllByTestId("track-result-row")).toHaveLength(3);
    expect(screen.getAllByTestId("track-list-position").map((n) => n.textContent)).toEqual([
      "1.",
      "2.",
      "3.",
    ]);
    const ids = [...table.querySelectorAll("[data-rfd-draggable-id]")].map((n) =>
      n.getAttribute("data-rfd-draggable-id"),
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("leaves cards and the queue's dense rows unwrapped and unnumbered", () => {
    const { unmount } = renderRows({ trackResultProps: { layout: "card" } });
    expect(screen.queryByTestId("track-table")).toBeNull();
    expect(screen.queryByTestId("track-list-position")).toBeNull();
    unmount();
    renderRows({ trackResultProps: { layout: "row", density: "dense" } });
    expect(screen.queryByTestId("track-table")).toBeNull();
    expect(screen.queryByTestId("track-list-position")).toBeNull();
  });

  it("plays the clicked row but not its links or buttons", () => {
    const onRowClick = vi.fn();
    renderRows({ trackResultProps: { layout: "row", onRowClick } });
    const [first] = screen.getAllByTestId("track-result-row");
    fireEvent.click(within(first).getAllByRole("link")[0]);
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(first);
    expect(onRowClick).toHaveBeenCalledWith(sampleTrack, 0);
  });

  it("ignores clicks that bubble from a portalled popover", () => {
    const onRowClick = vi.fn();
    renderRows({
      trackResultProps: { layout: "row", onRowClick },
      renderTrackButtons: () =>
        createPortal(<span data-testid="portalled">menu</span>, document.body),
    });
    fireEvent.click(screen.getAllByTestId("portalled")[0]);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("highlights the current row", () => {
    renderRows({ currentTrackIndex: 1 });
    const handles = [...document.querySelectorAll("[data-rfd-drag-handle-draggable-id]")];
    // Chakra's bg is a generated class, so the current row's differs from the others'.
    expect(handles[1].className).not.toBe(handles[0].className);
    expect(handles[0].className).toBe(handles[2].className);
  });

  it("reorders with the keyboard", async () => {
    const moveTrack = vi.fn();
    renderRows({ moveTrack });
    const handle = document.querySelectorAll<HTMLElement>("[data-rfd-drag-handle-draggable-id]")[0];
    act(() => handle.focus());
    fireEvent.keyDown(handle, { key: " ", keyCode: 32 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Lifted: the row carries its own outline and background.
    expect(handle.className).not.toBe(
      document.querySelectorAll<HTMLElement>("[data-rfd-drag-handle-draggable-id]")[2].className,
    );
    fireEvent.keyDown(handle, { key: "ArrowDown", keyCode: 40 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    fireEvent.keyDown(handle, { key: " ", keyCode: 32 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(moveTrack).toHaveBeenCalledWith(0, 1);
  });
});
