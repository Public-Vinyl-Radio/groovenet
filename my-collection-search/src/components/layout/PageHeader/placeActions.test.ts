import { describe, expect, it } from "vitest";
import { placeActions, type HeaderAction } from "./placeActions";

const act = (label: string, extra: Partial<HeaderAction> = {}): HeaderAction => ({
  label,
  icon: "i",
  onClick: () => {},
  ...extra,
});
const labels = (actions: HeaderAction[]) => actions.map((a) => a.label);

describe("placeActions", () => {
  it("shows every action as a desktop button and the first two as phone icons", () => {
    const placed = placeActions([act("A"), act("B"), act("C")]);
    expect(labels(placed.desktopButtons)).toEqual(["A", "B", "C"]);
    expect(labels(placed.phoneIcons)).toEqual(["A", "B"]);
    expect(labels(placed.phoneMenu)).toEqual(["C"]);
    expect(placed.desktopMenu).toEqual([]);
    expect(placed.solid).toBeUndefined();
  });

  it("puts an action without an icon in the phone menu", () => {
    const placed = placeActions([act("Clear", { icon: undefined })]);
    expect(placed.phoneIcons).toEqual([]);
    expect(labels(placed.phoneMenu)).toEqual(["Clear"]);
  });

  it("asks for an icon in vain when there is none to show", () => {
    const placed = placeActions([act("Clear", { icon: undefined, phone: "icon" })]);
    expect(labels(placed.phoneMenu)).toEqual(["Clear"]);
  });

  it("honours explicit placements", () => {
    const placed = placeActions([
      act("Menu both", { phone: "menu", desktop: "menu" }),
      act("Phone only", { desktop: "hidden" }),
      act("Desktop only", { phone: "hidden" }),
    ]);
    expect(labels(placed.desktopButtons)).toEqual(["Desktop only"]);
    expect(labels(placed.desktopMenu)).toEqual(["Menu both"]);
    expect(labels(placed.phoneIcons)).toEqual(["Phone only"]);
    expect(labels(placed.phoneMenu)).toEqual(["Menu both"]);
  });

  it("draws only the first primary desktop button solid", () => {
    const placed = placeActions([
      act("In menu", { primary: true, desktop: "menu" }),
      act("Save", { primary: true }),
      act("Publish", { primary: true }),
    ]);
    expect(placed.solid?.label).toBe("Save");
  });
});
