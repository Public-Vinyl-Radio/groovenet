import { describe, expect, it } from "vitest";
import { visibleWindow } from "./playerTuiView.js";

describe("visibleWindow", () => {
  it("shows everything when the list fits", () => {
    expect(visibleWindow(5, 4, 12)).toEqual({ start: 0, end: 5 });
    expect(visibleWindow(12, 11, 12)).toEqual({ start: 0, end: 12 });
  });

  it("stays on the first page until the selection passes its last row", () => {
    expect(visibleWindow(40, 0, 12)).toEqual({ start: 0, end: 12 });
    expect(visibleWindow(40, 11, 12)).toEqual({ start: 0, end: 12 });
    expect(visibleWindow(40, 12, 12)).toEqual({ start: 1, end: 13 });
  });

  it("keeps the selection on the last row while scrolling and stops at the end", () => {
    expect(visibleWindow(40, 25, 12)).toEqual({ start: 14, end: 26 });
    expect(visibleWindow(40, 39, 12)).toEqual({ start: 28, end: 40 });
    expect(visibleWindow(40, 99, 12)).toEqual({ start: 28, end: 40 });
  });
});
