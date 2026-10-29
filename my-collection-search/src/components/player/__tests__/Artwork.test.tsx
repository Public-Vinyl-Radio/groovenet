// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import Artwork from "@/components/player/Artwork";

describe("Artwork", () => {
  it("shows an icon placeholder when there is no src", () => {
    renderWithProviders(<Artwork alt="Artwork" />);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the image when a src is given", () => {
    renderWithProviders(<Artwork src="https://example.com/art.jpg" alt="Cover" />);

    const img = screen.getByRole("img", { name: "Cover" });
    expect(img.getAttribute("src")).toBe("https://example.com/art.jpg");
  });

  it("falls back to the icon placeholder when the image fails to load", () => {
    renderWithProviders(<Artwork src="https://example.com/missing.jpg" alt="Cover" />);

    const img = screen.getByRole("img", { name: "Cover" });
    fireEvent.error(img);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("recovers from a prior failure once a new src is provided", () => {
    const { rerender } = renderWithProviders(
      <Artwork src="https://example.com/missing.jpg" alt="Cover" />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Cover" }));
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<Artwork src="https://example.com/good.jpg" alt="Cover" />);

    expect(screen.getByRole("img", { name: "Cover" }).getAttribute("src")).toBe(
      "https://example.com/good.jpg",
    );
  });
});

describe("Artwork — Now playing", () => {
  it("fills its column as a square with the container shadow, image or placeholder", () => {
    const { rerender } = renderWithProviders(
      <Artwork src="https://example.com/art.jpg" alt="Cover" fill shadow />,
    );
    const img = screen.getByRole("img", { name: "Cover" });
    const css = cssOf(img);
    expect(css).toMatch(/width:\s*100%/);
    expect(css).toMatch(/aspect-ratio:\s*1/);
    expect(css).toMatch(/box-shadow:\s*var\(--chakra-shadows-md\)/);

    rerender(<Artwork alt="Cover" fill shadow />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("names the image Artwork when no alt is given", () => {
    renderWithProviders(<Artwork src="https://example.com/art.jpg" />);
    expect(screen.getByRole("img", { name: "Artwork" })).toBeTruthy();
  });

  it("is decorative with an empty alt", () => {
    const { container } = renderWithProviders(<Artwork src="https://example.com/art.jpg" alt="" />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});

function cssOf(el: Element) {
  const classes = [...el.classList];
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => classes.some((c) => text.includes(`.${c}`)))
    .join("\n");
}
