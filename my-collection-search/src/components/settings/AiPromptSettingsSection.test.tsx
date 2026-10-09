// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchAiPromptSettings: vi.fn(),
  updateAiPromptSettings: vi.fn(),
  friend: { id: 7, username: "dj-friend" } as { id: number; username: string } | null,
}));

vi.mock("@/services/internalApi/settings", () => ({
  fetchAiPromptSettings: mocks.fetchAiPromptSettings,
  updateAiPromptSettings: mocks.updateAiPromptSettings,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: mocks.friend }),
}));

import AiPromptSettingsSection from "./AiPromptSettingsSection";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.friend = { id: 7, username: "dj-friend" };
  mocks.fetchAiPromptSettings.mockResolvedValue({
    prompt: "", defaultPrompt: "Describe the track.", isDefault: true,
  });
});

describe("AiPromptSettingsSection", () => {
  it("loads the default prompt state for the selected library", async () => {
    renderWithProviders(<AiPromptSettingsSection />);
    expect(await screen.findByText("Using default prompt")).toBeTruthy();
    expect(mocks.fetchAiPromptSettings).toHaveBeenCalledWith({ friend_id: 7 });
  });

  it("saves a custom prompt and shows it as active", async () => {
    mocks.updateAiPromptSettings.mockResolvedValue({ prompt: "Custom prompt", isDefault: false });
    const { user } = renderWithProviders(<AiPromptSettingsSection />);
    await screen.findByText("Using default prompt");

    await user.type(screen.getByPlaceholderText("Enter your AI system prompt..."), "Custom prompt");
    await user.click(screen.getByRole("button", { name: "Save Prompt" }));

    await waitFor(() =>
      expect(mocks.updateAiPromptSettings).toHaveBeenCalledWith({ friend_id: 7, prompt: "Custom prompt" })
    );
    expect(await screen.findByText("Custom prompt active")).toBeTruthy();
  });

  it("warns instead of saving when no library is selected", async () => {
    mocks.friend = null;
    const { user } = renderWithProviders(<AiPromptSettingsSection />);
    await screen.findByText("Using default prompt");

    await user.click(screen.getByRole("button", { name: "Save Prompt" }));

    expect(mocks.updateAiPromptSettings).not.toHaveBeenCalled();
  });
});
