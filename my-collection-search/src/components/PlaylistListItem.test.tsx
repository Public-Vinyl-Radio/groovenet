// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Playlist } from "@/types/track";
import { formatDuration, playlistCoverUrls, playlistSummary } from "./PlaylistListItem";
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

  it("keeps each meta part on one line and lets the row wrap", async () => {
    const { screen } = await import("@testing-library/react");
    renderWithProviders(
      <PlaylistListItem
        playlist={{ ...base, total_duration_seconds: 7500 }}
        onClick={vi.fn()}
        onPlay={vi.fn()}
        onDelete={vi.fn()}
        onEnqueue={vi.fn()}
      />
    );
    const meta = screen.getByTestId("playlist-meta");
    expect(getComputedStyle(meta).flexWrap).toBe("wrap");
    for (const part of ["3 tracks", "2h 5m"]) {
      expect(getComputedStyle(screen.getByText(part)).whiteSpace).toBe("nowrap");
    }
  });

  it("shows the day line only when the row sits under a month divider", async () => {
    const { screen } = await import("@testing-library/react");
    const props = { onClick: vi.fn(), onPlay: vi.fn(), onDelete: vi.fn(), onEnqueue: vi.fn() };
    const first = renderWithProviders(<PlaylistListItem playlist={base} {...props} />);
    expect(screen.queryByTestId("playlist-day")).toBeNull();
    first.unmount();
    renderWithProviders(<PlaylistListItem playlist={base} dayLabel="MON 10" {...props} />);
    expect(screen.getByTestId("playlist-day").textContent).toBe("MON 10");
  });

  it("renders a 2x2 mosaic from cover_urls, tinting the missing cells", async () => {
    const { screen } = await import("@testing-library/react");
    renderWithProviders(
      <PlaylistListItem
        playlist={{ ...base, cover_urls: ["/a.jpg", "/b.jpg"] }}
        onClick={vi.fn()}
        onPlay={vi.fn()}
        onDelete={vi.fn()}
        onEnqueue={vi.fn()}
      />
    );
    expect(screen.getAllByTestId("mosaic-cover")).toHaveLength(2);
    expect(screen.getAllByTestId("mosaic-tint")).toHaveLength(2);
  });

  it("falls back to four tinted blocks without cover_urls", async () => {
    const { screen } = await import("@testing-library/react");
    renderWithProviders(
      <PlaylistListItem playlist={base} onClick={vi.fn()} onPlay={vi.fn()} onDelete={vi.fn()} onEnqueue={vi.fn()} />
    );
    expect(screen.queryAllByTestId("mosaic-cover")).toHaveLength(0);
    expect(screen.getAllByTestId("mosaic-tint")).toHaveLength(4);
  });

  it("clamps the name and shows the collaborator in the meta line", async () => {
    const { screen } = await import("@testing-library/react");
    const playlist = {
      ...base,
      name: "Long name",
      set: { status: "planned", collaborators: [{ username: "ana" }], title: null },
    } as unknown as Playlist;
    renderWithProviders(
      <PlaylistListItem playlist={playlist} onClick={vi.fn()} onPlay={vi.fn()} onDelete={vi.fn()} onEnqueue={vi.fn()} />
    );
    expect(getComputedStyle(screen.getByText("Long name")).overflow).toBe("hidden");
    expect(getComputedStyle(screen.getByText("w/ ana")).whiteSpace).toBe("nowrap");
  });

  it("shows the venue and the played date, and opens on click and Enter", async () => {
    const { screen, fireEvent } = await import("@testing-library/react");
    const onClick = vi.fn();
    const playlist = {
      ...base,
      set: {
        status: "performed",
        collaborators: [],
        venue_name: "Room 4",
        last_performed_at: "2026-02-02T00:00:00Z",
      },
    } as unknown as Playlist;
    renderWithProviders(
      <PlaylistListItem playlist={playlist} onClick={onClick} onPlay={vi.fn()} onDelete={vi.fn()} onEnqueue={vi.fn()} />
    );
    expect(screen.getByText("Room 4")).toBeTruthy();
    expect(screen.getByText(/^Played /)).toBeTruthy();
    const open = screen.getAllByRole("button")[0];
    fireEvent.click(open);
    fireEvent.keyDown(open, { key: "Enter" });
    fireEvent.keyDown(open, { key: "a" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("PlaylistListItem loading", () => {
  it("shows a spinner while the row is loading", async () => {
    const { container } = renderWithProviders(
      <PlaylistListItem playlist={base} isLoading onClick={vi.fn()} onPlay={vi.fn()} onDelete={vi.fn()} onEnqueue={vi.fn()} />
    );
    expect(container.querySelector(".chakra-spinner")).toBeTruthy();
  });
});

describe("playlistCoverUrls", () => {
  it("keeps the first four non-empty urls and tolerates a missing field", () => {
    expect(playlistCoverUrls(base)).toEqual([]);
    const urls = playlistCoverUrls({ ...base, cover_urls: ["a", "", "b", "c", "d", "e"] });
    expect(urls).toEqual(["a", "b", "c", "d"]);
  });
});
