/**
 * Every action the player TUI can perform, with its default keys. The keymap,
 * hint bar, help line, `player keys` and the TUI's dispatch all read this table,
 * so nothing about keys is written anywhere else.
 */

/**
 * Where an action applies. `input` is the mode while typing in the search box:
 * only `input` actions apply there, and everything else is typed.
 */
export type KeymapView = "queue" | "search" | "playlists" | "devices" | "input";

export const KEYMAP_VIEWS: readonly KeymapView[] = ["queue", "search", "playlists", "devices", "input"];

/** Views that show a list, i.e. every view except the typing mode. */
const LISTS = ["queue", "search", "playlists", "devices"] as const;

export interface ActionDef {
  id: string;
  description: string;
  views: readonly KeymapView[];
  /** Default keys, in `player_keymap` spelling. The first is the one hints show. */
  keys: readonly string[];
  /** Defaults that replace `keys` in a view, where the usual key means something else there. */
  viewKeys?: Partial<Record<KeymapView, readonly string[]>>;
  /** Short label for the hint bar; actions without one are not hinted. Adjacent equal labels share a hint (`n/p skip`). */
  hint?: string;
  /** Only available when controlling a server player (`player --remote`). */
  remoteOnly?: boolean;
}

export const ACTIONS = [
  { id: "list.up", description: "Move the selection up", views: LISTS, keys: ["up", "k"], hint: "select" },
  { id: "list.down", description: "Move the selection down", views: LISTS, keys: ["down", "j"], hint: "select" },
  { id: "list.select", description: "Play the queue entry, add the track or playlist, or pick the output (in the strip: open the full view)", views: LISTS, keys: ["enter"], hint: "add/play" },
  { id: "transport.play", description: "Start or resume playback", views: LISTS, keys: ["r"], hint: "play" },
  { id: "queue.add", description: "Add the selected track or playlist to the queue", views: ["search", "playlists"], keys: ["a"], hint: "add" },
  { id: "queue.remove", description: "Remove the selected entry from the queue", views: ["queue"], keys: ["x", "backspace"], hint: "remove" },
  { id: "queue.move-up", description: "Move the selected queue entry up", views: ["queue"], keys: ["["], hint: "move" },
  { id: "queue.move-down", description: "Move the selected queue entry down", views: ["queue"], keys: ["]"], hint: "move" },
  { id: "transport.toggle", description: "Pause or resume", views: LISTS, keys: ["space"], hint: "pause" },
  { id: "transport.next", description: "Skip to the next track", views: LISTS, keys: ["n"], hint: "skip" },
  { id: "transport.prev", description: "Go back to the previous track", views: LISTS, keys: ["p"], hint: "skip" },
  {
    id: "transport.seek-back", description: "Seek back 10 seconds", views: LISTS, keys: ["left", "<"], hint: "seek",
    viewKeys: { search: ["<"], playlists: ["<"] },
  },
  {
    id: "transport.seek-forward", description: "Seek forward 10 seconds", views: LISTS, keys: ["right", ">"], hint: "seek",
    viewKeys: { search: [">"], playlists: [">"] },
  },
  { id: "transport.volume-up", description: "Raise the volume 5%", views: LISTS, keys: ["+", "="], hint: "volume" },
  { id: "transport.volume-down", description: "Lower the volume 5%", views: LISTS, keys: ["-"], hint: "volume" },
  { id: "view.search", description: "Search the collection", views: LISTS, keys: ["/"], hint: "search" },
  { id: "view.playlists", description: "Show playlists", views: LISTS, keys: ["l"], hint: "playlists" },
  { id: "view.queue", description: "Show the queue", views: LISTS, keys: ["u"], hint: "queue" },
  { id: "view.devices", description: "Show audio outputs", views: LISTS, keys: ["d"], hint: "devices" },
  { id: "play-on.open", description: "Choose where to play (the output list)", views: ["queue", "search", "playlists"], keys: ["o"], hint: "play on" },
  { id: "nav.open", description: "Open the selected album or playlist", views: ["search", "playlists"], keys: ["right"] },
  { id: "search.scope", description: "Switch between track and album results", views: ["search", "input"], keys: ["tab"] },
  { id: "search.mode", description: "Cycle the search mode", views: ["search", "input"], keys: ["shift+tab"] },
  { id: "app.debug", description: "Show or hide the debug panel", views: LISTS, keys: ["~"] },
  { id: "app.help", description: "Show or hide the key list", views: LISTS, keys: ["?"], hint: "help" },
  { id: "app.quit", description: "Quit the player (a server player keeps playing)", views: LISTS, keys: ["q"], hint: "quit" },
  { id: "input.submit", description: "Run the search", views: ["input"], keys: ["enter"], hint: "search" },
  { id: "input.cancel", description: "Stop typing and keep the query", views: ["input"], keys: ["esc"], hint: "cancel" },
  { id: "input.backspace", description: "Delete the last character", views: ["input"], keys: ["backspace"] },
  { id: "devices.play-allow-unknown", description: "Play the desired output, allowing unknown activity", views: ["devices"], keys: ["U"], hint: "play desired output allowing unknown", remoteOnly: true },
  { id: "devices.play-takeover", description: "Play the desired output, taking over occupied activity", views: ["devices"], keys: ["T"], hint: "play desired output taking over occupied", remoteOnly: true },
  { id: "devices.transfer", description: "Transfer the selected output here and play", views: ["devices"], keys: ["t"], hint: "transfer+play", remoteOnly: true },
  { id: "devices.transfer-allow-unknown", description: "Transfer the selected output, allowing unknown activity", views: ["devices"], keys: ["Y"], hint: "transfer allowing unknown", remoteOnly: true },
  { id: "devices.transfer-takeover", description: "Transfer the selected output, taking over occupied activity", views: ["devices"], keys: ["!"], hint: "transfer taking over occupied", remoteOnly: true },
  { id: "transport.stop", description: "Stop playback (the server player is kept)", views: LISTS, keys: ["s"], hint: "stop", remoteOnly: true },
] as const satisfies readonly ActionDef[];

export type ActionId = (typeof ACTIONS)[number]["id"];
