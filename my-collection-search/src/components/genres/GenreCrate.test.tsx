// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { GenreBarRows, GenreCrate, GenreIndexCrate } from "./GenreCrate";
const genre = { id: "s", name: "Salsa", slug: "salsa", track_count: 12 };
describe("shared genre crates", () => {
  it("links and scales actual counts, wraps long labels, and handles zero counts", () => {
    renderWithProviders(<GenreCrate title="Related genres" genres={[genre, { ...genre, id: "l", slug: "long / name", name: "Long ".repeat(40), track_count: 0 }]} />);
    expect(screen.getByRole("link", { name: "Salsa 12" }).getAttribute("href")).toBe("/genres/salsa");
    expect(screen.getByRole("link", { name: /Long/ }).getAttribute("href")).toBe("/genres/long%20%2F%20name");
  });
  it("supports empty bars and linked crate headers without a count", () => {
    renderWithProviders(<GenreCrate title="Empty" href="/genres/empty" genres={[]} />);
    expect(screen.getByRole("link", { name: "Empty" })).toBeTruthy();
    expect(screen.getByText("No related genres in the collection yet.")).toBeTruthy();
  });
  it("keeps the index's top-five preview and full-crate action", async () => {
    const onOpen = vi.fn();
    const node = (id: string) => ({ id, name: id, slug: id, parent_id: null, source: "discogs" as const, track_count: 1, album_count: 1, children: [] });
    const children = Array.from({ length: 7 }, (_, i) => ({ node: node(`child-${i}`), count: i + 1, children: [] }));
    const { user } = renderWithProviders(<GenreIndexCrate entry={{ node: node("Latin"), count: 50, children }} onOpen={onOpen} />);
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Latin 50" }).getAttribute("href")).toBe("/genres/Latin");
    await user.click(screen.getByRole("button", { name: /All latin subgenres/ })); expect(onOpen).toHaveBeenCalledOnce();
  });
  it("keeps the index's empty-crate wording", () => {
    renderWithProviders(<GenreBarRows genres={[]} empty="No subgenres with tracks yet." />);
    expect(screen.getByText("No subgenres with tracks yet.")).toBeTruthy();
  });
});
