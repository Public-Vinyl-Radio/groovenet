// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const state = vi.hoisted(() => ({ playlist: [] as Track[] }));
vi.mock("@/components/player/usePlayerControlsController", () => ({
  usePlayerControlsController: () => ({ playlist: state.playlist }),
}));
const importPlaylist = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/playlists", () => ({ importPlaylist }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import { useQueueSaveDialog } from "../useQueueSaveDialog";

const t = (n: number) => ({ track_id: `t${n}`, friend_id: n }) as unknown as Track;

function Harness() {
  const { Dialog, open, close, isOpen } = useQueueSaveDialog();
  return (
    <>
      <button onClick={open}>open</button>
      <button onClick={close}>shut</button>
      <span>{isOpen ? "is-open" : "is-closed"}</span>
      <Dialog />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  importPlaylist.mockResolvedValue({});
});

describe("useQueueSaveDialog", () => {
  it("counts and saves the queue the panel shows (server queue)", async () => {
    state.playlist = [t(1), t(2), t(3)];
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByText("open"));
    expect(await screen.findByText("3 tracks will be saved.")).toBeTruthy();
    await user.type(screen.getByPlaceholderText("Playlist name"), "Lounge");
    await user.click(screen.getByRole("button", { name: "Save playlist" }));
    await waitFor(() =>
      expect(importPlaylist).toHaveBeenCalledWith("Lounge", [
        { track_id: "t1", friend_id: 1 },
        { track_id: "t2", friend_id: 2 },
        { track_id: "t3", friend_id: 3 },
      ]),
    );
    await waitFor(() => expect(screen.getByText("is-closed")).toBeTruthy());
  });

  it("refuses an empty queue", async () => {
    state.playlist = [];
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByText("open"));
    await user.type(await screen.findByPlaceholderText("Playlist name"), "X");
    await user.click(await screen.findByRole("button", { name: "Save playlist" }));
    expect(toast).toHaveBeenCalledWith({ title: "Cannot save empty queue", type: "error" });
    expect(importPlaylist).not.toHaveBeenCalled();
  });

  it("reports a failed save and closes from outside", async () => {
    state.playlist = [t(1)];
    importPlaylist.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByText("open"));
    await user.type(await screen.findByPlaceholderText("Playlist name"), "X");
    await user.click(await screen.findByRole("button", { name: "Save playlist" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Failed to save queue as playlist",
        type: "error",
      }),
    );
    expect(screen.getByText("is-open")).toBeTruthy();
    fireEvent.click(screen.getByText("shut"));
    expect(screen.getByText("is-closed")).toBeTruthy();
  });
});
