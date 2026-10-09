// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

// Every section and provider has its own tests; here only the page's layout,
// URL round-trip and tab switching matter.
const { stub, passthrough } = vi.hoisted(() => ({
  stub: (name: string) => ({ default: () => name }),
  passthrough: (key: string) => ({ [key]: ({ children }: { children: unknown }) => children }),
}));
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/settings",
  useSearchParams: () => mocks.searchParams,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  it("shows the suggestion scope with the default library, in the first section, with no URL param", () => {
    renderWithProviders(<SettingsPage />);
    // The stubs render as bare text, so the two land in one text node, in this order.
    expect(screen.getByText(/default library section\s*suggestion scope section/)).toBeTruthy();
  });

  it("falls back to the first section for an unknown ?section value", () => {
    mocks.searchParams = new URLSearchParams("section=not-a-real-section");
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText(/default library section\s*suggestion scope section/)).toBeTruthy();
  });

  it("opens the section named in the URL, with its heading and description", () => {
    mocks.searchParams = new URLSearchParams("section=library");
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Library Data" })).toBeTruthy();
    expect(screen.getByText("friends and Discogs import settings")).toBeTruthy();
    expect(screen.getByText("friends")).toBeTruthy();
  });

  it("switches sections with the mouse and writes the choice into the URL", async () => {
    const { user } = renderWithProviders(<SettingsPage />);
    // jsdom runs no media queries, so the desktop tab row renders as "hidden".
    const aboutTab = screen.getByRole("tab", { name: "About", hidden: true });
    await user.click(aboutTab);

    expect(mocks.replace).toHaveBeenCalledWith("/settings?section=about", { scroll: false });
  });

  it("exposes the tab row with roving tabindex, so arrow keys can move between sections", () => {
    // jsdom runs no media queries (the desktop row's base style is display:
    // none, so it never actually gets real focus here) and Chakra's
    // automatic-activation selection runs its DOM work a frame later via
    // requestAnimationFrame in a way jsdom can't reliably replay — so this
    // checks the actual mechanism arrow-key navigation depends on (a single
    // tabbable trigger, the rest reachable only via arrow keys) rather than
    // simulating the keypress. The mouse-click test above covers switching
    // itself; this one covers that it is keyboard-reachable at all.
    mocks.searchParams = new URLSearchParams("section=downloads");
    renderWithProviders(<SettingsPage />);

    const tabs = screen.getAllByRole("tab", { hidden: true });
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false", "true", "false", "false", "false", "false",
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1]);
  });
});
