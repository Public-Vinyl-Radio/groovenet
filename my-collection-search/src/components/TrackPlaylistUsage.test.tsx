// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const fetchTrackPlaylists = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/tracks", () => ({ fetchTrackPlaylists }));

import TrackPlaylistUsage from "./TrackPlaylistUsage";

const track = { track_id: "t1", friend_id: 1 };

describe("TrackPlaylistUsage", () => {
  it("renders nothing for a track in no playlist", () => {
    const { container } = renderWithProviders(<TrackPlaylistUsage track={track} count={0} />);
    expect(container.textContent).toBe("");
  });

  it("is a Metadata tag button that lists the playlists and positions", async () => {
    fetchTrackPlaylists.mockResolvedValue([{ id: 7, name: "Peak time", position: 3 }]);
    const { user } = renderWithProviders(<TrackPlaylistUsage track={track} count={2} />);
    const button = screen.getByRole("button", { name: "2 playlists" });
    await user.click(button);
    expect(await screen.findByText("Peak time")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();
    expect(fetchTrackPlaylists).toHaveBeenCalledWith("t1", 1);
  });

  it("names a single playlist in the singular", () => {
    renderWithProviders(<TrackPlaylistUsage track={track} count={1} size="sm" />);
    expect(screen.getByRole("button", { name: "1 playlist" })).toBeTruthy();
  });
});
