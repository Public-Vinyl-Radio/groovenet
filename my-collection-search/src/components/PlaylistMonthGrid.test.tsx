// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistMonthGrid, { PLAYLIST_GRID_COLUMNS } from "./PlaylistMonthGrid";

const cssText = () =>
  Array.from(document.querySelectorAll("style"))
    .map((el) => el.textContent ?? "")
    .join("\n");

describe("PlaylistMonthGrid (#769)", () => {
  it("aligns cards to the top and leaves room for the hard shadow", () => {
    renderWithProviders(
      <PlaylistMonthGrid>
        <div>card</div>
      </PlaylistMonthGrid>,
    );
    const style = getComputedStyle(screen.getByTestId("month-grid"));
    expect(style.display).toBe("grid");
    expect(style.alignItems).toBe("start");
    expect(style.paddingRight).toBe("6px");
    expect(style.paddingBottom).toBe("6px");
    expect(style.overflowY).not.toBe("auto");
  });

  it("steps from one column on a phone to three on wide desktop", () => {
    expect(PLAYLIST_GRID_COLUMNS).toEqual({ base: 1, md: 2, xl: 3 });
    renderWithProviders(
      <PlaylistMonthGrid>
        <div>card</div>
      </PlaylistMonthGrid>,
    );
    expect(cssText()).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    expect(cssText()).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it("uses a single column in list view", () => {
    renderWithProviders(
      <PlaylistMonthGrid list>
        <div>row</div>
      </PlaylistMonthGrid>,
    );
    expect(getComputedStyle(screen.getByTestId("month-grid")).gridTemplateColumns).toBe(
      "repeat(1, minmax(0, 1fr))",
    );
  });
});
