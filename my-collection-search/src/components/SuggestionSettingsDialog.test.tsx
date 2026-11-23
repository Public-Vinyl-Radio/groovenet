// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { PRESET_LIST } from "@/lib/ranking/profiles";
import SuggestionSettingsDialog, {
  SuggestionSettingsButton,
  suggestionSettingsSummary,
} from "./SuggestionSettingsDialog";

describe("SuggestionSettingsDialog (#1231)", () => {
  it("shows only the settings a list passes", async () => {
    const onScope = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionSettingsDialog
        open
        onOpenChange={vi.fn()}
        id="panel"
        scope={{ value: "library", onChange: onScope }}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Suggestion settings" });
    expect(within(dialog).queryByLabelText("Ranking")).toBeNull();
    await user.click(within(dialog).getByText("All libraries"));
    expect(onScope).toHaveBeenCalledWith("all");
  });

  it("takes a ranking alone, and a title", async () => {
    const onRanking = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionSettingsDialog
        open
        onOpenChange={vi.fn()}
        id="panel"
        title="Panel settings"
        ranking={{ value: "default", options: PRESET_LIST, onChange: onRanking }}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Panel settings" });
    expect(within(dialog).queryByText("Libraries")).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText("Ranking"), "selector");
    expect(onRanking).toHaveBeenCalledWith("selector");
  });

  it("closes from its close button", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <SuggestionSettingsDialog open onOpenChange={onOpenChange} id="x" />,
    );
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has a named settings button and a plain-text summary", async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(<SuggestionSettingsButton onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Suggestion settings" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(suggestionSettingsSummary({ rankingName: "Selector", scope: "all" })).toBe(
      "Selector · All libraries",
    );
    expect(suggestionSettingsSummary({ scope: "library" })).toBe("This library");
    expect(suggestionSettingsSummary({})).toBe("");
  });
});

describe("SuggestionSettingsButton on ink", () => {
  it("draws on the dialog strip, and still opens the settings", async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(<SuggestionSettingsButton onInk onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Suggestion settings" });
    expect(getComputedStyle(button).height).toBe("44px");
    await user.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});
