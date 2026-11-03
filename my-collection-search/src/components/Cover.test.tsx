// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import Cover from "./Cover";
import { innerRadius } from "@/app/corners";

function cssOf(el: Element) {
  const classes = [...el.classList];
  return Array.from(document.styleSheets)
    .flatMap((s) => Array.from(s.cssRules))
    .map((r) => r.cssText)
    .filter((t) => classes.some((c) => t.includes(`.${c}`)))
    .join("\n");
}

describe("Cover", () => {
  it("uses the same placeholder for missing and broken art, keeping overlays", () => {
    const { container, rerender } = renderWithProviders(
      <Cover>
        <span>Overlay</span>
      </Cover>,
    );
    const missing = container.querySelector("[data-cover-placeholder]")!.innerHTML;
    rerender(
      <Cover src="/bad.jpg">
        <span>Overlay</span>
      </Cover>,
    );
    fireEvent.error(screen.getByRole("img", { name: "Artwork" }));
    expect(container.querySelector("[data-cover-placeholder]")!.innerHTML).toBe(missing);
    expect(screen.getByText("Overlay")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("resets after each src change, including returning to a previously broken URL", () => {
    const { rerender } = renderWithProviders(<Cover src="/a.jpg" alt="Cover" />);
    fireEvent.error(screen.getByRole("img"));
    rerender(<Cover src="/b.jpg" alt="Cover" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/b.jpg");
    rerender(<Cover src="/a.jpg" alt="Cover" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/a.jpg");
    rerender(<Cover src={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("owns fixed, responsive and fill sizing and the shared outline", () => {
    const { container, rerender } = renderWithProviders(<Cover data-testid="cover" />);
    let css = cssOf(screen.getByTestId("cover"));
    expect(css).toContain("width: 48px");
    expect(css).toContain("--gn-cover-border-width");
    expect(css).toContain("--gn-cover-border-color");
    expect(css).toContain("var(--gn-radius)");
    rerender(<Cover size={{ base: "40px", md: "72px" }} data-testid="cover" />);
    css = cssOf(screen.getByTestId("cover"));
    expect(css).toContain("40px");
    expect(css).toContain("72px");
    rerender(<Cover fill data-testid="cover" />);
    css = cssOf(screen.getByTestId("cover"));
    expect(css).toContain("width: 100%");
    expect(css).toContain("height: auto");
    expect(css).toContain("aspect-ratio: 1");
    expect(container.querySelector("[data-cover-placeholder]")).toBeTruthy();
  });

  it("supports inverse, stacked, shadow and inset treatment on images and fallbacks", () => {
    const { rerender } = renderWithProviders(<Cover inverse stacked inset data-testid="cover" />);
    let css = cssOf(screen.getByTestId("cover"));
    expect(css).toContain("var(--chakra-colors-bg)");
    expect(css).toContain("var(--chakra-shadows-sm)");
    expect(css).toContain(innerRadius);
    rerender(<Cover src="/a.jpg" shadow stacked data-testid="cover" />);
    css = cssOf(screen.getByTestId("cover"));
    expect(css).toContain("var(--chakra-shadows-md)");
  });

  it("reveals monochrome on hover and keyboard focus with motion-safe transitions", () => {
    renderWithProviders(<Cover src="/a.jpg" data-testid="cover" />);
    const css = cssOf(screen.getByTestId("cover"));
    expect(css).toContain("grayscale(var(--gn-cover-grayscale, 0))");
    expect(css).toMatch(/:hover[^}]*filter:\s*none/);
    expect(css).toMatch(/:focus-within[^}]*filter:\s*none/);
    expect(css).toMatch(/:focus-visible[^}]*filter:\s*none/);
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain("filter 150ms ease");
  });

  it("keeps inspect art contained and playing art in true colour", () => {
    const { rerender } = renderWithProviders(<Cover src="/a.jpg" inspect data-testid="cover" />);
    expect(cssOf(screen.getByRole("img"))).toContain("object-fit: contain");
    expect(cssOf(screen.getByTestId("cover"))).toMatch(/filter:\s*none/);
    rerender(<Cover src="/a.jpg" playing data-testid="cover" />);
    expect(cssOf(screen.getByRole("img"))).toContain("object-fit: cover");
    expect(cssOf(screen.getByTestId("cover"))).not.toContain("grayscale(");
    rerender(<Cover src="/a.jpg" alt="" />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
