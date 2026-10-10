// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { GenreTreeNode } from "@/api-contract/schemas";

const fetchGenreTree = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree }));

import GenreFilter, {
  addedGenreChips,
  genreFilterChips,
  genreSlugFromChipKey,
  IncludeSimilarToggle,
  similarGenreIdFromChipKey,
} from "./GenreFilter";

const node = (id: string, name: string, children: GenreTreeNode[] = []): GenreTreeNode => ({
  id,
  name,
  slug: name.toLowerCase(),
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children,
});
const TREE = [node("latin", "Latin", [node("cumbia", "Cumbia"), node("salsa", "Salsa")]), node("jazz", "Jazz")];

describe("GenreFilter", () => {
  beforeEach(() => {
    fetchGenreTree.mockReset().mockResolvedValue(TREE);
  });

  it("offers only genres with matches, with their counts, and hands back the slug", async () => {
    const onAdd = vi.fn();
    const counts = new Map([["latin", 5], ["cumbia", 2]]);
    const { user } = renderWithProviders(<GenreFilter selected={[]} onAdd={onAdd} counts={counts} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());

    await user.click(screen.getByRole("combobox", { name: "Filter by genre" }));
    expect(await screen.findByRole("option", { name: /Latin.*5/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Cumbia.*Latin.*2/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Salsa/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Jazz/ })).toBeNull();

    await user.click(screen.getByRole("option", { name: /Cumbia/ }));
    expect(onAdd).toHaveBeenCalledWith("cumbia");
  });

  it("offers every genre not yet chosen, without counts, when it has none", async () => {
    const { user } = renderWithProviders(<GenreFilter selected={["jazz"]} onAdd={vi.fn()} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());

    await user.type(screen.getByRole("combobox", { name: "Filter by genre" }), "a");
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Cumbia · Latin", "Latin", "Salsa · Latin"]);
  });

  it("says so when the taxonomy can't load", async () => {
    fetchGenreTree.mockRejectedValue(new Error("down"));
    const { user } = renderWithProviders(<GenreFilter selected={[]} onAdd={vi.fn()} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());
    await user.click(screen.getByRole("combobox", { name: "Filter by genre" }));
    expect(await screen.findByText("Couldn't load genres")).toBeTruthy();
  });
});

describe("genre filter chips", () => {
  it("names chips from the taxonomy, falling back to the slug", () => {
    const genres = [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null, track_count: 0 }];
    expect(genreFilterChips(["cumbia", "gone"], genres)).toEqual([
      { key: "genre:cumbia", label: "Cumbia", active: true },
      { key: "genre:gone", label: "gone", active: true },
    ]);
  });

  it("reads a slug only from a genre chip's key", () => {
    expect(genreSlugFromChipKey("genre:salsa")).toBe("salsa");
    expect(genreSlugFromChipKey("missingAudio")).toBeNull();
  });
});

describe("added genre chips (#485)", () => {
  it("names chips from the widened genres, keyed by id", () => {
    const added = [
      { id: "id-porro", name: "Porro", slug: "porro" },
      { id: "id-chicha", name: "Chicha", slug: "chicha" },
    ];
    expect(addedGenreChips(added)).toEqual([
      { key: "similar:id-porro", label: "Porro", active: true },
      { key: "similar:id-chicha", label: "Chicha", active: true },
    ]);
  });

  it("reads a related-genre id only from a similar chip's key", () => {
    expect(similarGenreIdFromChipKey("similar:id-porro")).toBe("id-porro");
    expect(similarGenreIdFromChipKey("genre:cumbia")).toBeNull();
  });
});

describe("IncludeSimilarToggle", () => {
  it("reflects checked and reports a change", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<IncludeSimilarToggle checked={false} onChange={onChange} />);
    const toggle = screen.getByRole("checkbox", { name: "Include similar" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is checked when on", () => {
    renderWithProviders(<IncludeSimilarToggle checked onChange={vi.fn()} />);
    expect(
      (screen.getByRole("checkbox", { name: "Include similar" }) as HTMLInputElement).checked
    ).toBe(true);
  });
});
