// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: vi.fn().mockResolvedValue([]) }));

import AlbumFiltersModal, { albumCountLabel } from "./AlbumFiltersModal";

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
    />
  );
  return { ...view, ...handlers };
}

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
    expect(((await screen.findByRole("button", { name: "Reset" })) as HTMLButtonElement).disabled).toBe(true);
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
    expect(screen.getByRole("button", { name: "Local cover" }).getAttribute("aria-pressed")).toBe("false");

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
