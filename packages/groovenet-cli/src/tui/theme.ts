/**
 * The TUI's colour roles, in terminal ANSI terms only: attributes and the 16
 * named colours, never hex, so the player follows whatever theme the terminal
 * runs. Views name a role (`<Styled role="muted">`); only this file picks
 * attributes and colours.
 */
import { createContext, useContext } from "react";

export type Role =
  /** Default foreground. */
  | "ink"
  /** Emphasis: titles, the key in a hint. */
  | "strong"
  /** Secondary text: artist, album, inactive tabs. */
  | "muted"
  /** Tertiary text: labels, rules, played rows. */
  | "dim"
  /** The hard shadow under a box. */
  | "shadow"
  /** The selected list row. */
  | "selection"
  /** The selected row's main text. */
  | "selectionStrong"
  /** Reverse labels: `GROOVENET`, `NOW PLAYING`, the active tab. */
  | "reverse"
  /** Playing / connected. */
  | "live"
  | "warn"
  | "error";

/** The subset of Ink `<Text>` props a role may set. */
export interface RoleStyle {
  color?: "green" | "yellow" | "red" | "gray";
  dimColor?: boolean;
  bold?: boolean;
  inverse?: boolean;
}

export type Theme = Record<Role, RoleStyle>;

const COLOUR: Theme = {
  ink: {},
  strong: { bold: true },
  muted: { dimColor: true },
  // `gray` is bright black, the 16-colour palette's darkest grey.
  dim: { color: "gray" },
  shadow: { color: "gray" },
  selection: { inverse: true },
  selectionStrong: { inverse: true, bold: true },
  reverse: { inverse: true, bold: true },
  live: { color: "green" },
  warn: { color: "yellow" },
  error: { color: "red", bold: true },
};

/**
 * NO_COLOR: no colour and no dim, but inverse and bold stay, so the selection,
 * reverse labels and emphasis still read.
 */
const MONO: Theme = {
  ...COLOUR,
  muted: {},
  dim: {},
  shadow: {},
  live: {},
  warn: { bold: true },
  error: { bold: true },
};

export function makeTheme({ color }: { color: boolean }): Theme {
  return color ? COLOUR : MONO;
}

/** https://no-color.org: present and not empty disables colour. */
export function themeFromEnv(env: NodeJS.ProcessEnv = process.env): Theme {
  return makeTheme({ color: !env.NO_COLOR });
}

export const ThemeContext = createContext<Theme>(COLOUR);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
