// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchAiPromptSettings: vi.fn(),
  updateAiPromptSettings: vi.fn(),
  toast: vi.fn(),
  friend: { id: 7, username: "dj-friend" } as { id: number; username: string } | null,
}));

vi.mock("@/services/internalApi/settings", () => ({
  fetchAiPromptSettings: mocks.fetchAiPromptSettings,
  updateAiPromptSettings: mocks.updateAiPromptSettings,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: mocks.friend }),
}));
vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({
    friends: [
      { id: 7, username: "dj-friend" },
      { id: 9, username: "other" },
    ],
  }),
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import AiPromptSettingsSection from "./AiPromptSettingsSection";

const prompt = () =>
  screen.getByLabelText("Prompt", { selector: "textarea" }) as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.friend = { id: 7, username: "dj-friend" };
  mocks.fetchAiPromptSettings.mockResolvedValue({
    prompt: "",
    defaultPrompt: 'Describe the track.\n{\n  "genres": []\n}',
    isDefault: true,
  });
});

describe("AiPromptSettingsSection", () => {
  it("loads the default prompt for the current library and marks it Default", async () => {
    renderWithProviders(<AiPromptSettingsSection />);
    expect(await screen.findByText("Default")).toBeTruthy();
    expect(mocks.fetchAiPromptSettings).toHaveBeenCalledWith({ friend_id: 7 });
    await waitFor(() => expect(prompt().value).toContain("Describe the track."));
    expect(prompt().rows).toBeGreaterThanOrEqual(8);
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    expect(screen.getByText(/JSON field names/)).toBeTruthy();
  });

  it("saves on blur and offers undo, which restores the default", async () => {
    mocks.updateAiPromptSettings
      .mockResolvedValueOnce({ prompt: "Custom prompt", isDefault: false })
      .mockResolvedValueOnce({ prompt: "", isDefault: true });
    renderWithProviders(<AiPromptSettingsSection />);
    await screen.findByText("Default");
    await waitFor(() => expect(prompt().value).not.toBe(""));

    fireEvent.change(prompt(), { target: { value: "Custom prompt" } });
    fireEvent.blur(prompt());

    await waitFor(() =>
      expect(mocks.updateAiPromptSettings).toHaveBeenCalledWith({
        friend_id: 7,
        prompt: "Custom prompt",
      }),
    );
    expect(await screen.findByText(/^Saved · \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("Custom")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(mocks.updateAiPromptSettings).toHaveBeenLastCalledWith({ friend_id: 7, prompt: "" }),
    );
    expect(await screen.findByText("Default")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("does not save when the text is unchanged", async () => {
    renderWithProviders(<AiPromptSettingsSection />);
    await screen.findByText("Default");
    await waitFor(() => expect(prompt().value).not.toBe(""));
    fireEvent.blur(prompt());
    expect(mocks.updateAiPromptSettings).not.toHaveBeenCalled();
  });

  it("resets a custom prompt to the default at once, with undo back to it", async () => {
    mocks.fetchAiPromptSettings.mockResolvedValue({
      prompt: "Mine",
      defaultPrompt: "Default text",
      isDefault: false,
    });
    mocks.updateAiPromptSettings
      .mockResolvedValueOnce({ prompt: "", isDefault: true })
      .mockResolvedValueOnce({ prompt: "Mine", isDefault: false });
    renderWithProviders(<AiPromptSettingsSection />);
    await screen.findByText("Custom");

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() =>
      expect(mocks.updateAiPromptSettings).toHaveBeenCalledWith({ friend_id: 7, prompt: "" }),
    );
    await waitFor(() => expect(prompt().value).toBe("Default text"));

    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(mocks.updateAiPromptSettings).toHaveBeenLastCalledWith({
        friend_id: 7,
        prompt: "Mine",
      }),
    );
    await waitFor(() => expect(prompt().value).toBe("Mine"));
  });

  it("loads another library's prompt from the picker", async () => {
    renderWithProviders(<AiPromptSettingsSection />);
    await screen.findByText("Default");
    fireEvent.change(screen.getByRole("combobox", { name: "Prompt for" }), {
      target: { value: "9" },
    });
    await waitFor(() =>
      expect(mocks.fetchAiPromptSettings).toHaveBeenLastCalledWith({ friend_id: 9 }),
    );
  });

  it("warns instead of saving when no library is selected", async () => {
    mocks.friend = null;
    renderWithProviders(<AiPromptSettingsSection />);
    await waitFor(() => expect(prompt().value).not.toBe(""));
    fireEvent.change(prompt(), { target: { value: "x" } });
    fireEvent.blur(prompt());
    expect(mocks.updateAiPromptSettings).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "warning" }));
  });

  it("reports a failed load and a failed save", async () => {
    mocks.fetchAiPromptSettings.mockRejectedValueOnce(new Error("down"));
    renderWithProviders(<AiPromptSettingsSection />);
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to load AI prompt", description: "down" }),
      ),
    );

    mocks.updateAiPromptSettings.mockRejectedValueOnce(new Error("boom"));
    fireEvent.change(prompt(), { target: { value: "x" } });
    fireEvent.blur(prompt());
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to save prompt", description: "boom" }),
      ),
    );
  });
});
