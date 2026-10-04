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

describe("isTrackSearchMode", () => {
  it("accepts only the three modes", () => {
    expect(isTrackSearchMode("hybrid")).toBe(true);
    expect(isTrackSearchMode("vibes")).toBe(false);
    expect(isTrackSearchMode(null)).toBe(false);
  });
});
