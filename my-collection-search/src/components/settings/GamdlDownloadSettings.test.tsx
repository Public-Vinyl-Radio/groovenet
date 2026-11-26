// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const mocks = vi.hoisted(() => ({
  friend: { id: 2 } as { id: number } | null,
  fetch: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/services/internalApi/settings", () => ({
  fetchGamdlSettings: mocks.fetch,
  updateGamdlSettings: mocks.update,
}));
import GamdlDownloadSettings from "./GamdlDownloadSettings";
const settings = {
  id: 1,
  friend_id: 2,
  audio_quality: "best",
  sample_rate_cap: 48000,
  lossless_fallback: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.friend = { id: 2 };
  mocks.fetch.mockResolvedValue({ settings });
  mocks.update.mockImplementation(async (changes) => ({
    success: true,
    settings: { ...settings, ...changes },
  }));
});

describe("lossless download settings", () => {
  it("requires a selected library", () => {
    mocks.friend = null;
    renderWithProviders(<GamdlDownloadSettings />);
    expect(screen.getByText(/Select a library/)).toBeTruthy();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("shows loading and a clear load error", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    renderWithProviders(<GamdlDownloadSettings />);
    expect(screen.getByLabelText("Loading download settings")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load");
  });
  it("loads 48 kHz and AAC retry defaults and has no unused format control", async () => {
    renderWithProviders(<GamdlDownloadSettings />);
    const quality = await screen.findByRole("combobox", { name: "Download quality" });
    expect((quality as HTMLSelectElement).value).toBe("best");
    expect(
      (screen.getByRole("combobox", { name: "Lossless sample-rate cap" }) as HTMLSelectElement)
        .value,
    ).toBe("48000");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Audio format")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledWith(2);
  });
  it("saves quality and cap changes for the selected library", async () => {
    renderWithProviders(<GamdlDownloadSettings />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Download quality" }), {
      target: { value: "lossless" },
    });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ friend_id: 2, audio_quality: "lossless" }),
    );
    await screen.findByRole("status");
    fireEvent.change(screen.getByRole("combobox", { name: "Lossless sample-rate cap" }), {
      target: { value: "96000" },
    });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith({ friend_id: 2, sample_rate_cap: 96000 }),
    );
    await screen.findByRole("status");
  });
  it("saves both retry choices", async () => {
    const { user } = renderWithProviders(<GamdlDownloadSettings />);
    await screen.findByRole("combobox", { name: "Download quality" });
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith({ friend_id: 2, lossless_fallback: false }),
    );
    await screen.findByRole("status");
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith({ friend_id: 2, lossless_fallback: true }),
    );
  });
  it("disables controls during save and reports a failed save", async () => {
    let reject!: (error: Error) => void;
    mocks.update.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    renderWithProviders(<GamdlDownloadSettings />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Download quality" }), {
      target: { value: "lossless" },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("combobox", { name: "Download quality" }) as HTMLSelectElement).disabled,
      ).toBe(true),
    );
    expect(
      (screen.getByRole("combobox", { name: "Lossless sample-rate cap" }) as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    reject(new Error("offline"));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not save");
  });
});
