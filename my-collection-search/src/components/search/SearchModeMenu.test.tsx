// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SearchModeMenu from "./SearchModeMenu";

describe("SearchModeMenu (#794)", () => {
  it("names the current mode and picks another, each with its hint", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<SearchModeMenu value="semantic" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Search mode: Semantic" });
    expect(trigger.textContent).toBe("Semantic");
    await user.click(trigger);

    const semantic = await screen.findByRole("menuitemradio", { name: /^Semantic/ });
    expect(semantic.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: /^Keyword/ }).textContent).toMatch(/words you type/);

    await user.click(screen.getByRole("menuitemradio", { name: /^Hybrid/ }));
    expect(onChange).toHaveBeenCalledWith("hybrid");
  });

  it("falls back to Keyword for a mode it doesn't know", () => {
    renderWithProviders(<SearchModeMenu value={"vibes" as never} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Search mode: Keyword" })).toBeTruthy();
  });
});
