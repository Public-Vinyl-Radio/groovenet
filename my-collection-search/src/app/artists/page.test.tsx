// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  pathname: "/artists" as string | null,
  user: { friend: { id: 6 }, isHydrated: true } as {
    friend: { id: number } | null;
    isHydrated: boolean;
  },
  listArtists: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => mocks.user }));
vi.mock("@/services/internalApi/artists", () => ({ listArtists: mocks.listArtists }));

import ArtistsPage from "./page";

const artist = (id: number, name: string, sortName = name, counts = [1, 0]) => ({
  id,
  name,
  sort_name: sortName,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  discogs_artist_id: null,
  is_placeholder: false,
  album_count: counts[0],
  track_count: counts[1],
});
const page = (items: ReturnType<typeof artist>[], total = items.length, offset = 0) => ({
  items,
  total,
  limit: 100,
  offset,
  query: "",
});

describe("ArtistsPage (#709)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.pathname = "/artists";
    mocks.user = { friend: { id: 6 }, isHydrated: true };
    mocks.listArtists.mockResolvedValue(
      page([artist(1, "The Strokes", "Strokes, The", [3, 12]), artist(2, "Los Mirlos")]),
    );
  });

  it("lists this collection's artists with their sort names, counts and pages", async () => {
    renderWithProviders(<ArtistsPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Artists/ })).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Artists" });
    const strokes = within(list).getByRole("link", { name: /The Strokes/ });
    expect(strokes.getAttribute("href")).toBe("/artists/the-strokes");
    expect(within(strokes).getByText("Strokes, The")).toBeTruthy();
    expect(within(strokes).getByText("3 albums · 12 tracks")).toBeTruthy();
    // No sort name line when it's the name itself.
    expect(within(list).getByRole("link", { name: /Los Mirlos/ }).textContent).toBe(
      "Los Mirlos1 album",
    );
    expect(screen.getByText("2 artists")).toBeTruthy();
    expect(mocks.listArtists).toHaveBeenCalledWith({
      q: "",
      letter: undefined,
      friend_id: 6,
      limit: 100,
      offset: 0,
    });
  });

  it("reads the letter and words from the URL, ignoring a letter it doesn't know", async () => {
    mocks.searchParams = new URLSearchParams("letter=s&q=stro");
    const { unmount } = renderWithProviders(<ArtistsPage />);
    await screen.findByRole("list", { name: "Artists" });
    expect(mocks.listArtists).toHaveBeenCalledWith(
      expect.objectContaining({ q: "stro", letter: "S" }),
    );
    expect(screen.getByRole("button", { name: "S" }).getAttribute("aria-pressed")).toBe("true");
    unmount();

    mocks.searchParams = new URLSearchParams("letter=zz");
    renderWithProviders(<ArtistsPage />);
    await screen.findByRole("list", { name: "Artists" });
    expect(mocks.listArtists).toHaveBeenLastCalledWith(
      expect.objectContaining({ letter: undefined }),
    );
    expect(screen.getByRole("button", { name: "All artists" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("picks a letter, the rest, or all of them through the URL, keeping the words", async () => {
    mocks.searchParams = new URLSearchParams("q=los&letter=M");
    const { user } = renderWithProviders(<ArtistsPage />);
    await user.click(screen.getByRole("button", { name: "Other characters" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/artists?q=los&letter=%23");
    await user.click(screen.getByRole("button", { name: "All artists" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/artists?q=los");
  });

  it("searches once typing pauses, and at once on Enter", async () => {
    const { user } = renderWithProviders(<ArtistsPage />);
    const field = screen.getByRole("searchbox", { name: "Search artists" });
    await user.type(field, "mir");
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/artists?q=mir"));

    mocks.replace.mockClear();
    await user.clear(field);
    await user.type(field, " x {Enter}");
    expect(mocks.replace).toHaveBeenCalledWith("/artists?q=x");
  });

  it("drops the words from the URL when the field is emptied", async () => {
    mocks.searchParams = new URLSearchParams("q=mir");
    mocks.pathname = null;
    const { user } = renderWithProviders(<ArtistsPage />);
    await user.clear(screen.getByRole("searchbox", { name: "Search artists" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/artists"));
  });

  it("loads the next page on Show more", async () => {
    mocks.listArtists
      .mockResolvedValueOnce(page([artist(1, "A1")], 2))
      .mockResolvedValueOnce(page([artist(2, "A2")], 2, 1));
    const { user } = renderWithProviders(<ArtistsPage />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: /A2/ })).toBeTruthy();
    expect(mocks.listArtists).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("says when nothing matches, when the collection is empty, and when it can't load", async () => {
    mocks.listArtists.mockResolvedValue(page([]));
    mocks.searchParams = new URLSearchParams("q=zz");
    const first = renderWithProviders(<ArtistsPage />);
    expect(await screen.findByText("No artists match.")).toBeTruthy();
    expect(screen.getByText("0 artists")).toBeTruthy();
    first.unmount();

    mocks.searchParams = new URLSearchParams();
    const second = renderWithProviders(<ArtistsPage />);
    expect(await screen.findByText("No artists in this collection yet.")).toBeTruthy();
    second.unmount();

    mocks.listArtists.mockRejectedValue(new Error("down"));
    renderWithProviders(<ArtistsPage />);
    expect(await screen.findByText("Couldn't load artists.")).toBeTruthy();
  });

  it("shows a skeleton until the friend is known, without asking", () => {
    mocks.user = { friend: null, isHydrated: false };
    renderWithProviders(<ArtistsPage />);
    expect(screen.getByTestId("artists-loading")).toBeTruthy();
    expect(mocks.listArtists).not.toHaveBeenCalled();
  });
});
