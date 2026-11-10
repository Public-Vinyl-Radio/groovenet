// @vitest-environment jsdom
import React from "react";
import { CommandPaletteProvider } from "@/providers/CommandPaletteProvider";
import { PaletteScopeControls } from "@/test/PaletteScopeControls";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  pathname: "/artists" as string | null,
  user: { friend: { id: 6 }, isHydrated: true } as {
    friend: { id: number } | null;
    isHydrated: boolean;
  },
  listArtists: vi.fn(),
  fetchArtistLetters: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => mocks.user }));
vi.mock("@/services/internalApi/artists", () => ({
  listArtists: mocks.listArtists,
  fetchArtistLetters: mocks.fetchArtistLetters,
}));
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

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
  limit: 200,
  offset,
  query: "",
});

/** The desktop row, once the viewport query has answered. */
const desktopNav = async () => {
  await waitFor(() => expect(screen.queryByTestId("artist-jump-strip")).toBeNull());
  return screen.getByRole("navigation", { name: "Jump to letter" });
};

const letters = (...pairs: [string, number][]) => ({
  letters: pairs.map(([letter, count]) => ({ letter, count })),
  total: pairs.reduce((n, [, count]) => n + count, 0),
});

describe("ArtistsPage (#709, #1116)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewportWidth(1280);
    window.history.replaceState(null, "", "/artists");
    mocks.searchParams = new URLSearchParams();
    mocks.pathname = "/artists";
    mocks.user = { friend: { id: 6 }, isHydrated: true };
    mocks.listArtists.mockResolvedValue(
      page([
        artist(1, "Álvarez", "Álvarez"),
        artist(2, "The Strokes", "Strokes, The", [3, 12]),
        artist(3, "Los Mirlos", "Mirlos, Los"),
        artist(4, "Zed", "Zed"),
        artist(5, "808 State", "808 State"),
      ]),
    );
    mocks.fetchArtistLetters.mockResolvedValue(
      letters(["A", 1], ["M", 1], ["S", 1], ["Z", 1], ["#", 1]),
    );
  });

  it("runs the registered artist search", async () => {
    const { user } = renderWithProviders(
      <CommandPaletteProvider>
        <ArtistsPage />
        <PaletteScopeControls />
      </CommandPaletteProvider>,
    );
    await user.click(screen.getByText("Run scoped search"));
    expect(mocks.replace).toHaveBeenCalledWith("/artists?q=dusty");
  });

  it("groups every artist under sticky letter headers, accents folded and # last", async () => {
    renderWithProviders(<ArtistsPage />);
    await screen.findByRole("heading", { level: 2, name: "A · 1" });
    expect(screen.getByRole("heading", { level: 1, name: /Artists/ })).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["A · 1", "M · 1", "S · 1", "Z · 1", "# · 1"]);
    const a = screen.getByRole("list", { name: "Artists under A" });
    expect(within(a).getByRole("link", { name: /Álvarez/ })).toBeTruthy();
    const s = screen.getByRole("list", { name: "Artists under S" });
    const strokes = within(s).getByRole("link", { name: /The Strokes/ });
    expect(strokes.getAttribute("href")).toBe("/artists/the-strokes");
    expect(within(strokes).getByText("Strokes, The")).toBeTruthy();
    expect(within(strokes).getByText("3 albums · 12 tracks")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Artists under #" })).getByText("808 State"),
    ).toBeTruthy();
    expect(screen.getByText("5 artists")).toBeTruthy();
    expect(mocks.listArtists).toHaveBeenCalledWith({
      q: "",
      letter: undefined,
      friend_id: 6,
      limit: 200,
      offset: 0,
    });
    expect(mocks.fetchArtistLetters).toHaveBeenCalledWith(6);
  });

  it("loads the rest of the list so every section exists", async () => {
    mocks.listArtists
      .mockResolvedValueOnce(page([artist(1, "A1")], 2))
      .mockResolvedValueOnce(page([artist(2, "B1")], 2, 1));
    mocks.fetchArtistLetters.mockResolvedValue(letters(["A", 1], ["B", 1]));
    renderWithProviders(<ArtistsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "B · 1" })).toBeTruthy();
    expect(mocks.listArtists).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("enables only the letters that have artists, and jumps to a section on click", async () => {
    const { user } = renderWithProviders(<ArtistsPage />);
    await screen.findByRole("navigation", { name: "Jump to letter" });
    const nav = await desktopNav();
    const b = within(nav).getByRole("button", { name: "B" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.tabIndex).toBe(-1);
    await user.click(b);
    expect(scrollIntoView).not.toHaveBeenCalled();

    const m = within(nav).getByRole("button", { name: "M" });
    expect(m.getAttribute("aria-disabled")).toBe("false");
    await user.click(m);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "M · 1" }));
    expect(window.location.hash).toBe("#M");
    await user.click(within(nav).getByRole("button", { name: "Other characters" }));
    expect(window.location.hash).toBe("#%23");
  });

  it("falls back to the loaded letters when the counts fail", async () => {
    mocks.fetchArtistLetters.mockRejectedValue(new Error("down"));
    renderWithProviders(<ArtistsPage />);
    await screen.findByRole("navigation", { name: "Jump to letter" });
    const nav = await desktopNav();
    expect(within(nav).getByRole("button", { name: "S" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(within(nav).getByRole("button", { name: "B" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("highlights the section in view as the page scrolls", async () => {
    const tops: Record<string, number> = { A: 40, M: 300, S: 600, Z: 900, "#": 1200 };
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const letter = this.querySelector("h2")?.textContent?.[0];
      return { top: letter ? tops[letter] : 0 } as DOMRect;
    });
    renderWithProviders(<ArtistsPage />);
    await screen.findByRole("navigation", { name: "Jump to letter" });
    const nav = await desktopNav();
    const current = () =>
      within(nav)
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-current") === "location")
        .map((b) => b.getAttribute("aria-label"));
    await waitFor(() => expect(current()).toEqual(["A"]));

    // Scrolled so S's header has reached the top.
    for (const letter of Object.keys(tops)) tops[letter] -= 600;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => expect(current()).toEqual(["S"]));
    spy.mockRestore();
  });

  it("scrolls to the section in the URL hash, and on a later hash change", async () => {
    window.history.replaceState(null, "", "/artists#S");
    renderWithProviders(<ArtistsPage />);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "S · 1" }));

    window.history.replaceState(null, "", "/artists#%23");
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "# · 1" }));
  });

  it("ignores a hash that isn't an index letter", async () => {
    window.history.replaceState(null, "", "/artists#nope");
    renderWithProviders(<ArtistsPage />);
    await screen.findByRole("heading", { level: 2, name: "A · 1" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("treats an old ?letter= link as a jump, moving it to the hash", async () => {
    mocks.searchParams = new URLSearchParams("letter=m");
    renderWithProviders(<ArtistsPage />);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/artists#M");
    expect(mocks.listArtists).toHaveBeenCalledWith(expect.objectContaining({ letter: undefined }));
  });

  it("keeps the words when moving an old letter link to the hash", async () => {
    mocks.searchParams = new URLSearchParams("letter=%23&q=zz");
    renderWithProviders(<ArtistsPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/artists?q=zz#%23"));
  });

  it("drops a pending jump to a letter the collection doesn't have", async () => {
    window.history.replaceState(null, "", "/artists#B");
    renderWithProviders(<ArtistsPage />);
    await screen.findByRole("heading", { level: 2, name: "A · 1" });
    await waitFor(() => expect(mocks.listArtists).toHaveBeenCalled());
    expect(scrollIntoView).not.toHaveBeenCalled();
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

  it("shows flat ranked results with no index or headers while searching", async () => {
    mocks.searchParams = new URLSearchParams("q=los");
    mocks.listArtists.mockResolvedValue(
      page([artist(3, "Los Mirlos", "Mirlos, Los"), artist(1, "Álvarez")], 2),
    );
    renderWithProviders(<ArtistsPage />);
    const list = await screen.findByRole("list", { name: "Artists" });
    expect(
      within(list)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Los MirlosMirlos, Los1 album", "Álvarez1 album"]);
    expect(screen.queryByRole("navigation", { name: "Jump to letter" })).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(mocks.listArtists).toHaveBeenCalledWith(
      expect.objectContaining({ q: "los", limit: 100 }),
    );
    expect(mocks.fetchArtistLetters).not.toHaveBeenCalled();
  });

  it("drops the words from the URL when the field is emptied", async () => {
    mocks.searchParams = new URLSearchParams("q=mir");
    mocks.pathname = null;
    const { user } = renderWithProviders(<ArtistsPage />);
    await user.clear(screen.getByRole("searchbox", { name: "Search artists" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/artists"));
  });

  it("loads the next page of search results on Show more", async () => {
    mocks.searchParams = new URLSearchParams("q=a");
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
    mocks.fetchArtistLetters.mockResolvedValue(letters());
    mocks.searchParams = new URLSearchParams("q=zz");
    const first = renderWithProviders(<ArtistsPage />);
    expect(await screen.findByText("No artists match.")).toBeTruthy();
    expect(screen.getByText("0 artists")).toBeTruthy();
    first.unmount();

    mocks.searchParams = new URLSearchParams();
    const second = renderWithProviders(<ArtistsPage />);
    expect(await screen.findByText("No artists in this collection yet.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Jump to letter" })).toBeNull();
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
    expect(mocks.fetchArtistLetters).not.toHaveBeenCalled();
  });

  describe("on a phone", () => {
    beforeEach(() => setViewportWidth(390));

    const strip = async () => {
      const nav = await screen.findByRole("navigation", { name: "Jump to letter" });
      expect(nav.getAttribute("data-testid")).toBe("artist-jump-strip");
      // 27 equal slots over 540px: 20px each.
      nav.getBoundingClientRect = () => ({ top: 100, height: 540 }) as DOMRect;
      nav.setPointerCapture = vi.fn();
      return nav;
    };
    const y = (letterIndex: number) => 100 + letterIndex * 20 + 10;

    it("renders the strip instead of the row, with every letter a named button", async () => {
      renderWithProviders(<ArtistsPage />);
      const nav = await strip();
      expect(within(nav).getAllByRole("button")).toHaveLength(27);
      expect(screen.getAllByRole("navigation", { name: "Jump to letter" })).toHaveLength(1);
      expect(within(nav).getByRole("button", { name: "B" }).getAttribute("aria-disabled")).toBe(
        "true",
      );
    });

    it("jumps on tap and follows a drag, skipping empty letters", async () => {
      renderWithProviders(<ArtistsPage />);
      const nav = await strip();
      // Tap A.
      fireEvent.pointerDown(nav, { clientY: y(0), pointerId: 1 });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("artist-jump-bubble").textContent).toBe("A");
      // Drag down across B (empty) to M (index 12).
      fireEvent.pointerMove(nav, { clientY: y(1), pointerId: 1 });
      expect(screen.getByTestId("artist-jump-bubble").textContent).toBe("A");
      fireEvent.pointerMove(nav, { clientY: y(12), pointerId: 1 });
      expect(screen.getByTestId("artist-jump-bubble").textContent).toBe("M");
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      // Same letter again, and past the ends, do nothing new.
      fireEvent.pointerMove(nav, { clientY: y(12) + 5, pointerId: 1 });
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      fireEvent.pointerMove(nav, { clientY: 5000, pointerId: 1 });
      expect(screen.getByTestId("artist-jump-bubble").textContent).toBe("#");
      fireEvent.pointerUp(nav, { pointerId: 1 });
      expect(screen.queryByTestId("artist-jump-bubble")).toBeNull();
      // Moving with no thumb down does nothing.
      fireEvent.pointerMove(nav, { clientY: y(0), pointerId: 1 });
      expect(screen.queryByTestId("artist-jump-bubble")).toBeNull();
      // A new touch to the same letter works again, and cancel ends it.
      fireEvent.pointerDown(nav, { clientY: y(25), pointerId: 1 });
      fireEvent.pointerCancel(nav, { pointerId: 1 });
      expect(screen.queryByTestId("artist-jump-bubble")).toBeNull();
      fireEvent.pointerDown(nav, { clientY: -50, pointerId: 1 });
      expect(screen.getByTestId("artist-jump-bubble").textContent).toBe("A");
    });

    it("lets a keyboard press a letter, but not an empty one", async () => {
      renderWithProviders(<ArtistsPage />);
      const nav = await strip();
      fireEvent.click(within(nav).getByRole("button", { name: "B" }), { detail: 0 });
      expect(scrollIntoView).not.toHaveBeenCalled();
      fireEvent.click(within(nav).getByRole("button", { name: "Z" }), { detail: 0 });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // A pointer click was already handled by the pointer events.
      fireEvent.click(within(nav).getByRole("button", { name: "S" }), { detail: 1 });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });
});
