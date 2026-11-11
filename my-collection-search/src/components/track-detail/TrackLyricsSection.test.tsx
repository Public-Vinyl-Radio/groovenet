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

import TrackLyricsSection from "./TrackLyricsSection";

const lyrics = { text: "Old words", source: "embedded" as const, updated_at: "2026-11-11" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("TrackLyricsSection", () => {
  it("reads the track's lyrics and writes a save back into the cache", async () => {
    api.fetchTrackLyrics.mockResolvedValue({ kind: "lyrics", lyrics });
    api.saveTrackLyrics.mockResolvedValue({ ...lyrics, text: "New words", source: "user" });
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<TrackLyricsSection trackId="t1" friendId={1} />);

    expect(await screen.findByText("From file")).toBeTruthy();
    expect(api.fetchTrackLyrics).toHaveBeenCalledWith("t1", 1);

    await user.click(screen.getByRole("button", { name: "Show" }));
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
    const user = userEvent.setup();
    renderWithProviders(<TrackLyricsSection trackId="t1" friendId={1} />);

    await user.click(await screen.findByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Clear lyrics" }));

    expect(await screen.findByText("None")).toBeTruthy();
    expect(api.clearTrackLyrics).toHaveBeenCalledWith("t1", 1);
  });

  it("renders nothing for a friend's track", async () => {
    api.fetchTrackLyrics.mockResolvedValue({ kind: "not_owner" });
    const { container, queryClient } = renderWithProviders(
      <TrackLyricsSection trackId="t1" friendId={2} />,
    );
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.trackLyrics("t1", 2))).toEqual({
        kind: "not_owner",
      }),
    );
    expect(container.querySelector("section")).toBeNull();
  });
});
