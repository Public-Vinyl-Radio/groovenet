import { describe, expect, it } from "vitest";
import {
  actionLabel,
  cleaningState,
  copyName,
  describeAction,
  formatLastCleaned,
  sleeveLabel,
} from "./recordCareFormat";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("labels", () => {
  it("names sleeves, including an unknown one", () => {
    expect(sleeveLabel("poly-rice-paper-poly")).toBe("Poly / rice paper / poly");
    expect(sleeveLabel(null)).toBe("Unknown sleeve");
  });

  it("names action types", () => {
    expect(actionLabel("sleeved")).toBe("Sleeve change");
  });

  it("describes an action by what it carries", () => {
    expect(describeAction({ action_type: "sleeved", sleeve_type: "poly", details: {} })).toBe(
      "Sleeve change → Poly"
    );
    expect(
      describeAction({ action_type: "cleaned", sleeve_type: null, details: { method: "vacuum" } })
    ).toBe("Cleaned · Vacuum machine");
    expect(describeAction({ action_type: "cleaned", sleeve_type: null, details: {} })).toBe(
      "Cleaned"
    );
    expect(describeAction({ action_type: "repaired", sleeve_type: null, details: {} })).toBe(
      "Repaired"
    );
  });
});

describe("copyName", () => {
  it("prefers the label, then the default, then the position", () => {
    expect(copyName({ label: "DJ copy", is_default: true }, 0)).toBe("DJ copy");
    expect(copyName({ label: null, is_default: true }, 0)).toBe("Default copy");
    expect(copyName({ label: null, is_default: false }, 1)).toBe("Copy 2");
  });
});

describe("cleaningState", () => {
  it("is never_cleaned without a cleaning", () => {
    expect(cleaningState(null, 365, NOW)).toBe("never_cleaned");
  });

  it("is overdue only past the threshold", () => {
    expect(cleaningState(daysAgo(366), 365, NOW)).toBe("overdue");
    expect(cleaningState(daysAgo(364), 365, NOW)).toBe("clean");
  });

  it("cannot be overdue before the threshold is known", () => {
    expect(cleaningState(daysAgo(1000), undefined, NOW)).toBe("clean");
  });

  it("defaults to now", () => {
    expect(cleaningState(new Date().toISOString(), 365)).toBe("clean");
  });
});

describe("formatLastCleaned", () => {
  it.each([
    [null, "Never cleaned"],
    [daysAgo(0), "Cleaned today"],
    [daysAgo(1), "Cleaned 1 day ago"],
    [daysAgo(12), "Cleaned 12 days ago"],
    [daysAgo(30 * 14), "Cleaned 14 months ago"],
    [daysAgo(365 * 3), "Cleaned 3 years ago"],
  ])("%s → %s", (at, text) => {
    expect(formatLastCleaned(at, NOW)).toBe(text);
  });

  it("defaults to now", () => {
    expect(formatLastCleaned(new Date().toISOString())).toBe("Cleaned today");
  });
});
