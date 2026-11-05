// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  pending: false,
  playlistLength: 0,
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: state.toast } }));
vi.mock("@/hooks/useCreateAlbumMutation", () => ({
  useCreateAlbumMutation: () => ({ mutateAsync: state.mutate, isPending: state.pending }),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: { id: 7 } }) }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ playlistLength: state.playlistLength }),
}));
vi.mock("@/components/AlbumForm", () => ({ default: () => null }));
vi.mock("@/components/CoverArtUpload", () => ({ default: () => null }));
vi.mock("@/components/TrackListBuilder", () => ({ default: () => null }));

import AddAlbumPage from "./page";

beforeEach(() => {
  state.push.mockReset();
  state.mutate.mockReset();
  state.toast.mockReset();
  state.pending = false;
  state.playlistLength = 0;
});

describe("AddAlbumPage header", () => {
  const desktop = () => within(screen.getByTestId("page-header-desktop-actions"));
  const phone = () => within(screen.getByTestId("page-header"));
  const button = (scope: ReturnType<typeof within>, name: string) =>
    scope.getByRole("button", { name, hidden: true }) as HTMLButtonElement;

  it("titles the page under the Albums trail", () => {
    renderWithProviders(<AddAlbumPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Add album" })).toBeTruthy();
    const trail = within(screen.getByTestId("page-header-breadcrumbs"));
    expect(trail.getByRole("link", { name: "Albums", hidden: true }).getAttribute("href")).toBe(
      "/albums",
    );
    expect(trail.getByText("Add").getAttribute("aria-current")).toBe("page");
  });

  it("cancels back to the collection from the phone bar and the desktop row", async () => {
    const { user } = renderWithProviders(<AddAlbumPage />);
    await user.click(
      within(screen.getByTestId("page-header-leading")).getByRole("button", {
        name: "Cancel",
        hidden: true,
      }),
    );
    await user.click(button(desktop(), "Cancel"));
    expect(state.push).toHaveBeenCalledTimes(2);
    expect(state.push).toHaveBeenCalledWith("/albums");
  });

  it("saves from either header action (validation runs as before)", async () => {
    const { user } = renderWithProviders(<AddAlbumPage />);
    await user.click(
      within(screen.getByTestId("page-header-phone-actions")).getByRole("button", {
        name: "Save album",
        hidden: true,
      }),
    );
    await user.click(button(desktop(), "Save album"));
    expect(state.toast).toHaveBeenCalledTimes(2);
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Album title required" }),
    );
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("puts Cancel then Save in the desktop row, and nothing under the form", () => {
    renderWithProviders(<AddAlbumPage />);
    expect(
      desktop()
        .getAllByRole("button", { hidden: true })
        .map((b) => b.textContent),
    ).toEqual(["Cancel", "Save album"]);
    // One Cancel per width: the phone bar's icon and the desktop button.
    expect(phone().getAllByRole("button", { name: "Cancel", hidden: true })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Save album/, hidden: true })).toHaveLength(2);
  });

  it("locks both header controls at both widths while saving", () => {
    state.pending = true;
    renderWithProviders(<AddAlbumPage />);
    for (const name of ["Cancel", /Save album/]) {
      for (const el of phone().getAllByRole("button", { name, hidden: true }))
        expect((el as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("AddAlbumPage layout", () => {
  const container = () => {
    let el: HTMLElement | null = screen.getByTestId("page-header");
    while (el && getComputedStyle(el).maxWidth !== "1360px") el = el.parentElement;
    return el!;
  };

  it("leaves room for the mini player only while a queue is loaded", () => {
    const { unmount } = renderWithProviders(<AddAlbumPage />);
    expect(getComputedStyle(container()).marginBottom).toBe("0px");
    unmount();

    state.playlistLength = 3;
    renderWithProviders(<AddAlbumPage />);
    expect(getComputedStyle(container()).marginBottom).toBe("120px");
  });
});
