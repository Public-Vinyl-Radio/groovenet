// The Settings sections, their groups and their URLs (#968). Each section is
// its own route, `/settings/<id>`; the rail (desktop) and the drill-in list
// (phone) are both built from SETTINGS_GROUPS.

export const settingsSectionIds = [
  "appearance",
  "libraries",
  "apple-music",
  "ai-metadata",
  "about",
] as const;

export type SettingsSectionId = (typeof settingsSectionIds)[number];

export type SettingsSectionMeta = { id: SettingsSectionId; label: string };

export type SettingsGroup = { label: string; sections: SettingsSectionMeta[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { label: "You", sections: [{ id: "appearance", label: "Appearance" }] },
  { label: "Library", sections: [{ id: "libraries", label: "Libraries" }] },
  {
    label: "Services",
    sections: [
      { id: "apple-music", label: "Apple Music" },
      { id: "ai-metadata", label: "AI metadata" },
    ],
  },
  { label: "About", sections: [{ id: "about", label: "About GrooveNet" }] },
];

/** What `/settings` opens on desktop, where there is no list to start from. */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "appearance";

export const SETTINGS_PATH = "/settings";

export function settingsHref(id: SettingsSectionId): string {
  return `${SETTINGS_PATH}/${id}`;
}

export function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return settingsSectionIds.includes(value as SettingsSectionId);
}

const SECTION_LABELS = new Map(
  SETTINGS_GROUPS.flatMap((group) => group.sections.map(({ id, label }) => [id, label] as const)),
);

/** Every id is in a group (settingsSections.test.ts checks it); the id itself is a fallback. */
export function settingsSectionLabel(id: SettingsSectionId): string {
  return SECTION_LABELS.get(id) ?? id;
}

/** The tab ids of the old one-page Settings (`?section=`), and where each lives now. */
const LEGACY_SECTION_TARGETS = new Map<string, SettingsSectionId>([
  ["defaults", "libraries"],
  ["library", "libraries"],
  ["downloads", "apple-music"],
  ["ai", "ai-metadata"],
]);

/**
 * Where an old or current section id should land: a `/settings/<id>` path, or
 * null for an id nothing knows. Covers `?section=<id>` links from before
 * #968 and old ids typed into the new path.
 */
export function resolveSettingsSectionPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === "disaster-recovery") return "/system";
  if (isSettingsSectionId(value)) return settingsHref(value);
  const target = LEGACY_SECTION_TARGETS.get(value);
  return target ? settingsHref(target) : null;
}
