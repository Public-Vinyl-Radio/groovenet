// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import AlbumSearchMenu from "./AlbumSearchMenu";

function setup(activeCount = 0) {
  const onOpenFilters = vi.fn();
  const onOpenArtwork = vi.fn();
  const view = renderWithProviders(
    <AlbumSearchMenu
      activeCount={activeCount}
      onOpenFilters={onOpenFilters}
      onOpenArtwork={onOpenArtwork}
    />,
  );
  return { ...view, onOpenFilters, onOpenArtwork };
}

describe("AlbumSearchMenu (#751)", () => {
  it("has no badge without filters, and offers both entries", async () => {
    const { user, onOpenFilters, onOpenArtwork } = setup();
    const kebab = screen.getByRole("button", { name: "Albums actions" });
    expect(kebab.textContent).toBe("");

    await user.click(kebab);
    await user.click(await screen.findByRole("menuitem", { name: "Filters" }));
    expect(onOpenFilters).toHaveBeenCalledTimes(1);

    await user.click(kebab);
    await user.click(await screen.findByRole("menuitem", { name: "Album artwork review" }));
    expect(onOpenArtwork).toHaveBeenCalledTimes(1);
  });

  it("shows the active count on the kebab and the entry", async () => {
    const { user } = setup(3);
    const kebab = screen.getByRole("button", { name: "Albums actions, 3 filters on" });
    expect(kebab.textContent).toBe("3");
    await user.click(kebab);
    expect(await screen.findByRole("menuitem", { name: "Filters (3)" })).toBeTruthy();
  });
});
