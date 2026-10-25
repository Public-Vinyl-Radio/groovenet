// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/providers/PlaylistsProvider", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/PlaylistManager", () => ({ default: () => <div>manager</div> }));

import PlaylistsPage from "./page";

describe("PlaylistsPage", () => {
  it("renders the playlist manager", () => {
    renderWithProviders(<PlaylistsPage />);
    expect(screen.getByText("manager")).toBeTruthy();
  });
});
