// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import FiltersPanel from "./FiltersPanel";

function Harness({
  activeCount = 0,
  onReset = vi.fn(),
}: {
  activeCount?: number;
  onReset?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <FiltersPanel
        open={open}
        onOpenChange={setOpen}
        scope="Albums"
        activeCount={activeCount}
        onReset={onReset}
        showLabel="Show 81 albums"
      >
        <button>Inside</button>
      </FiltersPanel>
      <button>Outside</button>
    </>
  );
}

describe("FiltersPanel (#794)", () => {
  it("opens under FILTERS with the label strip, the sections and the footer", async () => {
    const { user } = renderWithProviders(<Harness activeCount={4} />);

    await user.click(screen.getByRole("button", { name: "Filters · 4" }));
    const panel = await screen.findByRole("dialog", { name: "Filters" });
    expect(within(panel).getByText("Albums · 4 active")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Inside" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Show 81 albums" })).toBeTruthy();
  });

  it("names the strip by scope alone with nothing on, and disables Reset", async () => {
    const { user } = renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const panel = await screen.findByRole("dialog", { name: "Filters" });
    expect(within(panel).getByText("Albums")).toBeTruthy();
    expect(
      (within(panel).getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("closes on Esc and gives focus back to FILTERS", async () => {
    const { user } = renderWithProviders(<Harness />);
    const trigger = screen.getByRole("button", { name: "Filters" });

    await user.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Filters" });
    // Opening moves focus into the panel, which is where Esc is heard.
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  // A click outside is Ark's dismissable layer, which jsdom's pointer events don't reach; checked in the browser.
  it("closes from the close button and from Show", async () => {
    const onReset = vi.fn();
    const { user } = renderWithProviders(<Harness activeCount={1} onReset={onReset} />);
    const trigger = screen.getByRole("button", { name: "Filters · 1" });

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Close filters" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull());

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show 81 albums" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull());
  });
});
