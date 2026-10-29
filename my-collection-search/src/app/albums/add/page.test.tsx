// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  pending: false,
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: state.toast } }));
vi.mock("@/hooks/useCreateAlbumMutation", () => ({
  useCreateAlbumMutation: () => ({ mutateAsync: state.mutate, isPending: state.pending }),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: { id: 7 } }) }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ playlistLength: 0 }),
}));
vi.mock("@/components/AlbumForm", () => ({ default: () => null }));
vi.mock("@/components/CoverArtUpload", () => ({ default: () => null }));
vi.mock("@/components/TrackListBuilder", () => ({ default: () => null }));

import AddAlbumPage from "./page";

const header = () => within(screen.getByTestId("page-header"));

beforeEach(() => {
  state.push.mockReset();
  state.mutate.mockReset();
  state.toast.mockReset();
  state.pending = false;
});

describe("AddAlbumPage header", () => {
  it("titles the page and cancels back to the collection", async () => {
    const { user } = renderWithProviders(<AddAlbumPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Add Album" })).toBeTruthy();
    await user.click(header().getByRole("button", { name: "Cancel", hidden: true }));
    expect(state.push).toHaveBeenCalledWith("/");
  });

  it("saves from the header action (validation runs as before)", async () => {
    const { user } = renderWithProviders(<AddAlbumPage />);
    await user.click(header().getByRole("button", { name: "Save Album", hidden: true }));
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Album title required" }),
    );
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("locks both header controls while saving", () => {
    state.pending = true;
    renderWithProviders(<AddAlbumPage />);
    for (const name of ["Cancel", "Save Album"]) {
      expect(
        (header().getByRole("button", { name, hidden: true }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
  });
});
