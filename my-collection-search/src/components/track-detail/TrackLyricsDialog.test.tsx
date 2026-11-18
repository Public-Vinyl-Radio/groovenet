// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({
  fetchTrackLyrics: vi.fn(),
  saveTrackLyrics: vi.fn(),
  clearTrackLyrics: vi.fn(),
}));
vi.mock("@/services/internalApi/trackLyrics", () => api);

import TrackLyricsDialog from "./TrackLyricsDialog";

const lyrics = { text: "Old words", source: "embedded" as const, updated_at: "2026-11-11" };

function renderDialog(open = true, onOpenChange = vi.fn()) {
  const view = renderWithProviders(
    <TrackLyricsDialog trackId="t1" friendId={1} open={open} onOpenChange={onOpenChange} />,
  );
  return { ...view, onOpenChange, user: userEvent.setup() };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("TrackLyricsDialog", () => {
  it("is a Lyrics dialog that reads, edits and saves into the cache", async () => {
    api.fetchTrackLyrics.mockResolvedValue({ kind: "lyrics", lyrics });
    api.saveTrackLyrics.mockResolvedValue({ ...lyrics, text: "New words", source: "user" });
    const { user, queryClient } = renderDialog();

    const dialog = await screen.findByRole("dialog", { name: "Lyrics" });
    expect(dialog).toBeTruthy();
    expect(await screen.findByText("From file")).toBeTruthy();
    expect(screen.getByTestId("track-lyrics-text").textContent).toBe("Old words");
    expect(api.fetchTrackLyrics).toHaveBeenCalledWith("t1", 1);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Lyrics" });
    await user.clear(box);
    await user.type(box, "New words");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Edited")).toBeTruthy();
    expect(api.saveTrackLyrics).toHaveBeenCalledWith("t1", 1, "New words");
    expect(queryClient.getQueryData(queryKeys.trackLyrics("t1", 1))).toMatchObject({
      kind: "lyrics",
      lyrics: { text: "New words", source: "user" },
    });
  });

  it("clears into the empty state", async () => {
    api.fetchTrackLyrics.mockResolvedValue({ kind: "lyrics", lyrics });
    api.clearTrackLyrics.mockResolvedValue({ deleted: true });
    const { user } = renderDialog();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Clear lyrics" }));

    expect(await screen.findByText("None")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add lyrics" })).toBeTruthy();
    expect(api.clearTrackLyrics).toHaveBeenCalledWith("t1", 1);
  });

  it("closes from its close button and renders nothing while closed", async () => {
    api.fetchTrackLyrics.mockResolvedValue({ kind: "none" });
    const { user, onOpenChange, unmount } = renderDialog();
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    unmount();
    renderDialog(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
