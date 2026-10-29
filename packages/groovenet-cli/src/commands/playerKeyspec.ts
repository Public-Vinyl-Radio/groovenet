/**
 * Key specs for the player TUI keymap: parse the text users write in
 * `player_keymap`, match an Ink `useInput` event against one, and format one
 * for hints. Pure: no Ink import, no TTY.
 */

/** The subset of Ink's `Key` the keymap reads. Every field is optional so tests can pass `{}`. */
export interface InkKeyEvent {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  home?: boolean;
  end?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/** A single key: either a printable character or a named key, plus modifiers. */
export interface KeySpec {
  /** One character (case-sensitive) or a named key such as `enter`. */
  name: string;
  ctrl: boolean;
  shift: boolean;
}

const NAMED_KEYS = [
  "enter",
  "esc",
  "tab",
  "space",
  "backspace",
  "delete",
  "up",
  "down",
  "left",
  "right",
  "pageup",
  "pagedown",
  "home",
  "end",
] as const;
type NamedKey = (typeof NAMED_KEYS)[number];

const ALIASES: Record<string, NamedKey> = {
  return: "enter",
  escape: "esc",
  del: "delete",
  pgup: "pageup",
  pgdn: "pagedown",
  pgdown: "pagedown",
};

/** Ink reports these as booleans on `key`; `space` arrives as the input " ". */
const INK_FLAG: Record<Exclude<NamedKey, "space">, keyof InkKeyEvent> = {
  enter: "return",
  esc: "escape",
  tab: "tab",
  backspace: "backspace",
  delete: "delete",
  up: "upArrow",
  down: "downArrow",
  left: "leftArrow",
  right: "rightArrow",
  pageup: "pageUp",
  pagedown: "pageDown",
  home: "home",
  end: "end",
};

const DISPLAY_NAMES: Record<NamedKey, string> = {
  enter: "Enter",
  esc: "Esc",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Del",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  pageup: "PgUp",
  pagedown: "PgDn",
  home: "Home",
  end: "End",
};

export type ParseResult = { ok: true; spec: KeySpec } | { ok: false; error: string };

function isNamed(name: string): name is NamedKey {
  return (NAMED_KEYS as readonly string[]).includes(name);
}

/**
 * Parse `"n"`, `"U"`, `"?"`, `"enter"`, `"ctrl+n"`, `"shift+tab"`, `"ctrl+right"`.
 * Modifiers and named keys are case-insensitive; a single character is not, so
 * `U` and `u` are different keys. `shift+u` is the same key as `U`.
 */
export function parseKey(text: string): ParseResult {
  if (text === " ") return { ok: true, spec: { name: "space", ctrl: false, shift: false } };
  if (text.trim() === "") return { ok: false, error: "key is empty" };
  let rest = text;
  let ctrl = false;
  let shift = false;
  // Consume modifier prefixes one at a time so a bare "+" or "ctrl++" still parses.
  for (;;) {
    const lower = rest.toLowerCase();
    if (lower.startsWith("ctrl+") && rest.length > 5) {
      if (ctrl) return { ok: false, error: `"${text}" repeats ctrl+` };
      ctrl = true;
      rest = rest.slice(5);
    } else if (lower.startsWith("shift+") && rest.length > 6) {
      if (shift) return { ok: false, error: `"${text}" repeats shift+` };
      shift = true;
      rest = rest.slice(6);
    } else break;
  }
  const lower = rest.toLowerCase();
  const modifier = /^(alt|meta|cmd|super|opt|option|control)\+/.exec(lower);
  if (modifier)
    return {
      ok: false,
      error: `"${text}": only ctrl+ and shift+ modifiers are supported, not ${modifier[1]}+`,
    };
  const named = ALIASES[lower] ?? lower;
  if (isNamed(named)) {
    if (named === "space" && shift)
      return { ok: false, error: `"${text}": shift+space is not distinguishable from space` };
    return { ok: true, spec: { name: named, ctrl, shift } };
  }
  const chars = Array.from(rest);
  if (chars.length !== 1)
    return {
      ok: false,
      error: `"${text}" is not a key; use one character or one of ${NAMED_KEYS.join(", ")}`,
    };
  const char = chars[0]!;
  if (ctrl) {
    if (!/^[a-z]$/i.test(char))
      return { ok: false, error: `"${text}": ctrl+ works with letters and named keys` };
    if (char.toLowerCase() === "c")
      return { ok: false, error: `"${text}" is reserved: ctrl+c always exits the player` };
    return { ok: true, spec: { name: char.toLowerCase(), ctrl: true, shift } };
  }
  if (shift) {
    if (!/^[a-z]$/i.test(char))
      return {
        ok: false,
        error: `"${text}": shift+ works with letters and named keys; write the character itself`,
      };
    return { ok: true, spec: { name: char.toUpperCase(), ctrl: false, shift: false } };
  }
  return { ok: true, spec: { name: char, ctrl: false, shift: false } };
}

/** The spelling that round-trips through {@link parseKey}; also the identity used to detect conflicts. */
export function canonicalKey(spec: KeySpec): string {
  return `${spec.ctrl ? "ctrl+" : ""}${spec.shift ? "shift+" : ""}${spec.name}`;
}

/** Does this `useInput` event press this key? */
export function matchKey(spec: KeySpec, input: string, key: InkKeyEvent): boolean {
  if (spec.name === "space") return input === " " && !!key.ctrl === spec.ctrl;
  const flag = (INK_FLAG as Record<string, keyof InkKeyEvent | undefined>)[spec.name];
  if (flag) return !!key[flag] && !!key.ctrl === spec.ctrl && !!key.shift === spec.shift;
  // Ink sets `shift` on any capital letter, so characters are matched on input alone.
  if (spec.ctrl) return !!key.ctrl && input === spec.name;
  return !key.ctrl && !key.meta && input === spec.name;
}

/** Display form for hints and help: `→`, `S-Tab`, `^N`, `Space`, `Enter`. */
export function formatKey(spec: KeySpec): string {
  const base = isNamed(spec.name)
    ? DISPLAY_NAMES[spec.name]
    : spec.ctrl
      ? spec.name.toUpperCase()
      : spec.name;
  return `${spec.ctrl ? "^" : ""}${spec.shift ? "S-" : ""}${base}`;
}
