import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDefaultPrompt } = vi.hoisted(() => ({
  mockGetDefaultPrompt: vi.fn(() => "DEFAULT_PROMPT"),
}));

const { mockFindById } = vi.hoisted(() => ({ mockFindById: vi.fn() }));

const repo = vi.hoisted(() => ({
  findDefaultLibraryFriendId: vi.fn(),
  upsertDefaultLibraryFriendId: vi.fn(),
  findAiPromptByFriendId: vi.fn(),
  deleteAiPrompt: vi.fn(),
  upsertAiPrompt: vi.fn(),
  ensureGamdlSettings: vi.fn(),
  findGamdlSettingsByFriendId: vi.fn(),
  updateGamdlSettings: vi.fn(),
  resetGamdlSettings: vi.fn(),
  findRecommendationScope: vi.fn(),
  upsertRecommendationScope: vi.fn(),
}));

vi.mock("@/lib/serverPrompts", () => ({
  getDefaultTrackMetadataPrompt: mockGetDefaultPrompt,
}));
vi.mock("@/server/repositories/friendRepository", () => ({
  friendRepository: { findById: mockFindById },
}));
vi.mock("@/server/repositories/settingsRepository", () => ({
  settingsRepository: repo,
}));

import { settingsService } from "../settingsService";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDefaultPrompt.mockReturnValue("DEFAULT_PROMPT");
});

// ─── Default library ──────────────────────────────────────────────────────────

describe("SettingsService — default library", () => {
  it("returns the stored default library friend_id", async () => {
    repo.findDefaultLibraryFriendId.mockResolvedValueOnce(5);
    await expect(settingsService.getDefaultLibrary()).resolves.toEqual({ friend_id: 5 });
  });

  it("throws when updating to a non-existent library", async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(settingsService.updateDefaultLibrary(9)).rejects.toThrow(/does not exist/);
    expect(repo.upsertDefaultLibraryFriendId).not.toHaveBeenCalled();
  });

  it("upserts the default library when the friend exists", async () => {
    mockFindById.mockResolvedValueOnce({ id: 3, username: "alice" });
    repo.upsertDefaultLibraryFriendId.mockResolvedValueOnce(3);
    await expect(settingsService.updateDefaultLibrary(3)).resolves.toEqual({ friend_id: 3 });
    expect(repo.upsertDefaultLibraryFriendId).toHaveBeenCalledWith(3);
  });
});

// ─── Suggestion scope ─────────────────────────────────────────────────────────

describe("SettingsService — suggestion scope", () => {
  it("defaults a library that never chose to its own library", async () => {
    repo.findRecommendationScope.mockResolvedValueOnce(null);
    await expect(settingsService.getRecommendationSettings(4)).resolves.toEqual({
      friend_id: 4,
      scope: "library",
      isDefault: true,
    });
  });

  it("returns a saved choice", async () => {
    repo.findRecommendationScope.mockResolvedValueOnce("all");
    await expect(settingsService.getRecommendationSettings(4)).resolves.toEqual({
      friend_id: 4,
      scope: "all",
      isDefault: false,
    });
  });

  it("saves a choice for an existing library", async () => {
    mockFindById.mockResolvedValueOnce({ id: 4, username: "dj" });
    repo.upsertRecommendationScope.mockResolvedValueOnce("all");
    await expect(settingsService.updateRecommendationSettings(4, "all")).resolves.toEqual({
      friend_id: 4,
      scope: "all",
      isDefault: false,
    });
    expect(repo.upsertRecommendationScope).toHaveBeenCalledWith(4, "all");
  });

  it("refuses a library that doesn't exist", async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(settingsService.updateRecommendationSettings(99, "all")).rejects.toThrow(/does not exist/);
    expect(repo.upsertRecommendationScope).not.toHaveBeenCalled();
  });

  it("resolves a request's scope from the saved setting when it names none", async () => {
    repo.findRecommendationScope.mockResolvedValueOnce(null);
    await expect(settingsService.resolveRecommendationScope(4)).resolves.toEqual({ scope: "library", libraryFriendId: 4 });

    repo.findRecommendationScope.mockResolvedValueOnce("all");
    await expect(settingsService.resolveRecommendationScope(4)).resolves.toEqual({ scope: "all", libraryFriendId: null });
  });

  it("lets a request's own scope win without reading the setting", async () => {
    await expect(settingsService.resolveRecommendationScope(4, "library")).resolves.toEqual({
      scope: "library",
      libraryFriendId: 4,
    });
    expect(repo.findRecommendationScope).not.toHaveBeenCalled();
  });
});

