// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  fetchGenreTree: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  usePathname: () => "/albums",
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj" }, isHydrated: true }),
}));
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: mocks.fetchGenreTree }));
// The results list has its own tests; here only the controls matter.
vi.mock("@/components/AlbumSearchResults", () => ({ default: () => null }));

import AlbumsPage from "../page";

/** The phone filter sheet: jsdom renders the phone layout, so it's the one in reach. */
const openFilters = async (user: ReturnType<typeof renderWithProviders>["user"]) => {
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  return screen.findByRole("dialog", { name: "Filters" });
};
const genreNode = (id: string, name: string, parent_id: string | null = null) => ({
  id,
  name,
  slug: name.toLowerCase(),
  parent_id,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children: [],
});

describe("albums page genre filter (#375)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.fetchGenreTree.mockResolvedValue([
      { ...genreNode("latin", "Latin"), children: [genreNode("cumbia", "Cumbia", "latin")] },
      genreNode("jazz", "Jazz"),
    ]);
  });

  it("adds a picked genre to the URL, with no counts", async () => {
    mocks.searchParams = new URLSearchParams("q=blue");
    const { user } = renderWithProviders(<AlbumsPage />);
    await waitFor(() => expect(mocks.fetchGenreTree).toHaveBeenCalled());

    await openFilters(user);
    await user.click(screen.getByRole("combobox", { name: "Filter by genre" }));
    const option = await screen.findByRole("option", { name: /Jazz/ });
    expect(option.textContent).toBe("Jazz");
    await user.click(option);

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?q=blue&genre=jazz");
  });

  it("removes a genre from its chip, and Clear all drops every genre", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&genre=jazz");
    const { user } = renderWithProviders(<AlbumsPage />);

    await user.click(await screen.findByRole("button", { name: /Cumbia/ }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=jazz");

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?");
  });

  it("keeps the genres on a new search", async () => {
    mocks.searchParams = new URLSearchParams("genre=jazz");
    const { user } = renderWithProviders(<AlbumsPage />);

    const input = screen.getAllByRole("textbox", { hidden: true })[0];
    await user.type(input, "blue{Enter}");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/albums?q=blue&genre=jazz"));
  });

});

describe("albums page missing filter (#447)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.fetchGenreTree.mockResolvedValue([]);
  });

  it("turns a check on from the filter sheet, keeping its URL parameter", async () => {
    mocks.searchParams = new URLSearchParams("genre=jazz");
    const { user } = renderWithProviders(<AlbumsPage />);

    const sheet = await openFilters(user);
    const boxes = within(sheet).getAllByRole("checkbox");
    expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual([
      "Library identifier",
      "Local cover",
      "Audio",
    ]);
    await user.click(within(sheet).getByRole("checkbox", { name: "Audio" }));

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=jazz&missing_audio=1");
  });

  it("shows checks from old links as chips, which remove them", async () => {
    mocks.searchParams = new URLSearchParams("missing_library_identifier=1&missing_local_cover_art_url=1");
    const { user } = renderWithProviders(<AlbumsPage />);
    expect(screen.getByRole("button", { name: "Filters, 2 on" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Missing audio/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Missing identifier/ }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?missing_local_cover_art_url=1");
  });

  it("clears every check with Clear all, and keeps them on a new search", async () => {
    mocks.searchParams = new URLSearchParams("missing_audio=1&missing_local_cover_art_url=1");
    const { user } = renderWithProviders(<AlbumsPage />);

    const input = screen.getAllByRole("textbox", { hidden: true })[0];
    await user.type(input, "blue{Enter}");
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/albums?q=blue&missing_local_cover_art_url=1&missing_audio=1"
      )
    );

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?");
  });

  it("clears every filter from the sheet's Clear all", async () => {
    mocks.searchParams = new URLSearchParams("q=blue&missing_audio=1&genre=jazz");
    const { user } = renderWithProviders(<AlbumsPage />);

    const sheet = await openFilters(user);
    await user.click(within(sheet).getByRole("button", { name: "Clear all" }));

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?q=blue");
  });
});
