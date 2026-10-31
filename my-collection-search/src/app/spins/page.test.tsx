// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import type { SpinListItem } from "@/components/spins/spinSummary";

const user = vi.hoisted(() => ({
  value: { friend: { id: 7 }, isHydrated: true } as {
    friend: { id: number } | null;
    isHydrated: boolean;
  },
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => user.value }));
const query = { spins: [] as SpinListItem[], topTracks: [], isLoading: false };
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinsQuery: () => query,
  useSpinTopTracksQuery: () => query,
  useSpinMutations: () => ({ deleteSpin: vi.fn(), deleteSpinPending: false }),
}));

import SpinsPage from "./page";

beforeEach(() => {
  user.value = { friend: { id: 7 }, isHydrated: true };
  query.spins = [];
});

describe("SpinsPage header", () => {
  it("titles the page through the shared header", () => {
    renderWithProviders(<SpinsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Vinyl Spins" })).toBeTruthy();
  });

  it("keeps the header while the library is still loading", () => {
    user.value = { friend: null, isHydrated: false };
    renderWithProviders(<SpinsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Vinyl Spins" })).toBeTruthy();
  });
});

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
    query.spins = [spinAt("2026-09-27T06:30:00Z")];
    renderWithProviders(
      <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
        <SpinsPage />
      </DisplayTimeZoneProvider>,
    );
    expect(screen.getByText(/11:30\sPM/)).toBeTruthy();
    expect(screen.getByText(/Saturday, Sep 26/)).toBeTruthy();
  });

  it("defaults to UTC without a provider", () => {
    query.spins = [spinAt("2026-09-27T06:30:00Z")];
    renderWithProviders(<SpinsPage />);
    expect(screen.getByText(/6:30\sAM/)).toBeTruthy();
    expect(screen.getByText(/Sunday, Sep 27/)).toBeTruthy();
  });
});
