// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Album } from "@/types/track";
import type { AlbumTaxonomyOverrides } from "@/api-contract/schemas";

const state = vi.hoisted(() => ({ loading: false, error: false }));
const options = [
  { id: "latin", name: "Latin", slug: "latin", parent_id: null, parent_name: null, track_count: 1 },
  {
    id: "cumbia",
    name: "Cumbia",
    slug: "cumbia",
    parent_id: "latin",
    parent_name: "Latin",
    track_count: 1,
  },
  {
    id: "fusion",
    name: "Fusion",
    slug: "fusion",
    parent_id: "jazz",
    parent_name: "Jazz",
    track_count: 0,
  },
];
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({
  useGenreTaxonomyQuery: () => ({
    genres: options,
    isLoading: state.loading,
    isError: state.error,
  }),
  useGenreLookup: () => new Map([["cumbia alias", "cumbia"]]),
}));
vi.mock("@/components/GenrePicker", () => ({
  default: ({
    label,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    value: typeof options;
    onChange: (value: typeof options) => void;
    disabled: boolean;
  }) => (
    <div aria-label={label}>
      <span>{value.map((g) => g.name).join(", ")}</span>
      <button disabled={disabled} onClick={() => onChange([options[2]])}>
        Choose {label}
      </button>
      <button disabled={disabled} onClick={() => onChange([])}>
        Clear {label}
      </button>
    </div>
  ),
}));
import AlbumTaxonomyEditor from "./AlbumTaxonomyEditor";
const album: Album = {
  release_id: "r",
  friend_id: 7,
  title: "Album",
  artist: "Artist",
  track_count: 1,
  genres: ["Latin"],
  styles: ["Cumbia Alias", "Unmapped"],
};
const changed = vi.fn();
function Harness({
  initial = {},
  source = album,
}: {
  initial?: AlbumTaxonomyOverrides;
  source?: Album;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AlbumTaxonomyEditor
      album={source}
      value={value}
      onChange={(next) => {
        setValue(next);
        changed(next);
      }}
    />
  );
}
beforeEach(() => {
  state.loading = false;
  state.error = false;
  changed.mockClear();
});

describe("AlbumTaxonomyEditor", () => {
  it("keeps the raw Discogs source visible, maps names/aliases for picking, and stages replacements and reset", async () => {
    const { user } = renderWithProviders(<Harness />);
    expect(screen.getByText("Discogs styles: Cumbia Alias, Unmapped")).toBeTruthy();
    expect(screen.getAllByText("Using Discogs")).toHaveLength(2);
    expect(screen.getByLabelText("Your styles").textContent).toContain("Cumbia");
    expect(
      (screen.getByRole("button", { name: "Reset styles to Discogs" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Choose Your styles" }));
    expect(changed).toHaveBeenLastCalledWith({ style_override_ids: ["fusion"] });
    expect(screen.getByText("Using your replacement")).toBeTruthy();
    expect(screen.getByText("Discogs styles: Cumbia Alias, Unmapped")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reset styles to Discogs" }));
    expect(changed).toHaveBeenLastCalledWith({ style_override_ids: null });
    await user.click(screen.getByRole("button", { name: "Clear Your genres" }));
    expect(changed).toHaveBeenLastCalledWith({ style_override_ids: null, genre_override_ids: [] });
  });
  it("hydrates existing overrides independently and allows a genre replacement without touching styles", async () => {
    const { user } = renderWithProviders(
      <Harness initial={{ genre_override_ids: [], style_override_ids: ["fusion"] }} />,
    );
    expect(screen.getAllByText("Using your replacement")).toHaveLength(2);
    expect(screen.getByLabelText("Your genres").textContent).not.toContain("Latin");
    await user.click(screen.getByRole("button", { name: "Choose Your genres" }));
    expect(changed).toHaveBeenLastCalledWith({
      genre_override_ids: ["fusion"],
      style_override_ids: ["fusion"],
    });
    await user.click(screen.getByRole("button", { name: "Reset genres to Discogs" }));
    expect(changed).toHaveBeenLastCalledWith({
      genre_override_ids: null,
      style_override_ids: ["fusion"],
    });
  });
  it.each(["loading", "error"] as const)(
    "disables editing while taxonomy is %s, retaining source labels",
    (key) => {
      state[key] = true;
      renderWithProviders(<Harness source={{ ...album, genres: null, styles: undefined }} />);
      expect(screen.getByText("Discogs genres: None")).toBeTruthy();
      expect(screen.getByText("Discogs styles: None")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "Choose Your genres" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    },
  );
});
