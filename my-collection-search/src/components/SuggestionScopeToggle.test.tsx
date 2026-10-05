// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SuggestionScopeToggle from "./SuggestionScopeToggle";

describe("SuggestionScopeToggle", () => {
  it("shows the current scope and reports a change", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<SuggestionScopeToggle value="library" onChange={onChange} />);

    expect((screen.getByRole("radio", { name: "This library", hidden: true }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByText("All libraries"));

    expect(onChange).toHaveBeenCalledWith("all");
  });
});
