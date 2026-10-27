/**
 * The active player keymap: the registry's defaults with the user's
 * `player_keymap` overrides applied. Validation never throws. A bad entry is
 * reported and that action keeps its default keys; the rest of the config
 * still applies.
 */
import { ACTIONS, KEYMAP_VIEWS, type ActionDef, type ActionId, type KeymapView } from "./playerKeymapRegistry.js";
import { canonicalKey, formatKey, matchKey, parseKey, type InkKeyEvent, type KeySpec, type ParseResult } from "./playerKeyspec.js";

export interface KeymapProblem {
  kind: "bad-config" | "unknown-action" | "bad-value" | "bad-key" | "conflict";
  /** The action the entry is for; for a conflict, the one(s) reverted to defaults. */
  actions: string[];
  message: string;
}

export interface ResolvedAction {
  def: ActionDef;
  overridden: boolean;
  /** Keys in `player_keymap` spelling, grouped by the views they apply to. */
  bindings: Array<{ views: KeymapView[]; keys: string[] }>;
  specs: Partial<Record<KeymapView, KeySpec[]>>;
}

export interface Keymap {
  actions: ResolvedAction[];
  problems: KeymapProblem[];
}

function parseDefaults(def: ActionDef, view: KeymapView): KeySpec[] {
  return (def.viewKeys?.[view] ?? def.keys).map((text) => {
    // Defaults are checked to parse by the registry test.
    return (parseKey(text) as Extract<ParseResult, { ok: true }>).spec;
  });
}

function resolve(def: ActionDef, override: KeySpec[] | undefined): ResolvedAction {
  const specs: Partial<Record<KeymapView, KeySpec[]>> = {};
  const groups = new Map<string, { views: KeymapView[]; keys: string[] }>();
  for (const view of def.views) {
    const list = override ?? parseDefaults(def, view);
    specs[view] = list;
    const keys = list.map(canonicalKey);
    const id = keys.join("\u0000");
    const group = groups.get(id) ?? { views: [], keys };
    group.views.push(view);
    groups.set(id, group);
  }
  return { def, overridden: override !== undefined, bindings: [...groups.values()], specs };
}

function tidy(value: unknown): string {
  return `${JSON.stringify(value)}`;
}

/** Same key bound to two actions that are live in the same view. */
function findConflicts(actions: ResolvedAction[]): Array<{ key: string; ids: string[]; views: KeymapView[] }> {
  const found = new Map<string, { key: string; ids: string[]; views: KeymapView[] }>();
  for (const view of KEYMAP_VIEWS) {
    const byKey = new Map<string, string[]>();
    for (const action of actions) {
      for (const spec of action.specs[view] ?? []) {
        const key = canonicalKey(spec);
        // An action never lists a key twice: overrides are de-duplicated and defaults are distinct.
        byKey.set(key, [...(byKey.get(key) ?? []), action.def.id]);
      }
    }
    for (const [key, ids] of byKey) {
      if (ids.length < 2) continue;
      const id = `${key}|${ids.join(",")}`;
      const entry = found.get(id) ?? { key, ids, views: [] };
      entry.views.push(view);
      found.set(id, entry);
    }
  }
  return [...found.values()];
}

