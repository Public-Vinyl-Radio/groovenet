/**
 * A stand-in for `@/hooks/useRankingProfiles` in component tests: Default
 * until a test picks a profile, with every preset to choose from. Choosing
 * re-renders, like the real optimistic update.
 *
 *   vi.mock("@/hooks/useRankingProfiles", async () =>
 *     (await import("@/test/rankingProfileMock")).rankingProfileMock.module);
 */
import { useSyncExternalStore } from "react";
import { vi } from "vitest";
import type { RankingSurface } from "@groovenet/contracts";
import { PRESET_LIST, resolveProfile } from "@/lib/ranking/profiles";

type Active = Partial<Record<RankingSurface, string>>;
const listeners = new Set<() => void>();
const state = { active: {} as Active, choose: vi.fn(), friendId: 1 };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const rankingProfileMock = {
  state,
  reset() {
    state.active = {};
    state.friendId = 1;
    listeners.forEach((listener) => listener());
    state.choose.mockReset();
  },
  module: {
    useRankingProfile: (surface: RankingSurface) => {
      const active = useSyncExternalStore(subscribe, () => state.active);
      return {
        ...resolveProfile(active[surface], PRESET_LIST, surface),
        friendId: state.friendId,
        options: PRESET_LIST,
        choose: (id: string) => {
          state.active = { ...state.active, [surface]: id };
          state.choose(surface, id);
          listeners.forEach((listener) => listener());
        },
      };
    },
  },
};
