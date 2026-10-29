// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

import AlbumActionsMenu from "./AlbumActionsMenu";

afterEach(() => setViewportWidth(1280));

describe("AlbumActionsMenu delete action (#511)", () => {
  it("omits the delete item when no handler is given (desktop menu)", async () => {
    const { user } = renderWithProviders(<AlbumActionsMenu />);
    await user.click(screen.getAllByRole("button", { name: "Album actions", hidden: true })[1]);
    expect(screen.queryByText("Delete Album...")).toBeNull();
  });

  // Selecting through Ark is timing-sensitive in jsdom (see ArtworkMenuItems.test),
  // so the dropdown is only checked for the item.
  it("lists the delete item in the desktop menu", async () => {
    const { user } = renderWithProviders(<AlbumActionsMenu onDeleteAlbum={vi.fn()} />);
    // jsdom renders both layouts; the second trigger is the desktop dropdown.
    await user.click(screen.getAllByRole("button", { name: "Album actions", hidden: true })[1]);
    expect(
      await screen.findByRole("menuitem", { name: /Delete Album/, hidden: true }),
    ).toBeTruthy();
  });
});

describe("AlbumActionsMenu phone modal (#751)", () => {
  const open = async (ui: React.ReactElement) => {
    setViewportWidth(400);
    const view = renderWithProviders(ui);
    await view.user.click(screen.getByRole("button", { name: "Album actions" }));
    return view;
  };

  it("shows the label strip, tiles and groups", async () => {
    await open(
      <AlbumActionsMenu
        albumTitle="Infame"
        albumArtist="Babasonicos"
        catalogue="Album · LP-349"
        subtitle="Babasonicos · Sony · 2024"
        coverUrl="/c.jpg"
        onPlayAlbum={vi.fn()}
        onLogCare={vi.fn()}
        editAlbumHref="/albums/1/edit"
        onEnrichAlbum={vi.fn()}
        onChangeArtwork={vi.fn()}
        onDownloadMissing={vi.fn()}
        discogsUrl="https://discogs.com/release/1"
        onViewRawDiscogs={vi.fn()}
        onDeleteAlbum={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Album · LP-349")).toBeTruthy();
    expect(within(dialog).getByText("Infame")).toBeTruthy();
    expect(within(dialog).getByText("Babasonicos · Sony · 2024")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/albums/1/edit",
    );
    for (const label of [
      "Play",
      "Log care",
      "Library",
      "Discogs",
      "Danger",
      "Enrich album",
      "Cover art",
      "Download missing audio",
      "View raw Discogs file",
      "Delete album",
    ]) {
      expect(within(dialog).getByText(label)).toBeTruthy();
    }
    expect(
      within(dialog).getByRole("link", { name: "View on Discogs" }).getAttribute("target"),
    ).toBe("_blank");
  });

  it("falls back to the artist and a generic label, and omits empty groups", async () => {
    await open(<AlbumActionsMenu albumArtist="Someone" onDeleteAlbum={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Album")).toBeTruthy();
    expect(within(dialog).getByText("Album actions", { selector: "h2" })).toBeTruthy();
    expect(within(dialog).getByText("Someone")).toBeTruthy();
    expect(within(dialog).queryByText("Library")).toBeNull();
    expect(within(dialog).queryByText("Discogs")).toBeNull();
    expect(within(dialog).queryByText("Play")).toBeNull();
  });

  it.each([
    ["Play", { onPlayAlbum: vi.fn() }],
    ["Log care", { onLogCare: vi.fn() }],
    ["Enrich album", { onEnrichAlbum: vi.fn() }],
    ["Cover art", { onChangeArtwork: vi.fn() }],
    ["Download missing audio", { onDownloadMissing: vi.fn() }],
    ["View raw Discogs file", { onViewRawDiscogs: vi.fn() }],
    ["Delete album", { onDeleteAlbum: vi.fn() }],
  ])("runs %s and closes the modal", async (label, props) => {
    const { user } = await open(<AlbumActionsMenu {...props} />);
    await user.click(within(screen.getByRole("dialog")).getByText(label));
    expect(Object.values(props)[0]).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("disables the busy actions", async () => {
    await open(
      <AlbumActionsMenu
        isDownloading
        isEnriching
        onDownloadMissing={vi.fn()}
        onEnrichAlbum={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByText("Downloading...").closest("button") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByText("Opening enrichment...").closest("button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
