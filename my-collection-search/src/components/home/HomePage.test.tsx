// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { HOME_ARRIVALS, HOME_COUNTS } from "@/stories/fixtures/home";

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  friend: { id: 7 } as { id: number } | null,
  hydrated: true,
}));

vi.mock("@/hooks/useHomeQuery", () => ({ useHomeQuery: vi.fn(() => state.query) }));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: state.friend, isHydrated: state.hydrated }),
}));
vi.mock("@/providers/CommandPaletteProvider", () => ({
  useCommandPalette: () => ({ setPaletteOpen: vi.fn() }),
}));
vi.mock("./HomeNowPlaying", () => ({ default: () => null }));
vi.mock("./MonthCard", () => ({ default: () => <div data-testid="month" /> }));

import HomePage from "./HomePage";
import { useHomeQuery } from "@/hooks/useHomeQuery";

describe("HomePage", () => {
  beforeEach(() => {
    state.friend = { id: 7 };
    state.hydrated = true;
    vi.mocked(useHomeQuery).mockClear();
  });

  it("gives New arrivals its slice of the summary and the friend", () => {
    state.query = {
      home: { counts: HOME_COUNTS, new_arrivals: HOME_ARRIVALS },
      isPending: false,
      error: null,
    };
    renderWithProviders(<HomePage />);
    expect(useHomeQuery).toHaveBeenCalledWith({ friend_id: 7 }, { enabled: true });
    const section = screen.getByRole("region", { name: "NEW ARRIVALS" });
    expect(section.querySelector('a[href="/albums/4?friend_id=7"]')).toBeTruthy();
  });

  it("shows New arrivals loading before the summary arrives", () => {
    state.friend = null;
    state.hydrated = false;
    state.query = { home: null, isPending: true, error: null };
    renderWithProviders(<HomePage />);
    expect(useHomeQuery).toHaveBeenCalledWith({ friend_id: 0 }, { enabled: false });
    expect(screen.getByTestId("new-arrivals-loading")).toBeTruthy();
  });

  it("fails New arrivals alone: the month card stays", () => {
    state.query = { home: null, isPending: false, error: new Error("HTTP 500") };
    renderWithProviders(<HomePage />);
    expect(screen.getByRole("alert").textContent).toContain("HTTP 500");
    expect(screen.getByTestId("month")).toBeTruthy();
  });
});
