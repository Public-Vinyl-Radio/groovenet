// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  friend: { id: 2, username: "collector-2" } as { id: number; username: string } | null,
  friendsLoading: false,
  colorModeSetting: "light" as "light" | "dark" | "system",
  fetchAppearanceSettings: vi.fn(),
  fetchAiPromptSettings: vi.fn(),
  getCookieStatus: vi.fn(),
  fetchVersionInfo: vi.fn(),
}));

vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({
    friends: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    friendsLoading: mocks.friendsLoading,
  }),
}));
vi.mock("@/components/ui/color-mode", () => ({
  useColorMode: () => ({ colorModeSetting: mocks.colorModeSetting }),
}));
vi.mock("@/services/internalApi/settings", () => ({
  fetchAppearanceSettings: mocks.fetchAppearanceSettings,
  fetchAiPromptSettings: mocks.fetchAiPromptSettings,
  updateAppearanceSettings: vi.fn(),
}));
vi.mock("@/services/internalApi/cookies", () => ({ getCookieStatus: mocks.getCookieStatus }));
vi.mock("@/services/internalApi/system", () => ({
  fetchVersionInfo: mocks.fetchVersionInfo,
  fetchStatusInfo: vi.fn(),
  fetchUpdateInfo: vi.fn(),
}));

import {
  aboutSummary,
  aiMetadataSummary,
  appearanceSummary,
  appleMusicSummary,
  librariesSummary,
  useSettingsSummaries,
} from "./settingsSummaries";

function renderSummaries() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useSettingsSummaries(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("settings summaries", () => {
  it("says the palette and this device's mode", () => {
    expect(appearanceSummary("mono", "light")).toBe("Mono · light on this device");
    expect(appearanceSummary("sleeve", "dark")).toBe("Sleeve · dark on this device");
    expect(appearanceSummary("custom", "system")).toBe("Custom · follows this device");
  });

  it("counts libraries and names the default", () => {
    expect(librariesSummary(4, "collector-2")).toBe("4 libraries · default collector-2");
    expect(librariesSummary(1, null)).toBe("1 library");
  });

  it("describes the cookie file, the prompt and the version", () => {
    expect(appleMusicSummary(false)).toBe("No cookie file");
    expect(appleMusicSummary(true)).toBe("Cookie file uploaded");
    expect(aiMetadataSummary(false)).toBe("Custom prompt");
    expect(aiMetadataSummary(true)).toBe("Default prompt");
    expect(aboutSummary("0.3.15")).toBe("Version 0.3.15");
  });
});

describe("useSettingsSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.friend = { id: 2, username: "collector-2" };
    mocks.friendsLoading = false;
    mocks.colorModeSetting = "light";
    mocks.fetchAppearanceSettings.mockResolvedValue({ palette: "mono", customPalette: null });
    mocks.fetchAiPromptSettings.mockResolvedValue({
      prompt: "x",
      defaultPrompt: "y",
      isDefault: false,
    });
    mocks.getCookieStatus.mockResolvedValue({ exists: false });
    mocks.fetchVersionInfo.mockResolvedValue({ version: "0.3.15" });
  });

  it("reads each row's value from the real settings", async () => {
    const { result } = renderSummaries();
    await waitFor(() => expect(result.current.about).toBe("Version 0.3.15"));
    await waitFor(() => expect(result.current["ai-metadata"]).toBe("Custom prompt"));
    expect(result.current).toEqual({
      appearance: "Mono · light on this device",
      libraries: "4 libraries · default collector-2",
      "apple-music": "No cookie file",
      "ai-metadata": "Custom prompt",
      about: "Version 0.3.15",
    });
    expect(mocks.fetchAiPromptSettings).toHaveBeenCalledWith({ friend_id: 2 });
  });

  it("leaves a value out until it has loaded", () => {
    mocks.friend = null;
    mocks.friendsLoading = true;
    mocks.fetchAppearanceSettings.mockReturnValue(new Promise(() => {}));
    mocks.getCookieStatus.mockReturnValue(new Promise(() => {}));
    mocks.fetchVersionInfo.mockReturnValue(new Promise(() => {}));
    const { result } = renderSummaries();
    expect(result.current.appearance).toBeUndefined();
    expect(result.current.libraries).toBeUndefined();
    expect(result.current["apple-music"]).toBeUndefined();
    expect(result.current["ai-metadata"]).toBeUndefined();
    expect(result.current.about).toBeUndefined();
    // No library to ask about yet, so no prompt request.
    expect(mocks.fetchAiPromptSettings).not.toHaveBeenCalled();
  });
});
