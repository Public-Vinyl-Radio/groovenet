// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  getCookieStatus: vi.fn(),
  uploadCookieFile: vi.fn(),
  deleteCookieFile: vi.fn(),
  testGamdlConnection: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/services/internalApi/cookies", () => ({
  getCookieStatus: mocks.getCookieStatus,
  uploadCookieFile: mocks.uploadCookieFile,
  deleteCookieFile: mocks.deleteCookieFile,
}));
vi.mock("@/services/internalApi/settings", () => ({
  testGamdlConnection: mocks.testGamdlConnection,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import AppleMusicSettingsSection from "./AppleMusicSettingsSection";

const present = {
  exists: true,
  isValid: true,
  filename: "cookies.txt",
  lastModified: "2026-10-30T12:00:00.000Z",
};

const file = (name: string) => new File(["# cookies"], name, { type: "text/plain" });
const fileInput = () => screen.getByLabelText("Cookie file", { selector: "input" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AppleMusicSettingsSection", () => {
  it("shows no cookie file and keeps the connection test disabled", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    renderWithProviders(<AppleMusicSettingsSection />);
    expect(await screen.findByText("No cookie file")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload cookies.txt" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Test connection" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("shows the upload date and offers replace and remove", async () => {
    mocks.getCookieStatus.mockResolvedValue(present);
    renderWithProviders(<AppleMusicSettingsSection />);
    expect(await screen.findByText(/^Uploaded \w/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace cookies.txt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("shows an uploaded file without a date", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: true, isValid: true });
    renderWithProviders(<AppleMusicSettingsSection />);
    expect(await screen.findByText("Uploaded")).toBeTruthy();
  });

  it("flags an invalid cookie file and lists the problems", async () => {
    mocks.getCookieStatus.mockResolvedValue({
      exists: true,
      isValid: false,
      validationErrors: ["No Apple Music cookies"],
    });
    renderWithProviders(<AppleMusicSettingsSection />);
    expect(await screen.findByText("Invalid cookie file")).toBeTruthy();
    expect(screen.getByText("No Apple Music cookies")).toBeTruthy();
  });

  it("uploads a chosen .txt file", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    mocks.uploadCookieFile.mockResolvedValue({ message: "ok", cookieInfo: present });
    renderWithProviders(<AppleMusicSettingsSection />);
    await screen.findByText("No cookie file");
    fireEvent.change(fileInput(), { target: { files: [file("cookies.txt")] } });
    await waitFor(() => expect(mocks.uploadCookieFile).toHaveBeenCalled());
    expect(mocks.uploadCookieFile.mock.calls[0][0].name).toBe("cookies.txt");
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" })),
    );
  });

  it("rejects a file that is not .txt", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    renderWithProviders(<AppleMusicSettingsSection />);
    await screen.findByText("No cookie file");
    fireEvent.change(fileInput(), { target: { files: [file("cookies.json")] } });
    expect(mocks.uploadCookieFile).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("ignores a cancelled file dialog", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    renderWithProviders(<AppleMusicSettingsSection />);
    await screen.findByText("No cookie file");
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(mocks.uploadCookieFile).not.toHaveBeenCalled();
  });

  it("reports a failed upload", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    mocks.uploadCookieFile.mockRejectedValue(new Error("too big"));
    renderWithProviders(<AppleMusicSettingsSection />);
    await screen.findByText("No cookie file");
    fireEvent.change(fileInput(), { target: { files: [file("cookies.txt")] } });
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Upload failed", description: "too big" }),
      ),
    );
  });

  it("opens the file picker from the upload button", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    const { user } = renderWithProviders(<AppleMusicSettingsSection />);
    await screen.findByText("No cookie file");
    const click = vi.spyOn(fileInput() as HTMLInputElement, "click");
    await user.click(screen.getByRole("button", { name: "Upload cookies.txt" }));
    expect(click).toHaveBeenCalled();
  });

  it("removes the cookie file", async () => {
    mocks.getCookieStatus.mockResolvedValue(present);
    mocks.deleteCookieFile.mockResolvedValue({ message: "gone" });
    const { user } = renderWithProviders(<AppleMusicSettingsSection />);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.deleteCookieFile).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" })),
    );
  });

  it("reports a failed remove", async () => {
    mocks.getCookieStatus.mockResolvedValue(present);
    mocks.deleteCookieFile.mockRejectedValue(new Error("nope"));
    const { user } = renderWithProviders(<AppleMusicSettingsSection />);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Remove failed" })),
    );
  });

  it("shows a passing connection test inline", async () => {
    mocks.getCookieStatus.mockResolvedValue(present);
    mocks.testGamdlConnection.mockResolvedValue({
      success: true,
      message: "All good",
      details: {},
    });
    const { user } = renderWithProviders(<AppleMusicSettingsSection />);
    const button = await screen.findByRole("button", { name: "Test connection" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await user.click(button);
    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(screen.getByText("All good")).toBeTruthy();
  });

  it("shows a failing connection test, and a request error", async () => {
    mocks.getCookieStatus.mockResolvedValue(present);
    mocks.testGamdlConnection.mockResolvedValueOnce({
      success: false,
      message: "Cookies rejected",
      details: {},
    });
    const { user } = renderWithProviders(<AppleMusicSettingsSection />);
    const button = await screen.findByRole("button", { name: "Test connection" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await user.click(button);
    expect(await screen.findByText("Cookies rejected")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();

    mocks.testGamdlConnection.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("offline")).toBeTruthy();
  });

  it("lists the steps once, numbered, with the expiry note", async () => {
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    renderWithProviders(<AppleMusicSettingsSection />);
    expect(screen.getByText("Get your cookies")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Cookies expire/)).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain("gamdl");
  });
});
