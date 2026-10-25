// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistItemActionsMenu from "./PlaylistItemActionsMenu";

afterEach(() => vi.clearAllMocks());

function setup(props: Partial<React.ComponentProps<typeof PlaylistItemActionsMenu>> = {}) {
  const h = { onPlay: vi.fn(), onDelete: vi.fn(), onOpen: vi.fn(), onEnqueue: vi.fn() };
  const rendered = renderWithProviders(
    <PlaylistItemActionsMenu playlistName="Late Night" summary="12 tracks · 1h 4m · Today" {...h} {...props} />
  );
  const open = async () => {
    await rendered.user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await screen.findByText(/12 tracks/);
  };
  return { ...rendered, h, open };
}

describe("PlaylistItemActionsMenu phone modal (#751)", () => {
  it("runs the three tiles", async () => {
    const { user, h, open } = setup();
    await open();
    await user.click(screen.getByRole("button", { name: "Play now" }));
    expect(h.onPlay).toHaveBeenCalled();
    await open();
    await user.click(screen.getByRole("button", { name: "Enqueue" }));
    expect(h.onEnqueue).toHaveBeenCalled();
    await open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(h.onOpen).toHaveBeenCalled();
  });

  it("offers Turn into a set and Export PDF only when given, and deletes from the danger group", async () => {
    const onCreateSet = vi.fn();
    const onExportPdf = vi.fn();
    const { user, h, open } = setup({ onCreateSet, onExportPdf });
    await open();
    await user.click(screen.getByRole("button", { name: "Turn into a set" }));
    expect(onCreateSet).toHaveBeenCalled();
    await open();
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(onExportPdf).toHaveBeenCalled();
    await open();
    await user.click(screen.getByRole("button", { name: "Delete playlist" }));
    expect(h.onDelete).toHaveBeenCalled();
  });

  it("omits the optional actions and shows the played badge and collaborators", async () => {
    const { open } = setup({ played: true, collaborators: "ana, bo" });
    await open();
    expect(screen.queryByRole("button", { name: "Turn into a set" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export PDF" })).toBeNull();
    expect(screen.getByText(/PLAYED/)).toBeTruthy();
    expect(screen.getByText("ana, bo")).toBeTruthy();
  });

  it("defaults to an empty summary", async () => {
    const rendered = renderWithProviders(
      <PlaylistItemActionsMenu playlistName="X" onPlay={vi.fn()} onDelete={vi.fn()} onOpen={vi.fn()} onEnqueue={vi.fn()} />
    );
    await rendered.user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    expect(await screen.findByRole("button", { name: "Delete playlist" })).toBeTruthy();
  });
});

describe("PlaylistItemActionsMenu desktop dropdown", () => {
  it("lists Enqueue and Export PDF alongside the existing actions", async () => {
    const onExportPdf = vi.fn();
    const { user, h } = setup({ onExportPdf, onCreateSet: vi.fn() });
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1]);
    await user.click(await screen.findByRole("menuitem", { name: /Enqueue/, hidden: true }));
    expect(h.onEnqueue).toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1]);
    await user.click(await screen.findByRole("menuitem", { name: /Export PDF/, hidden: true }));
    expect(onExportPdf).toHaveBeenCalled();
  });
});
