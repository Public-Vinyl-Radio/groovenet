import type React from "react";

/** One header action. The same list feeds desktop and phones. */
export type HeaderAction = {
  /** The desktop button's text; the phone icon's accessible name. */
  label: string;
  title?: string;
  /** Needed for a phone icon; shown before the label on desktop. */
  icon?: React.ReactNode;
  onClick: () => void;
  /** The one solid button on desktop. Only the first primary action gets it. */
  primary?: boolean;
  /** A toggle: set while it is on, exposed as `aria-pressed`. */
  pressed?: boolean;
  /** Greyed out while a save/run is in flight. */
  disabled?: boolean;
  /** In flight: a spinner on the desktop button, and disabled at both widths. */
  loading?: boolean;
  /** A quiet desktop button with no outline, for a form's Cancel beside its Save. */
  ghost?: boolean;
  /**
   * Phones: a 44px icon, the ⋯ menu, or left out. Default: an icon while there
   * is room (two) and the action has one, otherwise the menu.
   */
  phone?: "icon" | "menu" | "hidden";
  /** Desktop: a labelled button (default), the ⋯ menu, or left out. */
  desktop?: "button" | "menu" | "hidden";
};

/** At most two icons in the phone bar; everything else goes in its ⋯ menu. */
export const MAX_PHONE_ICONS = 2;

export type PlacedActions = {
  desktopButtons: HeaderAction[];
  desktopMenu: HeaderAction[];
  /** The desktop button drawn solid, if any. */
  solid?: HeaderAction;
  phoneIcons: HeaderAction[];
  phoneMenu: HeaderAction[];
};

/** Sort one action list into where each action shows at each width. */
export function placeActions(actions: HeaderAction[]): PlacedActions {
  const placed: PlacedActions = {
    desktopButtons: [],
    desktopMenu: [],
    phoneIcons: [],
    phoneMenu: [],
  };
  for (const action of actions) {
    const desktop = action.desktop ?? "button";
    if (desktop === "button") placed.desktopButtons.push(action);
    else if (desktop === "menu") placed.desktopMenu.push(action);

    const phone = action.phone ?? (action.icon ? "icon" : "menu");
    if (phone === "hidden") continue;
    if (phone === "icon" && action.icon && placed.phoneIcons.length < MAX_PHONE_ICONS)
      placed.phoneIcons.push(action);
    else placed.phoneMenu.push(action);
  }
  placed.solid = placed.desktopButtons.find((action) => action.primary);
  return placed;
}
