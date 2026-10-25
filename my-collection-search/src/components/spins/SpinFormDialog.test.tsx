// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/services/internalApi/albums", () => ({
  getAlbumPlayableStructure: vi.fn().mockResolvedValue({ sides: [] }),
}));

afterEach(() => setViewportWidth(1280));

describe.each([
  ["phone", 375],
  ["desktop", 1280],
])("SpinFormDialog on %s", (_name, width) => {
  it("opens as a dialog titled for the new spin and cancels", async () => {
    setViewportWidth(width);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <SpinFormDialog open onOpenChange={onOpenChange} releaseId="1" friendId={1} albumTitle="Infame" />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Log Vinyl Spin")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save Spin" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
