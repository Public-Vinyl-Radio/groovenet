import { defaultKeymap, resolveAction, type Keymap } from "./playerKeymap.js";
import type { ActionId, KeymapView } from "./playerKeymapRegistry.js";
import type { InkKeyEvent } from "./playerKeyspec.js";

export type TuiKey = InkKeyEvent;

export type PlayerTuiAction = { id: ActionId } | { text: string };

export interface TuiKeyContext {
  view: KeymapView;
  editingSearch: boolean;
  remote?: boolean;
  keymap?: Keymap;
}

/**
 * Translate a `useInput` event. While a search box or playlist filter is being edited only
 * `input` actions apply and any other printable key is typed; otherwise the
 * keymap decides for the current view.
 */
export function playerTuiAction(
  input: string,
  key: TuiKey,
  { view, editingSearch, remote = false, keymap = defaultKeymap }: TuiKeyContext,
): PlayerTuiAction | null {
  const id = resolveAction(keymap, { view: editingSearch ? "input" : view, remote }, input, key);
  // Search scope/mode bindings must remain text in the playlist name filter,
  // including when a user binds those input actions to printable characters.
  const searchOnly =
    editingSearch && view === "playlists" && (id === "search.scope" || id === "search.mode");
  if (id && !searchOnly) return { id };
  if (editingSearch && input && !key.ctrl && !key.meta && !/[\u0000-\u001f\u007f]/.test(input))
    return { text: input };
  return null;
}
