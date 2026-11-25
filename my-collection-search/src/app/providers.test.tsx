// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import { useHousehold } from "@/providers/HouseholdProvider";

// Exercise the real root QueryClient and household provider while unrelated
// player, job and collection providers keep their own integration tests.
const { pass } = vi.hoisted(() => ({
  pass: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/providers/UsernameProvider", () => ({ UsernameProvider: pass }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ PlaylistPlayerProvider: pass }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({ PlaybackTargetProvider: pass }));
vi.mock("@/providers/TrackEditProvider", () => ({ default: pass }));
vi.mock("@/providers/PlaylistsProvider", () => ({ default: pass }));
vi.mock("@/providers/JobWatcherProvider", () => ({ JobWatcherProvider: pass }));
vi.mock("@/providers/InAppNavigationProvider", () => ({ InAppNavigationProvider: pass }));
vi.mock("@/providers/CommandPaletteProvider", () => ({ CommandPaletteProvider: pass }));
vi.mock("@/providers/SettingsDialogProvider", () => ({ SettingsDialogsProvider: pass }));
vi.mock("@/providers/SyncStreamsProvider", () => ({ SyncStreamsProvider: pass }));
vi.mock("@/hooks/useAppearanceSettings", () => ({ useSyncAppearance: vi.fn() }));
vi.mock("@/hooks/useDiscogsImports", () => ({ DiscogsImportWatcher: () => null }));
vi.mock("@/components/PlaylistPlayer", () => ({ default: () => null }));
vi.mock("@/components/ThemeColorSync", () => ({ default: () => null }));
vi.mock("@/services/internalApi/profiles", () => ({
  profilesApi: {
    list: async () => ({
      users: [{ id: "owner", name: "DJ", is_owner: true }],
      current: { id: "owner", name: "DJ", is_owner: true },
      selected: true,
    }),
  },
}));
import ClientProviders from "./providers";
import type { AppearanceSettingsResponse } from "@/services/internalApi/settings";
function Identity() {
  const { data } = useHousehold();
  const queryClient = useQueryClient();
  return (
    <p>
      {data?.current?.name ?? "Loading"} ·{" "}
      {queryClient.getQueryData<AppearanceSettingsResponse>(queryKeys.appearance())?.palette ??
        "No seed"}
    </p>
  );
}
describe("root providers", () => {
  it("makes the household identity available to route content", async () => {
    renderWithProviders(
      <ClientProviders>
        <Identity />
      </ClientProviders>,
    );
    expect(await screen.findByText("DJ · No seed")).toBeTruthy();
  });
  it("keeps the saved appearance in the same query client as identity", async () => {
    const appearance = { palette: "sleeve" } as AppearanceSettingsResponse;
    renderWithProviders(
      <ClientProviders appearance={appearance}>
        <Identity />
      </ClientProviders>,
    );
    expect(await screen.findByText("DJ · sleeve")).toBeTruthy();
  });
});

it("retains desktop development tools around the household provider", async () => {
  vi.stubEnv("NODE_ENV", "development");
  try {
    renderWithProviders(
      <ClientProviders>
        <Identity />
      </ClientProviders>,
    );
    expect(await screen.findByText("DJ · No seed")).toBeTruthy();
  } finally {
    vi.unstubAllEnvs();
  }
});
