// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { PaletteScopeControls } from "@/test/PaletteScopeControls";
import {
  CommandPaletteProvider,
  usePaletteScope,
  useCommandPalette,
  type PaletteScope,
} from "./CommandPaletteProvider";

function Page({ scope }: { scope: PaletteScope | null }) {
  usePaletteScope(scope);
  return null;
}
const tracks: PaletteScope = { id: "tracks", label: "Tracks" };
const albums: PaletteScope = { id: "albums", label: "Albums" };
function Fixture({ child = true, label = "Tracks" }) {
  return (
    <CommandPaletteProvider>
      <Page scope={{ ...tracks, label }} />
      {child && <Page scope={albums} />}
      <PaletteScopeControls />
    </CommandPaletteProvider>
  );
}

describe("palette scopes", () => {
  it("uses the latest mount, keeps its priority on update, and restores on unmount", () => {
    const { rerender } = renderWithProviders(<Fixture />);
    expect(screen.getByTestId("palette-scope").textContent).toBe("albums");
    rerender(<Fixture label="Updated" />);
    expect(screen.getByTestId("palette-scope").textContent).toBe("albums");
    rerender(<Fixture child={false} />);
    expect(screen.getByTestId("palette-scope").textContent).toBe("tracks");
  });
  it("unregisters nullable scopes and clears the final scope", () => {
    const tree = (scope: PaletteScope | null) => (
      <CommandPaletteProvider>
        <Page scope={scope} />
        <PaletteScopeControls />
      </CommandPaletteProvider>
    );
    const { rerender } = renderWithProviders(tree(null));
    expect(screen.getByTestId("palette-scope").textContent).toBe("");
    rerender(tree(tracks));
    expect(screen.getByTestId("palette-scope").textContent).toBe("tracks");
    rerender(tree(null));
    expect(screen.getByTestId("palette-scope").textContent).toBe("");
  });
  it("supports isolated pages and rejects palette consumers outside the provider", () => {
    renderWithProviders(<Page scope={tracks} />);
    function Consumer() {
      useCommandPalette();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow(
      "useCommandPalette must be used within CommandPaletteProvider",
    );
  });
});

it("refreshes a registered handler without remounting", async () => {
  const original = vi.fn();
  const updated = vi.fn();
  const tree = (onSearch: () => void) => (
    <CommandPaletteProvider>
      <Page scope={{ ...tracks, onSearch }} />
      <PaletteScopeControls />
    </CommandPaletteProvider>
  );
  const { user, rerender } = renderWithProviders(tree(original));
  rerender(tree(updated));
  await user.click(screen.getByText("Run scoped search"));
  expect(updated).toHaveBeenCalledWith("dusty");
  expect(original).not.toHaveBeenCalled();
});
