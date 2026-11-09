// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  palette: null as null | { setPaletteOpen: (v: boolean) => void; scope?: { id: string } },
  track: vi.fn(),
}));
vi.mock("@/providers/CommandPaletteProvider", () => ({
  useOptionalCommandPalette: () => mocks.palette,
}));
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: mocks.track } }));

import PaletteSearchButton from "./PaletteSearchButton";

describe("PaletteSearchButton (#1145)", () => {
  it("renders nothing without a palette provider", () => {
    mocks.palette = null;
    renderWithProviders(<PaletteSearchButton />);
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
  });

  it("opens the palette and reports the page's scope", async () => {
    const setPaletteOpen = vi.fn();
    mocks.palette = { setPaletteOpen, scope: { id: "albums" } };
    const { user } = renderWithProviders(<PaletteSearchButton />);
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(setPaletteOpen).toHaveBeenCalledWith(true);
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      command: "open_from_header",
      scope: "albums",
    });
  });

  it("reports the global scope when the page registered none", async () => {
    mocks.palette = { setPaletteOpen: vi.fn() };
    const { user } = renderWithProviders(<PaletteSearchButton />);
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(mocks.track).toHaveBeenLastCalledWith("command_palette_used", {
      command: "open_from_header",
      scope: "global",
    });
  });
});
