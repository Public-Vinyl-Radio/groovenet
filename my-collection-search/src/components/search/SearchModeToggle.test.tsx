// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SearchModeToggle, { isTrackSearchMode } from "./SearchModeToggle";

describe("SearchModeToggle", () => {
  it("shows the current mode and reports a new one", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<SearchModeToggle value="lexical" onChange={onChange} />);

    expect((screen.getByRole("radio", { name: "Keyword", hidden: true }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByText("Semantic"));

    expect(onChange).toHaveBeenCalledWith("semantic");
  });
});

describe("SearchModeToggle touch target", () => {
  it("is 44px tall and fills its row when asked, for phones (#722)", () => {
    renderWithProviders(<SearchModeToggle value="lexical" onChange={vi.fn()} touchTarget />);

    const group = screen.getByRole("radiogroup", { name: "Search mode", hidden: true });
    expect(getComputedStyle(group).height).toBe("44px");
    expect(getComputedStyle(group).flexGrow).toBe("1");
  });

  it("stretches each segment to the group's height, so the ink fill has no gap under it", () => {
    renderWithProviders(<SearchModeToggle value="lexical" onChange={vi.fn()} touchTarget />);

    const group = screen.getByRole("radiogroup", { name: "Search mode", hidden: true });
    const classes = [...group.classList];
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .filter((text) => classes.some((c) => text.includes(`.${c}`)) && text.includes("label"))
      .join("\n");
    expect(css).toMatch(/height:\s*100%/);
  });
});

describe("isTrackSearchMode", () => {
  it("accepts only the three modes", () => {
    expect(isTrackSearchMode("hybrid")).toBe(true);
    expect(isTrackSearchMode("vibes")).toBe(false);
    expect(isTrackSearchMode(null)).toBe(false);
  });
});
