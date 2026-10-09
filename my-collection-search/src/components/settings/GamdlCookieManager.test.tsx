// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, chooseMenuItem } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  getCookieStatus: vi.fn(),
  uploadCookieFile: vi.fn(),
  deleteCookieFile: vi.fn(),
}));

vi.mock("@/services/internalApi/cookies", () => ({
  getCookieStatus: mocks.getCookieStatus,
  uploadCookieFile: mocks.uploadCookieFile,
  deleteCookieFile: mocks.deleteCookieFile,
}));

import GamdlCookieManager from "./GamdlCookieManager";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GamdlCookieManager", () => {
  it("says so when there is no cookie file", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    renderWithProviders(<GamdlCookieManager />);
    expect(await screen.findByText("No cookie file found")).toBeTruthy();
  });

  it("shows the active cookie file's details", async () => {
    mocks.getCookieStatus.mockResolvedValue({
      exists: true,
      filename: "cookies.txt",
      size: 2048,
      isValid: true,
      cookieCount: 12,
      hasAppleMusic: true,
      domains: ["music.apple.com"],
    });
    renderWithProviders(<GamdlCookieManager />);

    expect(await screen.findByText("Cookie file active")).toBeTruthy();
    expect(screen.getByText("Valid")).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === "File: cookies.txt")).toBeTruthy();
  });

  it("deletes the cookie file from the actions menu", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: true, filename: "cookies.txt", isValid: true });
    mocks.deleteCookieFile.mockResolvedValue({ message: "Deleted" });
    const { user } = renderWithProviders(<GamdlCookieManager />);
    await screen.findByText("Cookie file active");

    await chooseMenuItem(user, screen.getByRole("button", { name: /Actions/ }), /Delete Cookie File/);

    await waitFor(() => expect(mocks.deleteCookieFile).toHaveBeenCalled());
  });
});
