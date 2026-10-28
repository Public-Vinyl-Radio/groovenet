import React from "react";
import { formatSeconds, isLive } from "@groovenet/client";
import type { ServerPlayer } from "@groovenet/contracts";
import type { AudioDevice } from "@groovenet/player";
import { Styled } from "../tui/primitives.js";
import { fit, wrap, truncate } from "../tui/text.js";
import { visibleWindow } from "./playerTuiView.js";
import { primaryKey, type Keymap } from "./playerKeymap.js";
import type { ActionId, KeymapView } from "./playerKeymapRegistry.js";
import type { Role } from "../tui/theme.js";

type Row = { text: string; role: Role };
export function PlayOnView({ players, chosen, current, preview, count, loading, problem, area }: {
  players: ServerPlayer[]; chosen: string; current: string; preview?: ServerPlayer | null;
  count: number; loading: boolean; problem: string; area: { width: number; rows: number };
}) {
  const rows: Row[] = [{ text: area.width < 36 ? "PLAY ON · Choose a target" : "PLAY ON · Choose where audio plays", role: "strong" }];
  const options = [{ id: "", name: "This machine · local daemon", state: "" }, ...players.map(p => ({ id: p.id, name: p.name, state: isLive(p) ? "LIVE" : "IDLE" }))];
  const selected = options.findIndex(p => p.id === chosen);
  const detail = chosen === "" ? "Playing here never stops a server. It keeps playing its queue."
    : chosen === current ? "You are controlling this server's shared queue."
      : current ? "Switch to control this server. Its queue stays here when you leave."
        : count ? `${count} upcoming tracks ${preview && isLive(preview) ? "join the end of this queue" : "start a session on an idle server"}.`
          : "Join to control its queue. No local tracks to send.";
  const compact = area.rows <= 6;
  const explanation = compact ? chosen === "" ? "Play here; servers keep playing." : chosen === current ? "Controlling this shared queue." : current ? "Switch; departing queue stays." : count ? `${count} tracks → ${preview && isLive(preview) ? "append to live queue" : "start idle session"}.` : "Control queue; no tracks sent." : detail;
  const previewRows: Row[] = wrap(explanation, area.width).map(text => ({ text, role: "muted" }));
  if (preview) {
    const index = preview.state.queue.findIndex(e => e.id === preview.state.current_entry_id);
    const entry = preview.state.queue[index];
    previewRows.unshift(
      { text: entry ? `${entry.title} · ${entry.artist}` : "Nothing playing", role: "ink" },
      { text: `${formatSeconds(preview.state.position)} · ${index < 0 ? preview.state.queue.length : preview.state.queue.length - index - 1} up next`, role: "muted" },
    );
  }
  if (loading || problem || !players.length) previewRows.push({ text: problem || (loading ? "Loading server players…" : "No server players configured."), role: problem ? "warn" : "dim" });
  // Even at the five-row body minimum, keep the selected target and explanation visible.
  const optionRows = Math.max(1, area.rows - 1 - Math.min(previewRows.length, Math.max(1, area.rows - 2)));
  const window = visibleWindow(options.length, Math.max(0, selected), optionRows);
  rows.push(...options.slice(window.start, window.end).map(p => ({ text: `${p.id === chosen ? "›" : " "} ${p.id === current ? "●" : "○"} ${p.state ? `${truncate(p.name, Math.max(0, area.width - 7 - p.state.length))} · ${p.state}` : p.name}`, role: (p.id === chosen ? "selection" : "ink") as Role })));
  rows.push(...previewRows);
  return <>{rows.slice(0, area.rows).map((row, i) => <Styled key={i} role={row.role}>{fit(row.text, area.width)}</Styled>)}</>;
}

export function DevicesView({ devices, selected, area }: { devices: AudioDevice[]; selected: number; area: { width: number; rows: number } }) {
  if (!devices.length) return <Styled role="dim">{fit("No outputs available.", area.width)}</Styled>;
  const chosen = devices[selected];
  const observations = chosen?.name.split(" · ").slice(1).join(" · ") || chosen?.description || "";
  const details = wrap(observations, area.width).slice(0, Math.max(0, area.rows - 2));
  const window = visibleWindow(devices.length, selected, Math.max(1, area.rows - details.length));
  return <>{devices.slice(window.start, window.end).map((device, row) => {
    const index = window.start + row;
    return <Styled key={index} role={index === selected ? "selection" : "ink"}>{fit(`${index === selected ? "› " : "  "}${device.name.split(" · ")[0]} [${device.id}]`, area.width)}</Styled>;
  })}{details.map((text, i) => <Styled key={`detail-${i}`} role="dim">{fit(text, area.width)}</Styled>)}</>;
}

/** Put submission and cancellation first so both fit even in the minimum pane. */
export function targetHints(keymap: Keymap, view: "play-on" | "confirmation", strip: boolean, code?: string) {
  const keyView: KeymapView = view;
  const actions: Array<[ActionId, string]> = view === "confirmation"
    ? [["target.confirm", code === "AVAILABILITY_UNKNOWN" ? "play anyway" : "take over"], ["target.cancel", "cancel"], ...(strip ? [["list.select", "full view"] as [ActionId, string]] : [])]
    : [["list.select", strip ? "full view" : "choose"], ["target.cancel", "cancel"], ["list.up", "up"], ["list.down", "down"], ["app.help", "help"], ["app.quit", "quit"]];
  return actions.map(([id, label]) => ({ keys: primaryKey(keymap, id, keyView), label })).filter(item => item.keys);
}
