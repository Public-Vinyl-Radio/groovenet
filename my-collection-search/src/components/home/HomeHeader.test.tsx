// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { HOME_COUNTS } from "@/stories/fixtures/home";
import HomeHeader, { formatHomeCounts } from "./HomeHeader";

describe("formatHomeCounts", () => {
  it("separates thousands and names each count", () => {
    expect(formatHomeCounts(HOME_COUNTS)).toBe("4,044 tracks · 312 albums · 18 playlists");
  });

  it("keeps a count of one singular", () => {
    expect(formatHomeCounts({ tracks: 1, albums: 1, playlists: 0 })).toBe(
      "1 track · 1 album · 0 playlists",
    );
  });
});

describe("HomeHeader", () => {
  it("titles the page Home with the counts line", () => {
    renderWithProviders(<HomeHeader counts={HOME_COUNTS} onSearch={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(screen.getByTestId("page-header-summary").textContent).toBe(
      "4,044 tracks · 312 albums · 18 playlists",
    );
  });

  it("leaves the counts out until they load", () => {
    renderWithProviders(<HomeHeader counts={null} onSearch={() => {}} />);
    expect(screen.queryByTestId("page-header-summary")).toBeNull();
  });

  it("opens search from the phone icon and the desktop field", async () => {
    const onSearch = vi.fn();
    const { user } = renderWithProviders(<HomeHeader counts={null} onSearch={onSearch} />);
    await user.click(screen.getByRole("button", { name: "Search" }));
    const field = screen.getByRole("button", {
      name: "Search tracks, albums, artists",
      hidden: true,
    });
    expect(field.textContent).toContain("⌘K");
    expect(field.getAttribute("aria-keyshortcuts")).toBe("Meta+K");
    await user.click(field);
    expect(onSearch).toHaveBeenCalledTimes(2);
  });
});
