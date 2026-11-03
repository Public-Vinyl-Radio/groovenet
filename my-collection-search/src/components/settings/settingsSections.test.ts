import { describe, expect, it } from "vitest";
import {
  SETTINGS_GROUPS,
  isSettingsSectionId,
  resolveSettingsSectionPath,
  settingsHref,
  settingsSectionIds,
  settingsSectionLabel,
  type SettingsSectionId,
} from "./settingsSections";

describe("settings sections", () => {
  it("puts every section in exactly one group", () => {
    const grouped = SETTINGS_GROUPS.flatMap((group) => group.sections.map((s) => s.id));
    expect([...grouped].sort()).toEqual([...settingsSectionIds].sort());
  });

  it("groups them as the mockup does", () => {
    expect(
      SETTINGS_GROUPS.map((g) => [g.label, g.sections.map((s) => s.label)]).slice(0, 4),
    ).toEqual([
      ["You", ["Appearance"]],
      ["Library", ["Libraries"]],
      ["Services", ["Apple Music", "AI metadata"]],
      ["About", ["About GrooveNet"]],
    ]);
  });

  it("names and links each section", () => {
    expect(settingsSectionLabel("ai-metadata")).toBe("AI metadata");
    expect(settingsSectionLabel("retired" as SettingsSectionId)).toBe("retired");
    expect(settingsHref("libraries")).toBe("/settings/libraries");
    expect(isSettingsSectionId("about")).toBe(true);
    expect(isSettingsSectionId("ai")).toBe(false);
    expect(isSettingsSectionId("disaster-recovery")).toBe(false);
  });

  it("resolves current ids, old tab ids and nothing else", () => {
    expect(resolveSettingsSectionPath("disaster-recovery")).toBe("/system");
    expect(resolveSettingsSectionPath("about")).toBe("/settings/about");
    expect(resolveSettingsSectionPath("library")).toBe("/settings/libraries");
    expect(resolveSettingsSectionPath("toString")).toBeNull();
    expect(resolveSettingsSectionPath("")).toBeNull();
    expect(resolveSettingsSectionPath(null)).toBeNull();
    expect(resolveSettingsSectionPath(undefined)).toBeNull();
  });
});
