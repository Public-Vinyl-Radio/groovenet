// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { SectionHeading } from "./SectionHeading";
import { SectionLabel } from "./SectionLabel";

describe("SectionHeading", () => {
  it("is an h2 by default and an h3 for level 3", () => {
    renderWithProviders(
      <>
        <SectionHeading>Tracklist</SectionHeading>
        <SectionHeading level={3}>Palette</SectionHeading>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Tracklist" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Palette" })).toBeTruthy();
  });

  it("passes id, ref and tabIndex to the heading when it stands alone", () => {
    const ref = React.createRef<HTMLHeadingElement>();
    renderWithProviders(
      <SectionHeading id="crate" ref={ref} tabIndex={-1}>
        Crate
      </SectionHeading>,
    );
    const heading = screen.getByRole("heading", { name: "Crate" });
    expect(heading.id).toBe("crate");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(ref.current).toBe(heading);
  });

  it("keeps meta and actions out of the heading's name", () => {
    renderWithProviders(
      <SectionHeading
        id="t"
        ref={React.createRef()}
        meta="12 tracks"
        actions={<button>Play</button>}
      >
        Tracklist
      </SectionHeading>,
    );
    expect(screen.getByRole("heading", { name: "Tracklist" }).id).toBe("t");
    expect(screen.getByText("12 tracks")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });
});

describe("SectionLabel", () => {
  it("renders a strip with its meta after the heading", () => {
    renderWithProviders(
      <SectionLabel variant="strip" id="s" meta={<span>All →</span>}>
        Playlists
      </SectionLabel>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Playlists" }).id).toBe("s");
    expect(screen.getByText("All →")).toBeTruthy();
  });

  it("renders an overline at the level it is given", () => {
    renderWithProviders(
      <SectionLabel variant="overline" level={3} id="o">
        By week
      </SectionLabel>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "By week" }).id).toBe("o");
  });

  it("renders a bar as one link with a trailing label", () => {
    renderWithProviders(
      <SectionLabel variant="bar" href="/spins/recap/2026-10" meta="Full recap →">
        October so far
      </SectionLabel>,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/spins/recap/2026-10");
    expect(link.textContent).toBe("October so farFull recap →");
    expect(screen.getByRole("heading", { level: 2, name: "October so far" })).toBeTruthy();
  });

  it("renders a bar without a heading when level is null", () => {
    renderWithProviders(
      <SectionLabel variant="bar" level={null} href="/x">
        Recap
      </SectionLabel>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Recap").tagName).toBe("SPAN");
  });

  it("renders a bar with no meta", () => {
    renderWithProviders(
      <SectionLabel variant="bar" level={3} href="/x">
        Recap
      </SectionLabel>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Recap" })).toBeTruthy();
  });

  it("renders a card header row with label, meta and a trailing link", () => {
    renderWithProviders(
      <SectionLabel
        variant="header"
        id="h"
        meta="last 30 days"
        link={{ href: "/albums", label: "All →" }}
      >
        New arrivals
      </SectionLabel>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "New arrivals" }).id).toBe("h");
    expect(screen.getByText("last 30 days")).toBeTruthy();
    expect(screen.getByRole("link", { name: "All →" }).getAttribute("href")).toBe("/albums");
  });

  it("renders a card header row at level 3 with no meta or link", () => {
    renderWithProviders(
      <SectionLabel variant="header" level={3}>
        Build
      </SectionLabel>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Build" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
