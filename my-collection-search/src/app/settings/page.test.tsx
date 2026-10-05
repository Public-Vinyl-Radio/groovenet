// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

// Every section and provider has its own tests; here only the page's layout matters.
const { stub, passthrough } = vi.hoisted(() => ({
  stub: (name: string) => ({ default: () => name }),
  passthrough: (key: string) => ({ [key]: ({ children }: { children: unknown }) => children }),
}));
vi.mock("@/providers/SettingsDialogProvider", () => passthrough("SettingsDialogsProvider"));
vi.mock("@/providers/SyncStreamsProvider", () => passthrough("SyncStreamsProvider"));
vi.mock("@/components/settings/ActionsGrid", () => stub("actions"));
vi.mock("@/components/settings/FriendsDiscogsSection", () => stub("friends"));
vi.mock("@/components/settings/DatabaseBackups", () => stub("backups"));
vi.mock("@/components/settings/DatabaseRestore", () => stub("restore"));
vi.mock("@/components/settings/BackupStatusSection", () => stub("backup status"));
vi.mock("@/components/settings/BackupPolicySettingsSection", () => stub("backup policy"));
vi.mock("@/components/settings/GamdlSettingsSection", () => stub("gamdl"));
vi.mock("@/components/settings/AiPromptSettingsSection", () => stub("ai prompt"));
vi.mock("@/components/settings/DefaultLibrarySettingsSection", () => stub("default library section"));
vi.mock("@/components/settings/SuggestionScopeSettingsSection", () => stub("suggestion scope section"));
vi.mock("@/components/settings/AboutSection", () => stub("about"));
vi.mock("@/components/settings/dialogs/DiscogsSyncDialog", () => stub("discogs dialog"));
vi.mock("@/components/settings/dialogs/RemoveFriendDialog", () => stub("remove dialog"));

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("shows the suggestion scope with the default library, in the first section", () => {
    renderWithProviders(<SettingsPage />);
    // The stubs render as bare text, so the two land in one text node, in this order.
    expect(screen.getByText(/default library section\s*suggestion scope section/)).toBeTruthy();
  });
});
