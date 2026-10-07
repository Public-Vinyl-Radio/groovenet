// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  friend: { id: 6 } as { id: number } | null,
  taxonomy: { data: undefined, error: null } as { data: unknown; error: Error | null },
  counts: undefined as Map<string, number> | undefined,
  useTrackGenreFacets: vi.fn(),
}));

vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({ useGenreTaxonomyQuery: () => mocks.taxonomy }));
vi.mock("@/hooks/useTrackGenreFacets", () => ({
  useTrackGenreFacets: (params: unknown) => {
    mocks.useTrackGenreFacets(params);
    return { counts: mocks.counts };
  },
}));

import GenresPage from "./page";

const node = (id: string, name: string, children: unknown[] = []) => ({
  id,
  name,
  slug: id,
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children,
});
const tree = [node("rock", "Rock"), node("latin", "Latin", [node("cumbia", "Cumbia"), node("bolero", "Bolero")])];

const rowNames = () =>
  within(screen.getByRole("list", { name: "Genre taxonomy" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("genres page", () => {
  beforeEach(() => {
    mocks.useTrackGenreFacets.mockReset();
    mocks.friend = { id: 6 };
    mocks.taxonomy = { data: tree, error: null };
    mocks.counts = new Map([
      ["latin", 30],
      ["cumbia", 30],
      ["rock", 4],
    ]);
  });

  it("counts genres for the current collection, and waits for one", () => {
    renderWithProviders(<GenresPage />);
    expect(mocks.useTrackGenreFacets).toHaveBeenLastCalledWith({ q: "", filter: "friend_id = 6", enabled: true });

    mocks.friend = null;
    mocks.counts = undefined;
    renderWithProviders(<GenresPage />);
    expect(mocks.useTrackGenreFacets).toHaveBeenLastCalledWith({ q: "", filter: undefined, enabled: false });
    expect(screen.getByTestId("genres-loading")).toBeTruthy();
  });

  it("lists the genres the collection holds, biggest first, each linking to its page", () => {
    renderWithProviders(<GenresPage />);

    expect(rowNames()).toEqual(["Latin", "Cumbia", "Rock"]);
    expect(screen.getByRole("link", { name: "Cumbia" }).getAttribute("href")).toBe("/genres/cumbia");
    expect(screen.getAllByText("30")).toHaveLength(2);
  });

  it("shows empty genres on request", async () => {
    const { user } = renderWithProviders(<GenresPage />);
    await user.click(screen.getByText("Show genres with no tracks"));

    expect(rowNames()).toEqual(["Latin", "Cumbia", "Bolero", "Rock"]);
  });

  it("narrows to matching genres as you type, and says when nothing matches", async () => {
    const { user } = renderWithProviders(<GenresPage />);

    await user.type(screen.getByRole("textbox", { name: "Find a genre" }), "cumb");
    expect(rowNames()).toEqual(["Latin", "Cumbia"]);

    await user.type(screen.getByRole("textbox", { name: "Find a genre" }), "xyz");
    expect(screen.getByText("No genres match.")).toBeTruthy();
  });

  it("explains a taxonomy that fails to load", () => {
    mocks.taxonomy = { data: undefined, error: new Error("offline") };
    renderWithProviders(<GenresPage />);

    expect(screen.getByText("Couldn't load the genre taxonomy: offline")).toBeTruthy();
  });
});
