// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, chooseMenuItem } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  testGamdlConnection: vi.fn(),
}));

vi.mock("@/services/internalApi/settings", () => ({
  testGamdlConnection: mocks.testGamdlConnection,
}));

import GamdlTestConnection from "./GamdlTestConnection";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GamdlTestConnection", () => {
  it("prompts for a test before one has run", () => {
    renderWithProviders(<GamdlTestConnection />);
    expect(screen.getByText(/Click "Test Connection" to verify your gamdl setup/)).toBeTruthy();
  });

  it("runs the test and reports a passing result with its details", async () => {
    mocks.testGamdlConnection.mockResolvedValue({
      success: true,
      message: "All checks passed",
      details: {
        gamdl_available: true,
        cookie_file_exists: true,
        cookie_file_valid: true,
        test_download_attempted: false,
        test_download_success: false,
      },
    });
    const { user } = renderWithProviders(<GamdlTestConnection />);

    await chooseMenuItem(user, screen.getByRole("button", { name: /Actions/ }), /Test Connection/);

    expect(await screen.findByText("All checks passed")).toBeTruthy();
    expect(screen.getAllByText("Found")).toHaveLength(2);
    expect(screen.getByText("Valid")).toBeTruthy();
  });

  it("reports a failing result with the error type", async () => {
    mocks.testGamdlConnection.mockResolvedValue({
      success: false,
      message: "gamdl not found",
      details: {
        gamdl_available: false,
        cookie_file_exists: false,
        cookie_file_valid: false,
        test_download_attempted: false,
        test_download_success: false,
        error_type: "missing_binary",
      },
    });
    const { user } = renderWithProviders(<GamdlTestConnection />);

    await chooseMenuItem(user, screen.getByRole("button", { name: /Actions/ }), /Test Connection/);

    expect(await screen.findByText("gamdl not found")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/missing_binary/)).toBeTruthy());
  });

  it.each([true, false])(
    "reports the test download when it was attempted (success: %s)",
    async (success) => {
      mocks.testGamdlConnection.mockResolvedValue({
        success,
        message: "Download checked",
        details: {
          gamdl_available: true,
          cookie_file_exists: false,
          test_download_attempted: true,
          test_download_success: success,
        },
      });
      const { user } = renderWithProviders(<GamdlTestConnection />);

      await chooseMenuItem(
        user,
        screen.getByRole("button", { name: /Actions/ }),
        /Test Connection/,
      );

      expect(await screen.findByText("Download checked")).toBeTruthy();
      expect(screen.queryByText(/Error Type/)).toBeNull();
    },
  );

  it("shows a neutral badge for a check the server did not report", async () => {
    mocks.testGamdlConnection.mockResolvedValue({
      success: true,
      message: "Partial result",
      details: { gamdl_available: true, cookie_file_exists: true, test_download_attempted: false },
    });
    const { user } = renderWithProviders(<GamdlTestConnection />);

    await chooseMenuItem(user, screen.getByRole("button", { name: /Actions/ }), /Test Connection/);

    expect(await screen.findByText("Partial result")).toBeTruthy();
  });
});
