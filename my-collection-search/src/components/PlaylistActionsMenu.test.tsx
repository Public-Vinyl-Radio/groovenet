// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistActionsMenu from "./PlaylistActionsMenu";

const handlers = () => ({
  onSortGreedy: vi.fn(),
  onSortGenetic: vi.fn(),
  onSortCohesiveBlocks: vi.fn(),
  onExportJson: vi.fn(),
  onImportJson: vi.fn(),
  onExportPdf: vi.fn(),
  onOpenSaveDialog: vi.fn(),
  enqueuePlaylist: vi.fn(),
});

afterEach(() => vi.clearAllMocks());

async function openModal(props: Partial<React.ComponentProps<typeof PlaylistActionsMenu>> = {}) {
  const h = handlers();
  const rendered = renderWithProviders(
    <PlaylistActionsMenu {...h} playlistName="Late Night" summary="12 tracks · 1h 4m" {...props} />,
  );
  await rendered.user.click(
    screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0],
  );
  await screen.findByText("12 tracks · 1h 4m");
  return { ...rendered, h };
}

describe("PlaylistActionsMenu phone modal (#751)", () => {
  it("shows the summary and title, and runs the tiles", async () => {
    const { user, h } = await openModal({ onDuplicate: vi.fn() });
    expect(screen.getByText("Late Night")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Enqueue" }));
    expect(h.enqueuePlaylist).toHaveBeenCalled();
  });

  it("saves and duplicates", async () => {
    const onDuplicate = vi.fn();
    const { user, h } = await openModal({ onDuplicate });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onOpenSaveDialog).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalled();
  });

  it("renames from the header button, only when renaming is available", async () => {
    const onRename = vi.fn();
    const { user, unmount } = await openModal({ onRename });
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(onRename).toHaveBeenCalled();
    unmount();

    await openModal();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
  });

  it("sorts and exports, and has no temporary maintenance actions", async () => {
    const { user, h } = await openModal({ onOpenRecommendations: vi.fn() });
    expect(screen.queryByText(/Enqueue Missing Downloads/i)).toBeNull();
    expect(screen.queryByText(/Backfill Duration/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Greedy order" }));
    expect(h.onSortGreedy).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Genetic order" }));
    expect(h.onSortGenetic).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Cohesive blocks" }));
    expect(h.onSortCohesiveBlocks).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Export JSON" }));
    expect(h.onExportJson).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Export PDF" }));
    expect(h.onExportPdf).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Import & append JSON" }));
    expect(h.onImportJson).toHaveBeenCalled();
  });

  it("disables a sort that is running and shows Sorting...", async () => {
    await openModal({ isGeneticSorting: true, isCohesiveBlocksSorting: true });
    const sorting = screen.getAllByRole("button", { name: "Sorting..." }) as HTMLButtonElement[];
    expect(sorting).toHaveLength(2);
    expect(sorting.every((b) => b.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: "AI recommendations" })).toBeNull();
  });

  it("defaults the strip when no summary or name is given", async () => {
    const rendered = renderWithProviders(<PlaylistActionsMenu {...handlers()} />);
    await rendered.user.click(
      screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0],
    );
    expect(await screen.findByText("Playlist actions", { selector: "h2" })).toBeTruthy();
  });
});
