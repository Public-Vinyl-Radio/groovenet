// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const user = vi.hoisted(() => ({ value: { friend: { id: 7 }, isHydrated: true } as { friend: { id: number } | null; isHydrated: boolean } }));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => user.value }));
const query = { spins: [], topTracks: [], isLoading: false };
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinsQuery: () => query,
  useSpinTopTracksQuery: () => query,
}));

import SpinsPage from "./page";

beforeEach(() => {
  user.value = { friend: { id: 7 }, isHydrated: true };
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
