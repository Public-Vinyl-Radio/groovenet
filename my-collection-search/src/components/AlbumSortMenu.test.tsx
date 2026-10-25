// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import AlbumSortMenu, { ALBUM_SORT_OPTIONS } from "./AlbumSortMenu";

describe("AlbumSortMenu (#751)", () => {
  it("names the current sort on the label trigger and offers all seven", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<AlbumSortMenu value="title:asc" onChange={onChange} trigger="label" />);
    const trigger = screen.getByRole("button", { name: "Sort: Title (A-Z)" });
    expect(trigger.textContent).toBe("Title (A-Z)");

    await user.click(trigger);
    expect(await screen.findAllByRole("menuitem")).toHaveLength(ALBUM_SORT_OPTIONS.length);
    await user.click(screen.getByRole("menuitem", { name: "Highest Rated" }));
    expect(onChange).toHaveBeenCalledWith("album_rating:desc");
  });

  it("falls back to Recently Added for an unknown sort", () => {
    renderWithProviders(<AlbumSortMenu value="bogus" onChange={vi.fn()} trigger="label" />);
    expect(screen.getByRole("button", { name: "Sort: Recently Added" })).toBeTruthy();
  });

  it("is an icon button on desktop", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<AlbumSortMenu value="created_at:desc" onChange={onChange} trigger="icon" />);
    await user.click(screen.getByRole("button", { name: "Sort" }));
    await user.click(await screen.findByRole("menuitem", { name: "Oldest Releases" }));
    expect(onChange).toHaveBeenCalledWith("year:asc");
  });
});
