// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import SpinFormDialog from "./SpinFormDialog";

vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinMutations: () => ({
    createSpin: vi.fn(),
    updateSpin: vi.fn(),
    createSpinPending: false,
    updateSpinPending: false,
  }),
}));
const albums = vi.hoisted(() => ({ structure: vi.fn() }));
vi.mock("@/services/internalApi/albums", () => ({
  getAlbumPlayableStructure: albums.structure,
}));

beforeEach(() => albums.structure.mockReset().mockResolvedValue({ sides: [] }));

afterEach(() => setViewportWidth(1280));

describe.each([
  ["phone", 375],
  ["desktop", 1280],
])("SpinFormDialog on %s", (_name, width) => {
  it("opens as a dialog titled for the new spin and cancels", async () => {
    setViewportWidth(width);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <SpinFormDialog
        open
        onOpenChange={onOpenChange}
        releaseId="1"
        friendId={1}
        albumTitle="Infame"
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Log Vinyl Spin")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save Spin" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

it("marks a spin of every side as a full album (#963)", async () => {
  const side = (key: string) => ({
    side_key: key,
    side_label: `Side ${key}`,
    ordinal: key === "A" ? 0 : 1,
    track_count: 1,
    tracks: [{ track_id: `t-${key}`, friend_id: 1, position: `${key}1`, title: key, artist: "X" }],
  });
  albums.structure.mockResolvedValue({ sides: [side("A"), side("B")] });
  const { user } = renderWithProviders(
    <SpinFormDialog open onOpenChange={vi.fn()} releaseId="1" friendId={1} albumTitle="Infame" />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button", { name: "Select all sides" }));
  expect(await within(dialog).findByText("Full album")).toBeTruthy();
});
