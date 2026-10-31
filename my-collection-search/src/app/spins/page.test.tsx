// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import type { SpinListItem } from "@/components/spins/spinSummary";
import SpinsPage from "./page";

const mocks = vi.hoisted(() => ({ spins: [] as unknown[] }));

vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 6 }, isHydrated: true }),
}));
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinsQuery: () => ({ spins: mocks.spins, isLoading: false }),
  useSpinTopTracksQuery: () => ({ topTracks: [], isLoading: false }),
  useSpinMutations: () => ({ deleteSpin: vi.fn(), deleteSpinPending: false }),
}));

function spinAt(playedAt: string): SpinListItem {
  return {
    session: {
      id: 1,
      friend_id: 6,
      release_id: "r1",
      medium: "vinyl",
      selection_mode: "tracks",
      played_at: playedAt,
      provenance: "manual",
      confidence: null,
      created_at: playedAt,
      updated_at: playedAt,
    },
    selections: [],
    track_events: [],
    derived: {
      is_full_album_spin: false,
      selected_side_count: 0,
      album_side_count: 0,
      track_count: 0,
    },
  } as unknown as SpinListItem;
}

describe("SpinsPage time zone", () => {
  it("groups and times spins in the configured zone, not the browser's", () => {
    // 06:30 UTC on Sep 27 is 23:30 on Sep 26 in Los Angeles.
    mocks.spins = [spinAt("2026-09-27T06:30:00Z")];
    renderWithProviders(
      <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
        <SpinsPage />
      </DisplayTimeZoneProvider>,
    );
    expect(screen.getByText(/11:30\sPM/)).toBeTruthy();
    expect(screen.getByText(/Saturday, Sep 26/)).toBeTruthy();
  });

  it("defaults to UTC without a provider", () => {
    mocks.spins = [spinAt("2026-09-27T06:30:00Z")];
    renderWithProviders(<SpinsPage />);
    expect(screen.getByText(/6:30\sAM/)).toBeTruthy();
    expect(screen.getByText(/Sunday, Sep 27/)).toBeTruthy();
  });
});
