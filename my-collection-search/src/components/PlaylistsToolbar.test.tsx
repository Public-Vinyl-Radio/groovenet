// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistsToolbar, { PlaylistImportButton, PlaylistsPhoneMenu } from "./PlaylistsToolbar";

describe("PlaylistsToolbar", () => {
  it("is the shared search field, and reports typed text", async () => {
    const onQueryChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistsToolbar query="" onQueryChange={onQueryChange} />,
    );
    expect(screen.getByTestId("search-field")).toBeTruthy();
    expect(screen.getByTestId("list-search-row")).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: "Search playlists" }), "a");
    expect(onQueryChange).toHaveBeenCalledWith("a");
  });
});

describe("PlaylistImportButton", () => {
  it("calls onImport", async () => {
    const onImport = vi.fn();
    const { user } = renderWithProviders(<PlaylistImportButton onImport={onImport} />);
    await user.click(screen.getByRole("button", { name: "Import playlist" }));
    expect(onImport).toHaveBeenCalledOnce();
  });
});

describe("PlaylistsPhoneMenu", () => {
  it("checks the current view and reports a change", async () => {
    const onViewModeChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistsPhoneMenu
        viewMode="cards"
        onViewModeChange={onViewModeChange}
        onImport={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Playlists actions" }));
    expect(
      (await screen.findByRole("menuitemradio", { name: "Grid" })).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "List" }));
    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });

  it("calls onImport", async () => {
    const onImport = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistsPhoneMenu viewMode="list" onViewModeChange={vi.fn()} onImport={onImport} />,
    );
    await user.click(screen.getByRole("button", { name: "Playlists actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Import playlist" }));
    expect(onImport).toHaveBeenCalledOnce();
  });
});
