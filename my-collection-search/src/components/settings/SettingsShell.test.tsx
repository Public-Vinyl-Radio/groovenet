// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

// Each section has its own tests; here only the shell around them matters.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => ({ default: () => name }),
}));
vi.mock("./AboutSection", () => stub("about section"));
vi.mock("./AiPromptSettingsSection", () => stub("ai prompt section"));
vi.mock("./AppearanceSettingsSection", () => stub("appearance section"));
vi.mock("./BackupPolicySettingsSection", () => stub("backup policy"));
vi.mock("./BackupStatusSection", () => stub("backup status"));
vi.mock("./DatabaseBackups", () => stub("backups"));
vi.mock("./DatabaseRestore", () => stub("restore"));
vi.mock("./DefaultLibrarySettingsSection", () => stub("default library section"));
vi.mock("./FriendsDiscogsSection", () => stub("friends section"));
vi.mock("./GamdlSettingsSection", () => stub("gamdl section"));
vi.mock("./SuggestionScopeSettingsSection", () => stub("suggestion scope section"));
vi.mock("./settingsSummaries", () => ({
  useSettingsSummaries: () => ({
    appearance: "Mono · light on this device",
    libraries: "4 libraries · default collector-2",
    "ai-metadata": "Custom prompt",
  }),
}));

import SettingsShell from "./SettingsShell";

const rail = () => screen.getByRole("navigation", { name: "Settings", hidden: true });

describe("SettingsShell on desktop", () => {
  it("groups the rail as YOU, LIBRARY, SERVICES and ABOUT", () => {
    renderWithProviders(<SettingsShell section="libraries" />);
    const groups = within(rail()).getAllByRole("group", { hidden: true });
    expect(
      groups.map((group) => [
        group.getAttribute("aria-labelledby") &&
          document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent,
        within(group)
          .getAllByRole("link", { hidden: true })
          .map((link) => link.textContent),
      ]),
    ).toEqual([
      ["You", ["Appearance"]],
      ["Library", ["Libraries"]],
      ["Services", ["Apple Music", "AI metadata"]],
      ["About", ["About GrooveNet"]],
      ["Backups", ["Disaster Recovery"]],
    ]);
  });

  it("marks the open section and links each to its own path", () => {
    renderWithProviders(<SettingsShell section="ai-metadata" />);
    const current = within(rail()).getByRole("link", { name: "AI metadata", hidden: true });
    expect(current.getAttribute("aria-current")).toBe("page");
    const other = within(rail()).getByRole("link", { name: "Apple Music", hidden: true });
    expect(other.getAttribute("aria-current")).toBeNull();
    expect(other.getAttribute("href")).toBe("/settings/apple-music");
  });

  it("titles the page Settings and the section with its name", () => {
    renderWithProviders(<SettingsShell section="apple-music" />);
    // Both titles are desktop-only here, and jsdom names no hidden heading.
    expect(screen.getByText("Settings", { selector: "h1" })).toBeTruthy();
    const heading = screen.getByText("Apple Music", { selector: "h2" });
    expect(screen.getByRole("region", { hidden: true }).getAttribute("aria-labelledby")).toBe(
      heading.id,
    );
    expect(screen.getByText("gamdl section")).toBeTruthy();
  });

  it("opens Appearance beside the rail on /settings", () => {
    renderWithProviders(<SettingsShell section={null} />);
    const current = within(rail()).getByRole("link", { name: "Appearance", hidden: true });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("appearance section")).toBeTruthy();
  });

  it("stacks the three library sections in Libraries", () => {
    renderWithProviders(<SettingsShell section="libraries" />);
    expect(
      screen.getByText(/default library section\s*suggestion scope section\s*friends section/),
    ).toBeTruthy();
  });

  it("keeps Disaster Recovery reachable until System lands", () => {
    renderWithProviders(<SettingsShell section="disaster-recovery" />);
    expect(screen.getByText(/backup status\s*backup policy\s*backups\s*restore/)).toBeTruthy();
  });

  it.each([
    ["appearance", "appearance section"],
    ["about", "about section"],
    ["ai-metadata", "ai prompt section"],
  ] as const)("renders %s's own section", (id, text) => {
    renderWithProviders(<SettingsShell section={id} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe("SettingsShell on a phone", () => {
  it("is a drill-in list on /settings, each row with its current value", () => {
    renderWithProviders(<SettingsShell section={null} />);
    const list = screen.getByTestId("settings-drill-list");
    const libraries = within(list).getByRole("link", { name: /Libraries/ });
    expect(libraries.getAttribute("href")).toBe("/settings/libraries");
    expect(libraries.textContent).toContain("4 libraries · default collector-2");
    expect(within(list).getByRole("link", { name: /Appearance/ }).textContent).toContain(
      "Mono · light on this device",
    );
    // A value that hasn't loaded leaves the label alone.
    expect(within(list).getByRole("link", { name: /Apple Music/ }).textContent).toBe("Apple Music");
    expect(
      within(list)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["You", "Library", "Services", "About", "Backups"]);
  });

  it("has no System row: System lives under More", () => {
    renderWithProviders(<SettingsShell section={null} />);
    expect(screen.queryByRole("link", { name: /System/ })).toBeNull();
  });

  it("opens a section as its own screen, titled with it and a back button", () => {
    renderWithProviders(<SettingsShell section="libraries" />);
    expect(screen.queryByTestId("settings-drill-list")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Libraries" })).toBeTruthy();
    const back = screen.getByRole("link", { name: "Back to Settings" });
    expect(back.getAttribute("href")).toBe("/settings");
  });
});
