import { type KeymapView } from "./playerKeymapRegistry.js";
import { type Keymap } from "./playerKeymap.js";
import { formatKey } from "./playerKeyspec.js";

/** The `groovenet player keys --json` payload. */
export function keymapJson(keymap: Keymap) {
  return {
    actions: keymap.actions.map(({ def, overridden, bindings, specs }) => ({
      id: def.id,
      description: def.description,
      views: [...def.views],
      remote_only: !!def.remoteOnly,
      overridden,
      keys: bindings[0]!.keys,
      display: (specs[bindings[0]!.views[0]!] ?? []).map(formatKey),
      // Where the keys differ by view (a key that means something else there).
      by_view: bindings.map((binding) => ({ views: binding.views, keys: binding.keys })),
      defaults: [...def.keys],
    })),
    problems: keymap.problems,
  };
}

function viewsText(views: readonly KeymapView[]): string {
  return views.length >= 4 && !views.includes("input") ? "all lists" : views.join(", ");
}

function keysText(bindings: Keymap["actions"][number]["bindings"]): string {
  const [first, ...rest] = bindings as [
    Keymap["actions"][number]["bindings"][number],
    ...Keymap["actions"][number]["bindings"],
  ];
  const main = first.keys.length ? first.keys.join(" ") : "(unbound)";
  return [
    main,
    ...rest.map(
      (binding) => `${binding.views.join("/")}: ${binding.keys.join(" ") || "(unbound)"}`,
    ),
  ].join("; ");
}

/** The table `groovenet player keys` prints; `*` marks an action overridden in config. */
export function formatKeymap(keymap: Keymap): string[] {
  const rows = keymap.actions.map(({ def, overridden, bindings }) => ({
    id: `${overridden ? "*" : " "}${def.id}`,
    keys: keysText(bindings),
    views: `${viewsText(def.views)}${def.remoteOnly ? " (remote)" : ""}`,
    description: def.description,
  }));
  const header = { id: " ACTION", keys: "KEYS", views: "VIEWS", description: "DESCRIPTION" };
  const width = (field: "id" | "keys" | "views") =>
    Math.max(header[field].length, ...rows.map((row) => row[field].length));
  const [w1, w2, w3] = [width("id"), width("keys"), width("views")];
  const line = (row: typeof header) =>
    `${row.id.padEnd(w1)}  ${row.keys.padEnd(w2)}  ${row.views.padEnd(w3)}  ${row.description}`;
  const lines = [line(header), ...rows.map(line)];
  lines.push(
    "",
    "* = overridden by player_keymap in ~/.groovenet/config.json. Keys use that spelling, e.g. n, U, space, enter, ctrl+n, shift+tab, right.",
  );
  if (keymap.problems.length) {
    lines.push(
      "",
      `${keymap.problems.length} problem${keymap.problems.length === 1 ? "" : "s"} in player_keymap (the defaults are used for those entries):`,
    );
    for (const problem of keymap.problems) lines.push(`  - ${problem.message}`);
  }
  return lines;
}
