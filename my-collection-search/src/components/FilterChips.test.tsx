// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import FilterChips, { FilterGroup, chipLabel } from "./FilterChips";

const chips = [
  { key: "a", label: "No BPM", active: true },
  { key: "b", label: "No embedding", active: false },
];

describe("FilterChips", () => {
  it("toggles a chip and clears all once one is active", async () => {
    const onToggle = vi.fn();
    const onClearAll = vi.fn();
    const { user } = renderWithProviders(<FilterChips chips={chips} onToggle={onToggle} onClearAll={onClearAll} />);

    await user.click(screen.getByRole("button", { name: "No embedding" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onToggle).toHaveBeenCalledWith("b");
    expect(onClearAll).toHaveBeenCalled();
  });

  it("offers no clear-all when nothing is active", () => {
    renderWithProviders(
      <FilterChips chips={chips.map((c) => ({ ...c, active: false }))} onToggle={vi.fn()} onClearAll={vi.fn()} />
    );

    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("shows a count in the label where the data has one", () => {
    renderWithProviders(
      <FilterChips
        chips={[
          { key: "a", label: "Missing audio", active: false, count: 1041 },
          { key: "b", label: "No BPM", active: false },
        ]}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Missing audio · 1,041" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No BPM" })).toBeTruthy();
  });

  it("names an active chip for what its x does, and leaves an inactive one unpressed (#794)", () => {
    renderWithProviders(<FilterChips chips={chips} onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Remove filter No BPM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No embedding" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("puts the result count on the chip line, and leaves it out until it's known", () => {
    const { rerender } = renderWithProviders(<FilterChips chips={chips} onToggle={vi.fn()} summary="81 albums" />);

    const summary = screen.getByTestId("filter-summary");
    expect(summary.textContent).toBe("81 albums");
    expect(screen.getByTestId("filter-row").contains(summary)).toBe(true);

    rerender(<FilterChips chips={chips} onToggle={vi.fn()} />);
    expect(screen.queryByTestId("filter-summary")).toBeNull();
  });

  it("takes no space on phones with neither chips nor a count", () => {
    const { container, rerender } = renderWithProviders(<FilterChips chips={[]} onToggle={vi.fn()} />);
    expect(getComputedStyle(container.firstElementChild as Element).display).toBe("none");

    rerender(<FilterChips chips={[]} onToggle={vi.fn()} summary="0 results" />);
    expect(getComputedStyle(container.firstElementChild as Element).display).toBe("block");
  });

  it("formats a zero count rather than dropping it", () => {
    expect(chipLabel({ label: "Missing audio", count: 0 })).toBe("Missing audio · 0");
  });

  describe("layout (#685)", () => {
    const leading = (
      <>
        <FilterGroup>
          <button>Genre</button>
        </FilterGroup>
        <FilterGroup>
          <button>Missing</button>
          <button>BPM / Key</button>
        </FilterGroup>
      </>
    );

    it("puts the controls in groups, on a row of their own", () => {
      renderWithProviders(<FilterChips chips={chips} onToggle={vi.fn()} leading={leading} />);

      const controls = screen.getByTestId("filter-controls");
      const groups = within(controls).getAllByTestId("filter-group");
      expect(groups).toHaveLength(2);
      expect(within(groups[1]).getAllByRole("button", { hidden: true }).map((b) => b.textContent)).toEqual(["Missing", "BPM / Key"]);
      // The gap between groups is wider than the gap inside one.
      expect(getComputedStyle(controls).columnGap).not.toBe(getComputedStyle(groups[1]).columnGap);
      expect(getComputedStyle(controls).alignItems).toBe("center");
    });

    it("puts the active chips and clear-all on a separate line from the controls", () => {
      renderWithProviders(<FilterChips chips={chips} onToggle={vi.fn()} onClearAll={vi.fn()} leading={leading} />);

      const controls = screen.getByTestId("filter-controls");
      const line = screen.getByTestId("filter-chips");
      expect(controls.contains(line)).toBe(false);
      expect(line.contains(controls)).toBe(false);
      expect(controls.nextElementSibling).toBe(screen.getByTestId("filter-row"));
      expect(within(line).getByRole("button", { name: "Clear all" })).toBeTruthy();
      expect(within(line).getByRole("button", { name: "No embedding" })).toBeTruthy();
      expect(within(controls).queryByRole("button", { name: "No embedding" })).toBeNull();
    });

    it("keeps the chip line in place, empty, so the controls don't move when filters appear", () => {
      renderWithProviders(<FilterChips chips={[]} onToggle={vi.fn()} leading={leading} />);

      const line = screen.getByTestId("filter-chips");
      expect(line.children).toHaveLength(0);
      expect(screen.getByTestId("filter-controls")).toBeTruthy();
    });

    it("has no controls row without leading controls", () => {
      renderWithProviders(<FilterChips chips={chips} onToggle={vi.fn()} />);

      expect(screen.queryByTestId("filter-controls")).toBeNull();
      expect(screen.getByTestId("filter-chips")).toBeTruthy();
    });
  });
});