export function buildKeymap(raw?: unknown): Keymap {
  const problems: KeymapProblem[] = [];
  const overrides = new Map<string, KeySpec[]>();
  const known = new Map<string, ActionDef>(ACTIONS.map((def) => [def.id, def]));

  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "object" || Array.isArray(raw)) {
      problems.push({ kind: "bad-config", actions: [], message: `player_keymap must be an object of action to keys, not ${tidy(raw)}; using the default keymap.` });
    } else {
      for (const [id, value] of Object.entries(raw)) {
        if (!known.has(id)) {
          problems.push({ kind: "unknown-action", actions: [id], message: `Unknown action "${id}"; ignored. Run \`groovenet player keys\` for the action ids.` });
          continue;
        }
        const list = typeof value === "string" ? [value] : value;
        if (!Array.isArray(list) || list.some((item) => typeof item !== "string")) {
          problems.push({ kind: "bad-value", actions: [id], message: `${id}: expected a key or a list of keys, got ${tidy(value)}; using the default keys.` });
          continue;
        }
        const specs: KeySpec[] = [];
        const errors: string[] = [];
        for (const text of list as string[]) {
          const parsed = parseKey(text);
          if (parsed.ok) { if (!specs.some((spec) => canonicalKey(spec) === canonicalKey(parsed.spec))) specs.push(parsed.spec); }
          else errors.push(parsed.error);
        }
        if (errors.length) {
          for (const error of errors) problems.push({ kind: "bad-key", actions: [id], message: `${id}: ${error}; using the default keys.` });
          continue;
        }
        overrides.set(id, specs);
      }
    }
  }

  let actions = ACTIONS.map((def) => resolve(def, overrides.get(def.id)));
  // Reverting an override can collide with another override, so repeat until stable.
  for (;;) {
    const revert = new Set<string>();
    for (const conflict of findConflicts(actions)) {
      // Defaults never conflict (registry test), so every conflict involves an override.
      const culprits = conflict.ids.filter((id) => overrides.has(id));
      culprits.forEach((id) => revert.add(id));
      problems.push({
        kind: "conflict",
        actions: culprits,
        message: `"${conflict.key}" is bound to ${conflict.ids.join(" and ")} in ${conflict.views.join(", ")}; using the default keys for ${culprits.join(" and ")}.`,
      });
    }
    if (!revert.size) break;
    for (const id of revert) overrides.delete(id);
    actions = ACTIONS.map((def) => resolve(def, overrides.get(def.id)));
  }
  return { actions, problems };
}

export const defaultKeymap: Keymap = buildKeymap();

export interface DispatchContext {
  view: KeymapView;
  /** Controlling a server player: remote-only actions are live. */
  remote: boolean;
}

/** Which action, if any, this key event triggers in this view. */
export function resolveAction(keymap: Keymap, { view, remote }: DispatchContext, input: string, key: InkKeyEvent): ActionId | null {
  for (const action of keymap.actions) {
    if ((action.def.remoteOnly && !remote) || !action.specs[view]) continue;
    if (action.specs[view]!.some((spec) => matchKey(spec, input, key))) return action.def.id as ActionId;
  }
  return null;
}

/** Display text for an action's keys in a view (`↑`, `Space`, `^N`), all of them, joined by `/`. Empty if unbound. */
export function displayKeys(keymap: Keymap, id: ActionId, view: KeymapView): string {
  const action = keymap.actions.find((item) => item.def.id === id)!;
  return (action.specs[view] ?? []).map(formatKey).join("/");
}

export interface HintItem { keys: string; label: string }

/**
 * The hint for each hinted action live in a view, showing its primary key and
 * merging adjacent actions with the same label (`↑/↓ select`). Unbound actions
 * are left out. `remoteOnly: true` lists the server-player actions instead.
 */
export function hintItems(keymap: Keymap, view: KeymapView | null, { remote, remoteOnly = false }: { remote: boolean; remoteOnly?: boolean }): HintItem[] {
  const items: HintItem[] = [];
  for (const action of keymap.actions) {
    const { def } = action;
    if (!def.hint || !!def.remoteOnly !== remoteOnly || (def.remoteOnly && !remote)) continue;
    const specs = view ? action.specs[view] : Object.values(action.specs).find((list) => list?.length);
    if (!specs?.length) continue;
    const keys = formatKey(specs[0]!);
    const last = items[items.length - 1];
    if (last && last.label === def.hint) last.keys += `/${keys}`;
    else items.push({ keys, label: def.hint });
  }
  return items;
}

export function hintLine(items: HintItem[]): string {
  return items.map((item) => `${item.keys} ${item.label}`).join(" · ");
}
