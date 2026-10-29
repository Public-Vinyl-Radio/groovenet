// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistsToolbar from "./PlaylistsToolbar";

function setup(viewMode: "cards" | "list" = "cards") {
  const props = {
    query: "",
    onQueryChange: vi.fn(),
    viewMode,
    onViewModeChange: vi.fn(),
    onImport: vi.fn(),
  };
  return { props, ...renderWithProviders(<PlaylistsToolbar {...props} />) };
}

describe("PlaylistsToolbar", () => {
  it("reports typed search text", async () => {
    const { props, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Search playlists" }), "a");
    expect(props.onQueryChange).toHaveBeenCalledWith("a");
  });

  it("marks the active view and switches", async () => {
    const { props, user } = setup("cards");
    expect(
      screen.getByRole("button", { name: "CARDS", hidden: true }).getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "LIST", hidden: true }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("list");
  });

  it("calls onImport", async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole("button", { name: /Import/, hidden: true }));
    expect(props.onImport).toHaveBeenCalled();
  });
});
