// @vitest-environment jsdom
import React from "react";
import NextLink from "next/link";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { CategoryTag, CountTag, MetaTag, SourceTag, StatusTag } from "./RoleTags";
import { FilterChip, chipLabel } from "./FilterChip";

describe("role tags", () => {
  it("renders each role as a span with its text", () => {
    renderWithProviders(
      <>
        <StatusTag tone="missing">No audio</StatusTag>
        <StatusTag tone="analysis" size="xs">
          No BPM
        </StatusTag>
        <MetaTag variant="id">LP-347-B1</MetaTag>
        <MetaTag variant="raw">/audio/b1.m4a</MetaTag>
        <SourceTag stroke="double">Via API</SourceTag>
        <SourceTag stroke="fill" inverted>
          Vinyl
        </SourceTag>
        <CountTag variant="dot">2</CountTag>
      </>,
    );
    for (const text of ["No audio", "No BPM", "LP-347-B1", "/audio/b1.m4a", "Via API", "Vinyl"]) {
      expect(screen.getByText(text).tagName).toBe("SPAN");
    }
    expect(screen.getByText("2").tagName).toBe("SPAN");
  });

  it("keeps variant props off the DOM", () => {
    renderWithProviders(
      <>
        <StatusTag tone="success">Up</StatusTag>
        <CategoryTag unreconciled>Psych cumbia</CategoryTag>
        <MetaTag variant="id">LP-1</MetaTag>
        <SourceTag stroke="dashed" inverted>
          Via MCP
        </SourceTag>
        <CountTag variant="strong">91</CountTag>
      </>,
    );
    for (const text of ["Up", "Psych cumbia", "LP-1", "Via MCP", "91"]) {
      const el = screen.getByText(text);
      for (const attr of ["tone", "unreconciled", "variant", "stroke", "inverted", "size"]) {
        expect(el.hasAttribute(attr), `${text} ${attr}`).toBe(false);
      }
    }
  });

  it("appends a category's count", () => {
    renderWithProviders(<CategoryTag count={1204}>Latin</CategoryTag>);
    expect(screen.getByText("Latin · 1,204")).toBeTruthy();
  });

  it("renders a linked category as its child, with no count", () => {
    renderWithProviders(
      <CategoryTag asChild count={4} unreconciled>
        <NextLink href="/tracks?genre=cumbia">Cumbia</NextLink>
      </CategoryTag>,
    );
    const link = screen.getByRole("link", { name: "Cumbia" });
    expect(link.getAttribute("href")).toBe("/tracks?genre=cumbia");
    expect(link.textContent).toBe("Cumbia");
  });

  it("passes props through to the element", () => {
    renderWithProviders(
      <StatusTag tone="neutral" title="Sleeve unknown" data-testid="sleeve">
        Sleeve ?
      </StatusTag>,
    );
    expect(screen.getByTestId("sleeve").getAttribute("title")).toBe("Sleeve unknown");
  });
});

describe("FilterChip", () => {
  it("labels an active chip as removing its filter, with the count", async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(
      <FilterChip label="Cumbia" count={41} active onClick={onClick} />,
    );
    const chip = screen.getByRole("button", { name: "Remove filter Cumbia · 41" });
    expect(chip.getAttribute("title")).toBe("Cumbia · 41");
    expect(chip.querySelector("svg")).toBeTruthy();
    await user.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is an unpressed toggle when inactive, with no x", () => {
    renderWithProviders(<FilterChip label="Rated" onClick={() => {}} />);
    const chip = screen.getByRole("button", { name: "Rated" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.querySelector("svg")).toBeNull();
  });

  it("lets the caller name it", () => {
    renderWithProviders(<FilterChip label="Cumbia" active aria-label="Remove genre Cumbia" />);
    expect(screen.getByRole("button", { name: "Remove genre Cumbia" })).toBeTruthy();
  });

  it("builds its label from the count", () => {
    expect(chipLabel({ label: "Has BPM" })).toBe("Has BPM");
    expect(chipLabel({ label: "Missing audio", count: 0 })).toBe("Missing audio · 0");
  });
});
