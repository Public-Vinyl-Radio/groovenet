// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import GenreLinkList from "./GenreLinkList";

describe("GenreLinkList", () => {
  it("links each genre to its page, with its track count", () => {
    renderWithProviders(
      <GenreLinkList genres={[{ id: "1", name: "Salsa", slug: "salsa", track_count: 1253 }]} />
    );

    const link = screen.getByRole("link", { name: /Salsa/ });
    expect(link.getAttribute("href")).toBe("/genres/salsa");
    expect(link.textContent).toContain((1253).toLocaleString());
  });

  it("says so when there are none, or renders nothing without a message", () => {
    const { container, rerender } = renderWithProviders(<GenreLinkList genres={[]} empty="None yet." />);
    expect(screen.getByText("None yet.")).toBeTruthy();

    rerender(<GenreLinkList genres={[]} />);
    expect(container.textContent).toBe("");
  });
});
