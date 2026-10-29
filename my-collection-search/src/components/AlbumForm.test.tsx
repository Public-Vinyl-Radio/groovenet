// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import AlbumForm, { type AlbumFormData } from "./AlbumForm";

it("keeps source entry for album creation and replaces it with the taxonomy editor when editing", () => {
  const value: AlbumFormData = {
    title: "Album",
    artist: "Artist",
    year: "",
    genres: ["Jazz"],
    styles: ["Fusion"],
    album_notes: "",
    album_rating: 0,
    purchase_price: "",
    condition: "",
    label: "",
    catalog_number: "",
    country: "",
    format: "",
    library_identifier: "",
  };
  const { rerender } = renderWithProviders(<AlbumForm value={value} onChange={vi.fn()} />);
  expect((screen.getByDisplayValue("Jazz") as HTMLInputElement).value).toBe("Jazz");
  expect((screen.getByDisplayValue("Fusion") as HTMLInputElement).value).toBe("Fusion");
  rerender(
    <AlbumForm value={value} onChange={vi.fn()} taxonomyEditor={<div>Album replacements</div>} />,
  );
  expect(screen.queryByDisplayValue("Jazz")).toBeNull();
  expect(screen.getByText("Album replacements")).toBeTruthy();
});
