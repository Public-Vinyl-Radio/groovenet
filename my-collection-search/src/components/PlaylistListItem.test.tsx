// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Playlist } from "@/types/track";
import { formatDuration, playlistSummary } from "./PlaylistListItem";
import PlaylistListItem from "./PlaylistListItem";

const base = { id: 1, name: "N", tracks: [{}, {}, {}], created_at: "2026-01-01T00:00:00Z" } as unknown as Playlist;

describe("playlistSummary", () => {
  it("is count, duration and created date", () => {
    const text = playlistSummary({ ...base, total_duration_seconds: 7500 });
    expect(text).toMatch(/^3 tracks · 2h 5m · /);
  });

  it("leaves out a missing duration", () => {
    expect(playlistSummary(base)).toMatch(/^3 tracks · (?!.*\dm ·)/);
  });

  it("uses the played date for a performed set", () => {
    const text = playlistSummary({
      ...base,
      set: { last_performed_at: "2026-02-02T00:00:00Z" },
    } as unknown as Playlist);
    expect(text).toContain("Played ");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours, and nothing for no duration", () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(3900)).toBe("1h 5m");
  });
});

describe("PlaylistListItem", () => {
  it("passes a performed set's badge and collaborators to the row menu", async () => {
    const playlist = {
      ...base,
      set: {
        status: "performed",
        title: "Friday",
        collaborators: [{ username: "ana" }, { username: "bo" }],
        last_performed_at: "2026-02-02T00:00:00Z",
      },
    } as unknown as Playlist;
    const { screen } = await import("@testing-library/react");
    const rendered = renderWithProviders(
      <PlaylistListItem playlist={playlist} onClick={vi.fn()} onPlay={vi.fn()} onDelete={vi.fn()} onEnqueue={vi.fn()} />
    );
    await rendered.user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    expect(await screen.findByText(/PLAYED/)).toBeTruthy();
    expect(screen.getAllByText("ana, bo").length).toBeGreaterThan(0);
  });
});
