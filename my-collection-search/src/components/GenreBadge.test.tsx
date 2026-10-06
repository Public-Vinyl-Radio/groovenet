// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import GenreBadge, { GenreBadgeList } from "./GenreBadge";

describe("GenreBadge", () => {
  it("links a taxonomy genre to track search filtered by its slug", () => {
    renderWithProviders(<GenreBadge item={{ label: "Cumbia", slug: "cumbia" }} kind="track" scope="tracks" />);

    const link = screen.getByRole("link", { name: "Search tracks in Cumbia" });
    expect(link.getAttribute("href")).toBe("/?genre=cumbia");
    expect(link.textContent).toBe("Cumbia");
  });

  it("links album badges to album search", () => {
    renderWithProviders(
      <GenreBadge item={{ label: "Latin", slug: "latin" }} kind="discogs-genre" scope="albums" />
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe("/albums?genre=latin");
  });

  it("leaves a value outside the taxonomy as plain text, marked as unreconciled for a track", () => {
    renderWithProviders(
      <>
        <GenreBadge item={{ label: "Feminist Anthem", slug: null }} kind="track" scope="tracks" />
        <GenreBadge item={{ label: "Odd Style", slug: null }} kind="discogs-style" scope="tracks" />
      </>
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Feminist Anthem").getAttribute("title")).toBe("Not in the genre taxonomy yet");
    expect(screen.getByText("Odd Style").getAttribute("title")).toBeNull();
  });

  it("doesn't trigger the row's own click", async () => {
    const onRowClick = vi.fn();
    const { user } = renderWithProviders(
      <div onClick={onRowClick}>
        <GenreBadge item={{ label: "Cumbia", slug: "cumbia" }} kind="track" scope="tracks" />
      </div>
    );

    // jsdom doesn't navigate, so the click only has to stop at the badge.
    await user.click(screen.getByRole("link"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("is reachable by keyboard", async () => {
    const { user } = renderWithProviders(
      <GenreBadge item={{ label: "Cumbia", slug: "cumbia" }} kind="track" scope="tracks" />
    );

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link"));
  });
});

describe("GenreBadgeList", () => {
  it("renders one badge per item", () => {
    renderWithProviders(
      <GenreBadgeList
        items={[
          { label: "Cumbia", slug: "cumbia" },
          { label: "Chicha", slug: null },
        ]}
        kind="track"
        scope="tracks"
      />
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Chicha")).toBeTruthy();
  });
});
