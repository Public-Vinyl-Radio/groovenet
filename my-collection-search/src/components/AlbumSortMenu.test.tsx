// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import AlbumSortMenu, { ALBUM_SORT_OPTIONS, albumSortOption } from "./AlbumSortMenu";

describe("AlbumSortMenu (#751)", () => {
  it("labels the options in sentence case", () => {
    expect(ALBUM_SORT_OPTIONS.map((o) => o.label)).toEqual([
      "Recently added",
      "Newest in Discogs",
      "Oldest in Discogs",
      "Newest releases",
      "Oldest releases",
      "Title A–Z",
      "Highest rated",
    ]);
  });

  it("falls back to the default option for an unknown sort", () => {
    expect(albumSortOption("bogus").label).toBe("Recently added");
    expect(albumSortOption("year:asc").label).toBe("Oldest releases");
  });

  it("is a labelled SORT button in the desktop search row (#794)", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <AlbumSortMenu value="created_at:desc" onChange={onChange} />,
    );
    const trigger = screen.getByRole("button", { name: "Sort: Recently added" });
    expect(trigger.textContent).toBe("SortRecently added");
    await user.click(trigger);
    expect(await screen.findAllByRole("menuitem")).toHaveLength(ALBUM_SORT_OPTIONS.length);
    await user.click(screen.getByRole("menuitem", { name: "Oldest releases" }));
    expect(onChange).toHaveBeenCalledWith("year:asc");
  });
});
