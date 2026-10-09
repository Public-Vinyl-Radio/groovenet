// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("./GamdlCookieManager", () => ({ default: () => "cookie manager" }));
vi.mock("./GamdlTestConnection", () => ({ default: () => "test connection" }));

import GamdlSettingsSection from "./GamdlSettingsSection";

describe("GamdlSettingsSection", () => {
  it("switches between cookie management and the connection test", async () => {
    const { user } = renderWithProviders(<GamdlSettingsSection />);
    expect(screen.getByText("cookie manager")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Test Connection" }));
    expect(await screen.findByText("test connection")).toBeTruthy();
  });
});
