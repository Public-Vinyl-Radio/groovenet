// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SettingsRow from "./SettingsRow";

describe("SettingsRow", () => {
  it("names its control with the label and describes it with the help", () => {
    renderWithProviders(
      <SettingsRow label="Suggestions" help="Where suggestions come from.">
        <button type="button">This library</button>
      </SettingsRow>,
    );
    const row = screen.getByRole("group", { name: "Suggestions" });
    expect(row.getAttribute("aria-describedby")).toBe(
      screen.getByText("Where suggestions come from.").id,
    );
    expect(screen.getByRole("button", { name: "This library" })).toBeTruthy();
  });

  it("has no description or rule unless asked", () => {
    renderWithProviders(
      <SettingsRow label="Corners">
        <span>control</span>
      </SettingsRow>,
    );
    const row = screen.getByRole("group", { name: "Corners" });
    expect(row.hasAttribute("aria-describedby")).toBe(false);
  });

  it("can follow another row with a rule", () => {
    renderWithProviders(
      <>
        <SettingsRow label="Palette">
          <span>control</span>
        </SettingsRow>
        <SettingsRow label="Light or dark" divider>
          <span>control</span>
        </SettingsRow>
      </>,
    );
    const [first, second] = screen.getAllByTestId("settings-row");
    // Same row, so the rule is the only style between them.
    expect(second.className).not.toBe(first.className);
  });
});
