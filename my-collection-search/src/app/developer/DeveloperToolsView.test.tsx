// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import DeveloperToolsView from "./DeveloperToolsView";

describe("DeveloperToolsView", () => {
  it("titles the page through the shared header and lists the tools", () => {
    renderWithProviders(<DeveloperToolsView storybookUrl={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Developer tools" })).toBeTruthy();
    expect(screen.getByText("Swagger console")).toBeTruthy();
    expect(screen.queryByText("Storybook")).toBeNull();
  });

  it("adds the Storybook card when a URL is configured", () => {
    renderWithProviders(<DeveloperToolsView storybookUrl="http://localhost:6006" />);
    expect(screen.getByText("Storybook")).toBeTruthy();
  });
});
