// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { HOME_ARRIVALS, HOME_COUNTS, HOME_PLAYLISTS } from "@/stories/fixtures/home";

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  friend: { id: 7 } as { id: number } | null,
  hydrated: true,
  emptiness: "ready" as "loading" | "empty" | "ready",
}));

vi.mock("@/hooks/useHomeQuery", () => ({ useHomeQuery: vi.fn(() => state.query) }));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: state.friend, isHydrated: state.hydrated }),
}));
vi.mock("@/providers/CommandPaletteProvider", () => ({
  useCommandPalette: () => ({ setPaletteOpen: vi.fn() }),
  useOptionalCommandPalette: () => null,
}));
vi.mock("@/hooks/useLibraryEmpty", () => ({ useLibraryEmpty: () => state.emptiness }));
vi.mock("@/components/onboarding/EmptyLibrary", () => ({
  default: () => <div data-testid="empty-library">empty library</div>,
}));
vi.mock("@/components/onboarding/FirstImportChecklist", () => ({
  default: () => <div data-testid="checklist">checklist</div>,
}));
vi.mock("./HomeNowPlaying", () => ({ default: () => null }));
vi.mock("./MonthCard", () => ({ default: () => <div data-testid="month" /> }));

import HomePage from "./HomePage";
import { useHomeQuery } from "@/hooks/useHomeQuery";

describe("HomePage", () => {
  beforeEach(() => {
    state.friend = { id: 7 };
    state.hydrated = true;
    state.emptiness = "ready";
    vi.mocked(useHomeQuery).mockClear();
  });

  it("shows the empty state instead of placeholders, dashes and zero stats for an empty library (#1246)", () => {
    state.friend = null;
    state.emptiness = "empty";
    state.query = { home: null, isPending: true, error: null };
    renderWithProviders(<HomePage />);
    expect(screen.getByTestId("empty-library")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(screen.queryByTestId("new-arrivals-loading")).toBeNull();
    expect(screen.queryByRole("region", { name: "NEW ARRIVALS" })).toBeNull();
    expect(screen.queryByText(/Loading needs attention/)).toBeNull();
    expect(useHomeQuery).toHaveBeenCalledWith({ friend_id: 0 }, { enabled: false });
  });

  it("stops the summary request for a library that exists but holds nothing", () => {
    state.emptiness = "empty";
    state.query = { home: null, isPending: true, error: null };
    renderWithProviders(<HomePage />);
    expect(useHomeQuery).toHaveBeenCalledWith({ friend_id: 7 }, { enabled: false });
  });

  it("keeps its placeholders, not the empty state, while the library is loading", () => {
    state.friend = null;
    state.hydrated = false;
    state.emptiness = "loading";
    state.query = { home: null, isPending: true, error: null };
    renderWithProviders(<HomePage />);
    expect(screen.queryByTestId("empty-library")).toBeNull();
    expect(screen.getByTestId("new-arrivals-loading")).toBeTruthy();
  });

  it("offers the first-import checklist above the sections of a filled library", () => {
    state.query = {
      home: { counts: HOME_COUNTS, new_arrivals: HOME_ARRIVALS },
      isPending: false,
      error: null,
    };
    renderWithProviders(<HomePage />);
    expect(screen.getByTestId("checklist")).toBeTruthy();
    expect(screen.queryByTestId("empty-library")).toBeNull();
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

  it("keeps the month card when summary sections fail", () => {
    state.query = { home: null, isPending: false, error: new Error("HTTP 500") };
    renderWithProviders(<HomePage />);
    expect(
      within(screen.getByRole("region", { name: "NEW ARRIVALS" })).getByRole("alert").textContent,
    ).toContain("HTTP 500");
    expect(
      within(screen.getByRole("region", { name: "NEEDS ATTENTION" })).getByRole("alert")
        .textContent,
    ).toContain("HTTP 500");
    expect(
      within(screen.getByRole("region", { name: "PLAYLISTS & SETS" })).getByRole("alert")
        .textContent,
    ).toContain("HTTP 500");
    expect(screen.getByTestId("month")).toBeTruthy();
  });

  it("gives Playlists & sets its slice of the summary", () => {
    state.query = {
      home: { counts: HOME_COUNTS, new_arrivals: HOME_ARRIVALS, playlists: HOME_PLAYLISTS },
      isPending: false,
      error: null,
    };
    renderWithProviders(<HomePage />);
    const section = screen.getByRole("region", { name: "PLAYLISTS & SETS" });
    expect(section.querySelector('a[href="/playlists/42"]')?.textContent).toContain(
      "DRAFT SET · CLUB ATLÉTICO",
    );
  });
});
