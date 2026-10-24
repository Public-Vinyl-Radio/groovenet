// The font catalogue: which faces each role offers. Plain data with no
// next/font import, so the schema, the API, the picker and the theme can all
// read it. Everything else (the `data-font-*` CSS blocks, request validation,
// the OpenAPI enum, the picker) derives from this file.
//
// A choice with a `face` uses the self-hosted font whose next/font variable is
// `--face-<face>` (declared in fonts.ts, which a test cross-checks). A choice
// without one is a system stack and ships no file.

export const sansFallback = `"Helvetica Neue", Arial, sans-serif`;
export const monoFallback = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
const systemSans = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export interface FontChoice {
  /** Stored and sent over the API. */
  id: string;
  label: string;
  /** The self-hosted face, or absent for a system stack. */
  face?: string;
  /** The stack, for a system choice. */
  stack?: string;
}

export interface FontRole {
  label: string;
  /** What the role covers, for the picker. */
  description: string;
  /** The variable the theme's font token reads. */
  variable: "--gn-font-heading" | "--gn-font-body" | "--gn-font-label";
  /** Appended after the chosen face, and used if its variable is missing. */
  fallback: string;
  /** The first choice is the default. */
  choices: readonly FontChoice[];
}

export const fontRoles = {
  display: {
    label: "Display",
    description: "Page titles and card headings.",
    variable: "--gn-font-heading",
    fallback: sansFallback,
    choices: [
      { id: "default", label: "IBM Plex Sans", face: "plex-sans" },
      { id: "barlow-condensed", label: "Barlow Condensed", face: "barlow-condensed" },
      { id: "zilla-slab", label: "Zilla Slab", face: "zilla-slab" },
      { id: "system", label: "System", stack: systemSans },
    ],
  },
  body: {
    label: "Body",
    description: "Interface text.",
    variable: "--gn-font-body",
    fallback: sansFallback,
    choices: [
      { id: "default", label: "IBM Plex Sans", face: "plex-sans" },
      { id: "inter", label: "Inter", face: "inter" },
      { id: "system", label: "System", stack: systemSans },
    ],
  },
  label: {
    label: "Labels",
    description: "Buttons, tags, overlines, navigation and IDs such as LP-342.",
    variable: "--gn-font-label",
    fallback: monoFallback,
    choices: [
      { id: "default", label: "IBM Plex Mono", face: "plex-mono" },
      { id: "jetbrains-mono", label: "JetBrains Mono", face: "jetbrains-mono" },
      { id: "system", label: "System mono", stack: monoFallback },
    ],
  },
} as const satisfies Record<string, FontRole>;

export type FontRoleId = keyof typeof fontRoles;
export type FontChoiceId = (typeof fontRoles)[FontRoleId]["choices"][number]["id"];
export type FontSelection = Record<FontRoleId, FontChoiceId>;

export const defaultFontChoiceId = "default" as const;

/** Every role, in picker order. */
export const fontRoleIds = Object.keys(fontRoles) as [FontRoleId, ...FontRoleId[]];

/** The ids a role accepts, default first. */
export const fontChoiceIdsFor = (role: FontRoleId) =>
  (fontRoles[role].choices as readonly FontChoice[]).map((c) => c.id) as [FontChoiceId, ...FontChoiceId[]];

/** The `--face-*` variable a self-hosted face defines. */
export const faceVariable = (face: string) => `--face-${face}`;

/** Every self-hosted face any role uses, once each. */
export const faceIds = [
  ...new Set(
    fontRoleIds.flatMap((role) =>
      (fontRoles[role].choices as readonly FontChoice[]).flatMap((c) => (c.face ? [c.face] : [])),
    ),
  ),
];

export function isFontChoiceId(role: FontRoleId, value: unknown): value is FontChoiceId {
  return (
    typeof value === "string" &&
    (fontRoles[role].choices as readonly FontChoice[]).some((choice) => choice.id === value)
  );
}

/** A stored or requested id as a choice for the role; anything unknown is the default. */
export function resolveFontChoice(role: FontRoleId, value: unknown): FontChoiceId {
  return isFontChoiceId(role, value) ? value : defaultFontChoiceId;
}

/**
 * What a choice sets its role variable to. A missing face variable falls back
 * to the role's stack rather than invalidating the declaration (Storybook, or a
 * face that failed to build).
 */
export function fontChoiceValue(role: FontRoleId, id: string): string {
  const { choices, fallback } = fontRoles[role] as FontRole;
  const choice = choices.find((c) => c.id === id) ?? choices[0];
  return choice.face ? `var(${faceVariable(choice.face)}, ${fallback})` : (choice.stack as string);
}

/** A full font-family value for previewing a choice. */
export function fontChoiceFamily(role: FontRoleId, id: string): string {
  return `${fontChoiceValue(role, id)}, ${(fontRoles[role] as FontRole).fallback}`;
}
