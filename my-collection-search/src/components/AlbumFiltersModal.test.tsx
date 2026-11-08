// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: vi.fn().mockResolvedValue([]) }));
vi.mock("@/services/internalApi/artists", () => ({ listArtists: vi.fn() }));

import AlbumFiltersModal, { AlbumFilterSections, albumCountLabel } from "./AlbumFiltersModal";

function setup(props: Partial<React.ComponentProps<typeof AlbumFiltersModal>> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onAddGenre: vi.fn(),
    onRemoveGenre: vi.fn(),
    onIncludeSimilarChange: vi.fn(),
    onToggleMissing: vi.fn(),
    onReset: vi.fn(),
  };
  const view = renderWithProviders(
    <AlbumFiltersModal
      open
      genres={[]}
      includeSimilar={false}
      missing={{}}
      activeCount={0}
      resultCount={1234}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

describe("AlbumFiltersModal sort (#1119)", () => {
  it("is titled Sort & filter", async () => {
    setup();
    expect(await screen.findByText("Sort & filter")).toBeTruthy();
  });

  it("is one 44px dropdown of the seven sorts, the current one selected, applied on change", async () => {
    const onChange = vi.fn();
    const { user } = setup({ sort: { value: "year:asc", onChange } });
    const select = (await screen.findByRole("combobox", { name: "Sort by" })) as HTMLSelectElement;
    expect(select.value).toBe("year:asc");
    expect(within(select).getAllByRole("option")).toHaveLength(7);
    expect(getComputedStyle(select).minHeight).toBe("44px");
    expect(screen.queryByRole("radiogroup")).toBeNull();

    await user.selectOptions(select, "Title A–Z");
    expect(onChange).toHaveBeenCalledWith("title:asc");
  });

  it("leaves the sort alone when Reset clears the filters", async () => {
    const onChange = vi.fn();
    const { user, onReset } = setup({ activeCount: 2, sort: { value: "title:asc", onChange } });
    await user.click(await screen.findByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no Sort by section without a sort, and the shared filter sections never render one", async () => {
    setup();
    await screen.findByRole("group", { name: "Only albums missing" });
    expect(screen.queryByText("Sort by")).toBeNull();

    // The desktop panel renders AlbumFilterSections alone.
    renderWithProviders(
      <AlbumFilterSections
        genres={[]}
        onAddGenre={vi.fn()}
        onRemoveGenre={vi.fn()}
        includeSimilar={false}
        onIncludeSimilarChange={vi.fn()}
        missing={{}}
        onToggleMissing={vi.fn()}
        activeCount={0}
        resultCount={1}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByText("Sort by")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Sort by" })).toBeNull();
  });
});

describe("AlbumFiltersModal (#751)", () => {
  it("shows the album count on the primary button and closes from it", async () => {
    const { user, onOpenChange } = setup();
    await user.click(await screen.findByRole("button", { name: "Show 1,234 albums" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says 'album' for exactly one, and plain 'Show albums' before the count is known", async () => {
    const one = setup({ resultCount: 1 });
    expect(await screen.findByRole("button", { name: "Show 1 album" })).toBeTruthy();
    one.unmount();
    setup({ resultCount: null });
    expect(await screen.findByRole("button", { name: "Show albums" })).toBeTruthy();
  });

  it("disables Reset with nothing active, and resets when something is", async () => {
    const first = setup();
    expect(
      ((await screen.findByRole("button", { name: "Reset" })) as HTMLButtonElement).disabled,
    ).toBe(true);
    first.unmount();

    const { user, onReset } = setup({ activeCount: 2 });
    await user.click(await screen.findByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("toggles each missing check, pressed while on", async () => {
    const { user, onToggleMissing } = setup({ missing: { missing_audio: true } });
    const group = await screen.findByRole("group", { name: "Only albums missing" });
    expect(group.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Audio" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Local cover" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Library identifier" }));
    expect(onToggleMissing).toHaveBeenCalledWith("missing_library_identifier");
  });

  it("offers include-similar only once a genre is chosen", async () => {
    const first = setup();
    await screen.findByRole("group", { name: "Only albums missing" });
    expect(screen.queryByText(/similar/i)).toBeNull();
    first.unmount();

    setup({ genres: ["cumbia"] });
    expect(await screen.findByText(/similar/i)).toBeTruthy();
  });
});

describe("albumCountLabel (#794)", () => {
  it("says 'album' for exactly one and groups thousands", () => {
    expect(albumCountLabel(1)).toBe("1 album");
    expect(albumCountLabel(1234)).toBe(`${(1234).toLocaleString()} albums`);
  });
});

describe("Artist section (#709)", () => {
  it("shows the Artist section only when the page wires it, and removes from its tags (#709)", async () => {
    const first = setup();
    expect(screen.queryByRole("combobox", { name: "Filter by artist" })).toBeNull();
    first.unmount();

    const onAddArtist = vi.fn();
    const onRemoveArtist = vi.fn();
    const { user } = setup({
      artistFilter: {
        selected: ["meridian-brothers"],
        known: [{ slug: "meridian-brothers", name: "Meridian Brothers" }],
        onAdd: onAddArtist,
        onRemove: onRemoveArtist,
        friendId: 6,
      },
    });
    expect(await screen.findByRole("combobox", { name: "Filter by artist" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove artist Meridian Brothers" }));
    expect(onRemoveArtist).toHaveBeenCalledWith("meridian-brothers");
  });
});
