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
  addedGenres: [] as { id: string; name: string; slug: string }[],
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
// The results list has its own tests; here only the controls matter. It still
// reports added_genres (#485) up, the way the real component does.
function StubAlbumSearchResults({
  onAddedGenresChange,
}: {
  onAddedGenresChange?: (g: typeof mocks.addedGenres) => void;
}) {
  React.useEffect(() => {
    onAddedGenresChange?.(mocks.addedGenres);
  }, [onAddedGenresChange]);
  return null;
}
vi.mock("@/components/AlbumSearchResults", () => ({ default: StubAlbumSearchResults }));

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
      "Include similar",
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

describe("albums page include_similar (#485)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.addedGenres = [];
    mocks.fetchGenreTree.mockResolvedValue([]);
  });

  it("hides the toggle without an active genre", () => {
    renderWithProviders(<AlbumsPage />);
    expect(screen.queryByRole("checkbox", { name: "Include similar", hidden: true })).toBeNull();
  });

  it("reads similar=1 from the URL and shows the toggle checked", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1");
    renderWithProviders(<AlbumsPage />);
    expect(
      (screen.getAllByRole("checkbox", { name: "Include similar", hidden: true })[0] as HTMLInputElement)
        .checked
    ).toBe(true);
  });

  it("turns the toggle on and records it in the URL", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia");
    const { user } = renderWithProviders(<AlbumsPage />);

    await user.click(screen.getAllByRole("checkbox", { name: "Include similar", hidden: true })[0]);

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=cumbia&similar=1");
  });

  it("turns the toggle off and drops it from the URL", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1");
    const { user } = renderWithProviders(<AlbumsPage />);

    await user.click(screen.getAllByRole("checkbox", { name: "Include similar", hidden: true })[0]);

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=cumbia");
  });

  it("names the genres include_similar added as removable chips, excluding them on removal", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1");
    mocks.addedGenres = [{ id: "id-porro", name: "Porro", slug: "porro" }];
    const { user } = renderWithProviders(<AlbumsPage />);

    const chip = await screen.findByRole("button", { name: /Porro/ });
    await user.click(chip);

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=cumbia&similar=1&similar_exclude=id-porro");
  });

  it("clears the toggle and exclusions from Clear all", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1&similar_exclude=id-porro");
    const { user } = renderWithProviders(<AlbumsPage />);

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?");
  });
});

describe("albums page artwork review link (#494)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.fetchGenreTree.mockResolvedValue([]);
  });

  it("opens artwork review from the phone and desktop controls", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);

    const links = await screen.findAllByRole("button", { name: "Album artwork review", hidden: true });
    expect(links).toHaveLength(2);
    for (const link of links) await user.click(link);

    expect(mocks.push).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith("/albums/artwork");
  });
});
