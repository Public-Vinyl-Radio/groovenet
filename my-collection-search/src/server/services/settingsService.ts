import type {
  DefaultLibrarySettings,
  DefaultLibrarySettingsUpdateResponse,
} from "@groovenet/contracts";
import {
  defaultFontChoiceId,
  fontRoleIds,
  resolveFontChoice,
  type FontRoleId,
  type FontSelection,
} from "@/app/fontChoices";
import { defaultPaletteId, resolvePaletteId, type PaletteId } from "@/app/palettes";
import { getDefaultTrackMetadataPrompt } from "@/lib/serverPrompts";
import { friendRepository } from "@/server/repositories/friendRepository";
import type { GamdlSettings, GamdlSettingsUpdate } from "@/types/gamdl";
import {
  settingsRepository,
  type AppearancePatch,
  type AppearanceRow,
} from "@/server/repositories/settingsRepository";
import {
  DEFAULT_RECOMMENDATION_SCOPE,
  type RecommendationScope,
} from "@/types/recommendations";

export interface Appearance {
  palette: PaletteId;
  fonts: FontSelection;
}

export interface AppearanceUpdate {
  palette?: PaletteId;
  fonts?: Partial<FontSelection>;
}

const FONT_COLUMNS = {
  display: "font_display",
  body: "font_body",
  label: "font_label",
} as const satisfies Record<FontRoleId, keyof AppearanceRow>;

function toAppearance(row: AppearanceRow | null): Appearance {
  return {
    palette: resolvePaletteId(row?.palette),
    fonts: Object.fromEntries(
      fontRoleIds.map((role) => [role, resolveFontChoice(role, row?.[FONT_COLUMNS[role]])])
    ) as FontSelection,
  };
}

export class SettingsService {
  async getDefaultLibrary(): Promise<DefaultLibrarySettings> {
    const friend_id = await settingsRepository.findDefaultLibraryFriendId();
    return { friend_id };
  }

  async updateDefaultLibrary(
    friendId: number
  ): Promise<DefaultLibrarySettingsUpdateResponse> {
    const friend = await friendRepository.findById(friendId);
    if (!friend) {
      throw new Error(`Library ${friendId} does not exist`);
    }
    const friend_id = await settingsRepository.upsertDefaultLibraryFriendId(
      friendId
    );
    return { friend_id };
  }

  /** The shared palette and fonts; an unset or no-longer-registered id is the default. */
  async getAppearance(): Promise<Appearance> {
    return toAppearance(await settingsRepository.findAppearance());
  }

  /**
   * Changes only what is supplied. A font set to the default is stored as null,
   * so it keeps following the app's default if that ever changes.
   */
  async updateAppearance(update: AppearanceUpdate): Promise<Appearance> {
    const patch: AppearancePatch = {};
    if (update.palette !== undefined) patch.palette = update.palette;
    for (const role of fontRoleIds) {
      const choice = update.fonts?.[role];
      if (choice !== undefined) {
        patch[FONT_COLUMNS[role]] = choice === defaultFontChoiceId ? null : choice;
      }
    }
    return toAppearance(await settingsRepository.upsertAppearance(patch, defaultPaletteId));
  }

  async getAiPrompt(friendId?: number): Promise<{
    prompt: string;
    defaultPrompt: string;
    isDefault: boolean;
  }> {
    const defaultPrompt = getDefaultTrackMetadataPrompt();
    if (!friendId) {
      return { prompt: defaultPrompt, defaultPrompt, isDefault: true };
    }

    const prompt = await settingsRepository.findAiPromptByFriendId(friendId);
    if (prompt) {
      return { prompt, defaultPrompt, isDefault: false };
    }

    return { prompt: defaultPrompt, defaultPrompt, isDefault: true };
  }

  async updateAiPrompt(friendId: number, promptRaw: string): Promise<{
    prompt: string;
    isDefault: boolean;
  }> {
    const prompt = promptRaw.trim();
    if (!prompt) {
      await settingsRepository.deleteAiPrompt(friendId);
      return { prompt: getDefaultTrackMetadataPrompt(), isDefault: true };
    }

    const savedPrompt = await settingsRepository.upsertAiPrompt(friendId, prompt);
    return { prompt: savedPrompt, isDefault: false };
  }

  /** A library's suggestion scope; `isDefault` when it has never been set. */
  async getRecommendationSettings(friendId: number): Promise<{
    friend_id: number;
    scope: RecommendationScope;
    isDefault: boolean;
  }> {
    const scope = await settingsRepository.findRecommendationScope(friendId);
    return {
      friend_id: friendId,
      scope: scope ?? DEFAULT_RECOMMENDATION_SCOPE,
      isDefault: scope === null,
    };
  }

  /**
   * The scope a suggestion request runs with: the caller's choice when given,
   * else the library's saved setting. `libraryFriendId` is null for `all`.
   */
  async resolveRecommendationScope(
    libraryFriendId: number,
    requested?: RecommendationScope
  ): Promise<{ scope: RecommendationScope; libraryFriendId: number | null }> {
    const scope = requested ?? (await this.getRecommendationSettings(libraryFriendId)).scope;
    return { scope, libraryFriendId: scope === "library" ? libraryFriendId : null };
  }

  async updateRecommendationSettings(
    friendId: number,
    scope: RecommendationScope
  ): Promise<{ friend_id: number; scope: RecommendationScope; isDefault: false }> {
    const friend = await friendRepository.findById(friendId);
    if (!friend) {
      throw new Error(`Library ${friendId} does not exist`);
    }
    const saved = await settingsRepository.upsertRecommendationScope(friendId, scope);
    return { friend_id: friendId, scope: saved, isDefault: false };
  }

  async getGamdlSettings(friendId: number): Promise<GamdlSettings> {
    await settingsRepository.ensureGamdlSettings(friendId);
    const settings = await settingsRepository.findGamdlSettingsByFriendId(friendId);
    if (!settings) {
      throw new Error("Failed to create or retrieve settings");
    }
    return settings;
  }

  async updateGamdlSettings(
    friendId: number,
    updates: GamdlSettingsUpdate
  ): Promise<GamdlSettings | null> {
    await settingsRepository.ensureGamdlSettings(friendId);
    return settingsRepository.updateGamdlSettings(friendId, updates);
  }

  async resetGamdlSettings(friendId: number): Promise<GamdlSettings> {
    const settings = await settingsRepository.resetGamdlSettings(friendId);
    if (!settings) {
      throw new Error("Failed to reset settings");
    }
    return settings;
  }
}

export const settingsService = new SettingsService();
