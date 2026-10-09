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
      <Artwork src="https://example.com/missing.jpg" alt="Cover" />
    );
    fireEvent.error(screen.getByRole("img", { name: "Cover" }));
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<Artwork src="https://example.com/good.jpg" alt="Cover" />);

    expect(screen.getByRole("img", { name: "Cover" }).getAttribute("src")).toBe(
      "https://example.com/good.jpg"
    );
  });
});
