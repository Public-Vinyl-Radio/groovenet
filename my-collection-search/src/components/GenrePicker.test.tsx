// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { GenreTreeNode } from "@/api-contract/schemas";
import type { TrackGenre } from "@/types/track";

const fetchGenreTree = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree }));

import GenrePicker from "./GenrePicker";

const node = (id: string, name: string, parent_id: string | null, children: GenreTreeNode[] = []): GenreTreeNode => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  parent_id,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children,
});

const TREE = [
  node("latin", "Latin", null, [node("cumbia", "Cumbia", "latin"), node("salsa", "Salsa", "latin")]),
];
const CUMBIA: TrackGenre = { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin", parent_name: "Latin" };

/** Holds the selection the way the edit form does, and reports each change. */
function Harness({ initial, onChange }: { initial: TrackGenre[]; onChange: (g: TrackGenre[]) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <GenrePicker
      value={value}
      legacyTags="Psychedelic Cumbia, Uplifting"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("GenrePicker", () => {
  beforeEach(() => {
    fetchGenreTree.mockReset();
    fetchGenreTree.mockResolvedValue(TREE);
  });

  it("shows the chosen genres with their parent, and the original tags as a hint", async () => {
    renderWithProviders(<Harness initial={[CUMBIA]} onChange={vi.fn()} />);

    const selected = screen.getByTestId("genre-picker-selected");
    expect(within(selected).getByText("Cumbia")).toBeTruthy();
    expect(within(selected).getByText(/· Latin/)).toBeTruthy();
    expect(screen.getByText("Original tags: Psychedelic Cumbia, Uplifting")).toBeTruthy();
  });

  it("adds a genre picked from the taxonomy and clears the search", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness initial={[]} onChange={onChange} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());

    const input = screen.getByRole("combobox");
    await user.type(input, "sal");
    await user.click(await screen.findByRole("option", { name: /Salsa/ }));

    expect(onChange).toHaveBeenLastCalledWith([
      { id: "salsa", name: "Salsa", slug: "salsa", parent_id: "latin", parent_name: "Latin" },
    ]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("offers no option for text outside the taxonomy, so nothing new can be added", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness initial={[]} onChange={onChange} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());

    await user.type(screen.getByRole("combobox"), "Feminist Anthem");

    expect(await screen.findByText("No matching genre")).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();

    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not offer a genre that is already chosen", async () => {
    const { user } = renderWithProviders(<Harness initial={[CUMBIA]} onChange={vi.fn()} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());

    await user.type(screen.getByRole("combobox"), "c");

    await waitFor(() => expect(screen.queryByRole("option", { name: /Cumbia/ })).toBeNull());
  });

  it("removes a genre from its chip", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness initial={[CUMBIA]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove Cumbia" }));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByTestId("genre-picker-selected")).toBeNull();
  });

  it("says when the taxonomy could not be loaded", async () => {
    fetchGenreTree.mockRejectedValue(new Error("down"));
    const { user } = renderWithProviders(<Harness initial={[]} onChange={vi.fn()} />);
    await waitFor(() => expect(fetchGenreTree).toHaveBeenCalled());

    await user.type(screen.getByRole("combobox"), "x");

    expect(await screen.findByText("Couldn't load genres")).toBeTruthy();
  });
});
