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
  onTotalChange,
  onSortChange,
  layout,
}: {
  onAddedGenresChange?: (g: typeof mocks.addedGenres) => void;
  onTotalChange?: (total: number) => void;
  onSortChange?: (sort: string) => void;
  layout?: string;
}) {
  React.useEffect(() => {
    onAddedGenresChange?.(mocks.addedGenres);
  }, [onAddedGenresChange]);
  return (
    <div data-testid="results" data-layout={layout}>
      <button onClick={() => onTotalChange?.(42)}>report total</button>
      <button onClick={() => onSortChange?.("title:asc")}>pick sort</button>
    </div>
  );
}
vi.mock("@/components/AlbumSearchResults", () => ({ default: StubAlbumSearchResults }));

import AlbumsPage from "../page";

/** The phone's Filters modal, from the header kebab (jsdom renders the phone layout). */
const openFilters = async (user: ReturnType<typeof renderWithProviders>["user"]) => {
  await user.click(screen.getByRole("button", { name: /^Albums actions/ }));
  await user.click(await screen.findByRole("menuitem", { name: /^Filters/ }));
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

    const input = screen.getByRole("searchbox", { name: "Search albums" });
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

  it("turns a check on from the filters modal, keeping its URL parameter", async () => {
    mocks.searchParams = new URLSearchParams("genre=jazz");
    const { user } = renderWithProviders(<AlbumsPage />);

    const modal = await openFilters(user);
    expect(within(modal).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual([
      "Include similar",
    ]);
    const chips = within(within(modal).getByRole("group", { name: "Only albums missing" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Library identifier", "Local cover", "Audio"]);
    await user.click(within(modal).getByRole("button", { name: "Audio" }));

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=jazz&missing_audio=1");
  });

  it("shows checks from old links as chips, which remove them", async () => {
    mocks.searchParams = new URLSearchParams("missing_library_identifier=1&missing_local_cover_art_url=1");
    const { user } = renderWithProviders(<AlbumsPage />);
    expect(screen.getByRole("button", { name: "Albums actions, 2 filters on" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Missing audio/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Missing identifier/ }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?missing_local_cover_art_url=1");
  });

  it("clears every check with Clear all, and keeps them on a new search", async () => {
    mocks.searchParams = new URLSearchParams("missing_audio=1&missing_local_cover_art_url=1");
    const { user } = renderWithProviders(<AlbumsPage />);

    const input = screen.getByRole("searchbox", { name: "Search albums" });
    await user.type(input, "blue{Enter}");
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/albums?q=blue&missing_local_cover_art_url=1&missing_audio=1"
      )
    );

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?");
  });

  it("clears every filter from the modal's Reset", async () => {
    mocks.searchParams = new URLSearchParams("q=blue&missing_audio=1&genre=jazz");
    const { user } = renderWithProviders(<AlbumsPage />);

    const modal = await openFilters(user);
    await user.click(within(modal).getByRole("button", { name: "Reset" }));

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
    const { user } = renderWithProviders(<AlbumsPage />);
    expect(screen.getByRole("button", { name: "Remove filter + Similar genres" })).toBeTruthy();
    const modal = await openFilters(user);
    expect((within(modal).getByRole("checkbox", { name: "Include similar" }) as HTMLInputElement).checked).toBe(true);
  });

  it("turns the toggle on and records it in the URL", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia");
    const { user } = renderWithProviders(<AlbumsPage />);

    const modal = await openFilters(user);
    await user.click(within(modal).getByRole("checkbox", { name: "Include similar" }));

    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=cumbia&similar=1");
  });

  it("turns the toggle off and drops it from the URL", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1");
    const { user } = renderWithProviders(<AlbumsPage />);

    // From its chip; the modal's toggle is the same setter.
    await user.click(screen.getByRole("button", { name: "Remove filter + Similar genres" }));

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

  it("opens artwork review from the desktop kebab and the phone kebab", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);

    await user.click(await screen.findByRole("button", { name: "More album options", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Album artwork review", hidden: true }));
    await user.click(screen.getByRole("button", { name: /^Albums actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Album artwork review" }));

    expect(mocks.push).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith("/albums/artwork");
  });
});

describe("albums page view toggle (#730)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.fetchGenreTree.mockResolvedValue([]);
    localStorage.clear();
  });

  it("switches between rows and cards, remembering the choice", async () => {
    const { user, unmount } = renderWithProviders(<AlbumsPage />);
    expect((await screen.findByTestId("results")).getAttribute("data-layout")).toBe("row");
    const grid = () => screen.getByRole("radio", { name: "Grid", hidden: true }) as HTMLInputElement;
    expect((screen.getByRole("radio", { name: "List", hidden: true }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByText("Grid"));
    expect(localStorage.getItem("searchViewMode")).toBe("card");
    expect(grid().checked).toBe(true);
    expect(screen.getByTestId("results").getAttribute("data-layout")).toBe("card");
    unmount();
    renderWithProviders(<AlbumsPage />);
    await waitFor(() => expect(grid().checked).toBe(true));
  });

  it("opens the add form from the phone's icon button", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);
    await user.click(await screen.findByRole("button", { name: "Add album" }));
    expect(mocks.push).toHaveBeenCalledWith("/albums/add");
  });

  it("opens the add form from ADD ALBUM in the desktop page row (#794)", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);
    const row = await screen.findByTestId("page-header-desktop-actions");
    await user.click(within(row).getByRole("button", { name: "Add album", hidden: true }));
    expect(mocks.push).toHaveBeenCalledWith("/albums/add");
  });
});

describe("albums page simplified search (#751)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.fetchGenreTree.mockResolvedValue([]);
  });

  it("shows the reported total on the modal's button, and no count before one", async () => {
    mocks.searchParams = new URLSearchParams("missing_audio=1");
    const { user } = renderWithProviders(<AlbumsPage />);
    await openFilters(user);
    expect(screen.getByRole("button", { name: "Show albums" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show albums" }));

    await user.click(await screen.findByRole("button", { name: "report total" }));
    await openFilters(user);
    expect(await screen.findByRole("button", { name: "Show 42 albums" })).toBeTruthy();
  });

  it("opens the modal without a badge when no filter is on", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);
    const modal = await openFilters(user);
    expect((within(modal).getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sorts through the URL, keeping the search", async () => {
    mocks.searchParams = new URLSearchParams("q=dub");
    const { user } = renderWithProviders(<AlbumsPage />);
    await user.click(await screen.findByRole("button", { name: "pick sort" }));
    expect(mocks.push).toHaveBeenCalledWith("/albums?q=dub&sort=title%3Aasc");
  });

  it("sorts from SORT in the desktop search row", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);
    await user.click(await screen.findByRole("button", { name: "Sort: Recently Added", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Title (A-Z)", hidden: true }));
    expect(mocks.push).toHaveBeenCalledWith("/albums?sort=title%3Aasc");
  });
});

describe("albums page desktop header (#794)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.addedGenres = [];
    mocks.fetchGenreTree.mockResolvedValue([genreNode("jazz", "Jazz")]);
  });

  const openPanel = async (user: ReturnType<typeof renderWithProviders>["user"]) => {
    await user.click(screen.getByRole("button", { name: /^Filters/, hidden: true }));
    return screen.findByRole("dialog", { name: "Filters" });
  };

  it("opens the panel from FILTERS with the count and the album sections", async () => {
    mocks.searchParams = new URLSearchParams("genre=jazz&missing_audio=1");
    const { user } = renderWithProviders(<AlbumsPage />);

    const panel = await openPanel(user);
    expect(screen.getByRole("button", { name: "Filters · 2", hidden: true })).toBeTruthy();
    expect(within(panel).getByText("Albums · 2 active")).toBeTruthy();
    expect(within(panel).getByRole("group", { name: "Only albums missing" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Show albums" })).toBeTruthy();
  });

  it("sets the same filter state as the phone modal", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);

    const panel = await openPanel(user);
    await user.click(within(panel).getByRole("button", { name: "Local cover" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?missing_local_cover_art_url=1");
  });

  it("removes a genre from its tag in the panel", async () => {
    mocks.searchParams = new URLSearchParams("genre=jazz&genre=dub");
    const { user } = renderWithProviders(<AlbumsPage />);

    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Remove genre Jazz" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/albums?genre=dub");
  });

  it("shows the reported total in the chip row once known", async () => {
    const { user } = renderWithProviders(<AlbumsPage />);
    expect(screen.queryByTestId("filter-summary")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "report total" }));
    expect(screen.getByTestId("filter-summary").textContent).toBe("42 albums");
  });
});
