// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import TrackSearchMenu from "./TrackSearchMenu";

function setup(props: Partial<React.ComponentProps<typeof TrackSearchMenu>> = {}) {
  const onOpenOptions = vi.fn();
  const onToggleSelect = vi.fn();
  const view = renderWithProviders(
    <TrackSearchMenu activeCount={0} selectMode={false} onOpenOptions={onOpenOptions} onToggleSelect={onToggleSelect} {...props} />
  );
  return { ...view, onOpenOptions, onToggleSelect };
}

describe("TrackSearchMenu (#751)", () => {
  it("has no badge without filters, and offers both entries", async () => {
    const { user, onOpenOptions, onToggleSelect } = setup();
    const kebab = screen.getByRole("button", { name: "Tracks actions" });
    expect(kebab.textContent).toBe("");

    await user.click(kebab);
    await user.click(await screen.findByRole("menuitem", { name: "Search options" }));
    expect(onOpenOptions).toHaveBeenCalledTimes(1);

    await user.click(kebab);
    await user.click(await screen.findByRole("menuitem", { name: "Select tracks" }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("shows the active count on the kebab and the entry", async () => {
    const { user } = setup({ activeCount: 3 });
    const kebab = screen.getByRole("button", { name: "Tracks actions, 3 filters on" });
    expect(kebab.textContent).toBe("3");
    await user.click(kebab);
    expect(await screen.findByRole("menuitem", { name: "Search options (3)" })).toBeTruthy();
  });

  it("offers to stop selecting while select mode is on", async () => {
    const { user } = setup({ selectMode: true });
    await user.click(screen.getByRole("button", { name: "Tracks actions" }));
    expect(await screen.findByRole("menuitem", { name: "Stop selecting" })).toBeTruthy();
  });
});
