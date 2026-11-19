// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import Breadcrumbs, { currentCrumbIndex, parentCrumb } from "./Breadcrumbs";

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

  it("lets only a long crumb give way, with its full text as a tooltip", () => {
    const long = "Wind, Thunder, Rain, Creaking Trees, Owls, Bat Screeching";
    renderWithProviders(
      <Breadcrumbs
        crumbs={[
          { label: "Tracks", href: "/tracks" },
          { label: long, href: "/tracks/t1" },
          { label: "Edit" },
        ]}
      />,
    );
    const shrink = (el: HTMLElement) => getComputedStyle(el).flexShrink;
    expect(shrink(screen.getByRole("link", { name: long }))).toBe("1");
    expect(screen.getByRole("link", { name: long }).getAttribute("title")).toBe(long);
    expect(shrink(screen.getByRole("link", { name: "Tracks" }))).toBe("0");
    expect(shrink(screen.getByText("Edit"))).toBe("0");
  });

  it("links every crumb when the last one links: a trail of parents only (#1231)", () => {
    renderWithProviders(
      <Breadcrumbs
        crumbs={[
          { label: "Tracks", href: "/tracks" },
          { label: "Blue Lines", href: "/albums/r1" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Blue Lines" }).getAttribute("href")).toBe(
      "/albums/r1",
    );
    expect(document.querySelector("[aria-current]")).toBeNull();
  });
});

describe("currentCrumbIndex and parentCrumb (#1231)", () => {
  const tracks = { label: "Tracks", href: "/tracks" };
  const album = { label: "Blue Lines", href: "/albums/r1" };

  it("finds the current page only in a last crumb without a link", () => {
    expect(currentCrumbIndex([tracks, { label: "Song" }])).toBe(1);
    expect(currentCrumbIndex([tracks, album])).toBe(-1);
    expect(currentCrumbIndex([])).toBe(-1);
  });

  it("returns to the last parent before the current page", () => {
    expect(parentCrumb([tracks, album, { label: "Song" }])).toBe(album);
    expect(parentCrumb([tracks, album])).toBe(album);
    expect(parentCrumb([tracks])).toBe(tracks);
    expect(parentCrumb([{ label: "Genres" }])).toBeUndefined();
  });
});