// ─── AI prompt ──────────────────────────────────────────────────────────────

describe("SettingsService — AI prompt", () => {
  it("returns the default prompt when no friendId is given", async () => {
    const res = await settingsService.getAiPrompt();
    expect(res).toEqual({
      prompt: "DEFAULT_PROMPT",
      defaultPrompt: "DEFAULT_PROMPT",
      isDefault: true,
    });
    expect(repo.findAiPromptByFriendId).not.toHaveBeenCalled();
  });

  it("returns a stored prompt as non-default", async () => {
    repo.findAiPromptByFriendId.mockResolvedValueOnce("CUSTOM");
    const res = await settingsService.getAiPrompt(1);
    expect(res).toEqual({
      prompt: "CUSTOM",
      defaultPrompt: "DEFAULT_PROMPT",
      isDefault: false,
    });
  });

  it("falls back to the default when the friend has no stored prompt", async () => {
    repo.findAiPromptByFriendId.mockResolvedValueOnce(null);
    const res = await settingsService.getAiPrompt(1);
    expect(res.isDefault).toBe(true);
    expect(res.prompt).toBe("DEFAULT_PROMPT");
  });

  it("deletes the override and returns default when the new prompt is blank", async () => {
    const res = await settingsService.updateAiPrompt(1, "   ");
    expect(repo.deleteAiPrompt).toHaveBeenCalledWith(1);
    expect(repo.upsertAiPrompt).not.toHaveBeenCalled();
    expect(res).toEqual({ prompt: "DEFAULT_PROMPT", isDefault: true });
  });

  it("trims and upserts a non-blank prompt", async () => {
    repo.upsertAiPrompt.mockResolvedValueOnce("saved");
    const res = await settingsService.updateAiPrompt(1, "  hello  ");
    expect(repo.upsertAiPrompt).toHaveBeenCalledWith(1, "hello");
    expect(res).toEqual({ prompt: "saved", isDefault: false });
  });
});

// ─── Gamdl settings ─────────────────────────────────────────────────────────

describe("SettingsService — gamdl settings", () => {
  it("ensures then returns gamdl settings", async () => {
    const settings = { friend_id: 1, cookies_path: "/c" };
    repo.findGamdlSettingsByFriendId.mockResolvedValueOnce(settings);
    await expect(settingsService.getGamdlSettings(1)).resolves.toBe(settings);
    expect(repo.ensureGamdlSettings).toHaveBeenCalledWith(1);
  });

  it("throws if gamdl settings cannot be created/retrieved", async () => {
    repo.findGamdlSettingsByFriendId.mockResolvedValueOnce(null);
    await expect(settingsService.getGamdlSettings(1)).rejects.toThrow(/create or retrieve/);
  });

  it("ensures then applies gamdl updates", async () => {
    repo.updateGamdlSettings.mockResolvedValueOnce({ friend_id: 1 });
    const res = await settingsService.updateGamdlSettings(1, { audio_format: "mp3" });
    expect(repo.ensureGamdlSettings).toHaveBeenCalledWith(1);
    expect(repo.updateGamdlSettings).toHaveBeenCalledWith(1, { audio_format: "mp3" });
    expect(res).toEqual({ friend_id: 1 });
  });

  it("throws when reset returns nothing", async () => {
    repo.resetGamdlSettings.mockResolvedValueOnce(null);
    await expect(settingsService.resetGamdlSettings(1)).rejects.toThrow(/reset settings/);
  });

  it("returns the reset settings on success", async () => {
    const reset = { friend_id: 1, cookies_path: null };
    repo.resetGamdlSettings.mockResolvedValueOnce(reset);
    await expect(settingsService.resetGamdlSettings(1)).resolves.toBe(reset);
  });
});
