// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import Breadcrumbs from "./Breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders a single crumb as the current page", () => {
    renderWithProviders(<Breadcrumbs crumbs={[{ label: "Genres" }]} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByText("Genres").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links parents and leaves the last crumb as text", () => {
    renderWithProviders(
      <Breadcrumbs crumbs={[{ label: "Tracks", href: "/tracks" }, { label: "Song" }]} />,
    );
    expect(screen.getByRole("link", { name: "Tracks" }).getAttribute("href")).toBe("/tracks");
    expect(screen.getByText("Song").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "Song" })).toBeNull();
  });

  it("handles three or more crumbs, with a parent that has no href", () => {
    renderWithProviders(
      <Breadcrumbs
        crumbs={[
          { label: "Tracks", href: "/tracks" },
          { label: "Blue Lines", href: "/albums/r1" },
          { label: "Unlinked" },
          { label: "Song" },
        ]}
      />,
    );
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Tracks", "Blue Lines"]);
    expect(screen.getByText("Unlinked").getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("Song").getAttribute("aria-current")).toBe("page");
  });
});
