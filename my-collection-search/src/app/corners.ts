// The corner style: square (the house style) or softened. Plain data like
// fontChoices.ts, so the schema, the API, the picker and the theme all read it.
// The theme's radius tokens read `--gn-radius`, which `[data-corners]` sets.

export const cornerIds = ["square", "rounded"] as const;
export type CornerId = (typeof cornerIds)[number];

export const defaultCornerId: CornerId = "square";

/** The radius `[data-corners="rounded"]` sets; square is 0. */
export const roundedRadius = "6px";

/** A stored or attribute value as a corner id; anything unknown is the default. */
export function resolveCorners(value: unknown): CornerId {
  return cornerIds.find((id) => id === value) ?? defaultCornerId;
}
