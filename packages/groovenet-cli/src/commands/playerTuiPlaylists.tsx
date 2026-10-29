import { ArtworkSlot } from "../tui/artworkSlot.js";
import { artworkSource } from "../tui/artwork.js";
import React from "react";
import { Box } from "ink";
import { camelotOf, parseBpm, type Playlist, type Track } from "@groovenet/client";
import { primaryKey, type Keymap } from "./playerKeymap.js";
import type { ActionId } from "./playerKeymapRegistry.js";
import { playlistDate, playlistDuration, type PlayerPlaylists } from "./playerTuiPlaylistsState.js";
import { searchInputText } from "./playerTuiSearch.js";
import { visibleWindow } from "./playerTuiView.js";
import type { BodyArea } from "../tui/frame.js";
import { Line, OutlinedBox, reverseLabel, Styled, type Hint, type Segment } from "../tui/primitives.js";
import { fit, fitRight } from "../tui/text.js";

export function playlistHints(state: PlayerPlaylists, keymap: Keymap): Hint[] {
  const view = state.editing ? "input" : "playlists";
  const hint = (id: ActionId, label: string) => ({ keys: primaryKey(keymap, id, view), label });
  return (state.editing ? [hint("input.submit", "results"), hint("input.cancel", "done"), hint("list.down", "results")]
    : [{ keys: [primaryKey(keymap, "list.up", view), primaryKey(keymap, "list.down", view)].filter(Boolean).join("/"), label: "select" }, hint("list.select", "play"), hint("queue.add", "enqueue"), ...(state.opened ? [] : [hint("nav.open", "open tracks")]), hint("playlists.filter", "filter"), hint("input.cancel", state.opened ? "back" : "clear")])
    .concat(hint("app.help", "keys")).filter((hint) => hint.keys);
}

export function playlistRow(playlist: Playlist, selected: boolean, width: number): Segment[] {
  const role = selected ? "selection" : "ink";
  const tag = playlist.set ? " SET" : "    ";
  return [
    { text: `${selected ? "›" : " "} ${fit(playlist.name, width - 22)}`, role },
    { text: tag, role: selected ? role : playlist.set ? "reverse" : "dim" },
    { text: ` ${fitRight(String(playlist.tracks.length), 4)} ${fitRight(playlistDuration(playlist), 9)}`, role: selected ? role : "muted" },
  ];
}

/** Preview/full table share columns and terminal-cell-aware formatting. */
export function playlistTrackRow(track: Track | null, index: number, selected: boolean, width: number): Segment[] {
  const titleWidth = Math.floor(Math.max(0, width - 18) * 0.55);
  const artistWidth = Math.max(0, width - 18 - titleWidth);
  const bpm = track ? parseBpm(track.bpm) : null;
  return [{ text: `${fitRight(track ? String(index + 1) : "#", 3)} ${fit(track ? track.title : "TITLE", titleWidth)} ${fit(track ? track.artist : "ARTIST", artistWidth)} ${fitRight(track ? bpm === null ? "---" : String(Math.round(bpm)) : "BPM", 4)} ${fitRight(track ? camelotOf(track.key) ?? "---" : "KEY", 5)}`, role: selected ? "selection" : track ? "ink" : "dim" }];
}

function PlaylistTracks({ state, area, preview = false }: { state: PlayerPlaylists; area: BodyArea; preview?: boolean }) {
  if (area.rows <= 0) return null;
  if (state.detailLoading) return <Line left={[{ text: "Loading playlist…", role: "dim" }]} width={area.width} />;
  if (state.detailError) return <Line left={[{ text: state.detailError, role: "error" }]} width={area.width} />;
  if (!state.entries.length) return <Styled role="dim">{fit("No tracks in this playlist.", area.width)}</Styled>;
  const warning = state.missingMessage ? <Line left={[{ text: state.missingMessage, role: "warn" }]} width={area.width} /> : null;
  const rows = area.rows - (warning ? 1 : 0);
  if (rows <= 0) return warning;
  const compact = area.width < 42;
  const capacity = Math.max(0, Math.floor((rows - (compact ? 0 : 1)) / (compact ? 2 : 1)));
  const window = visibleWindow(state.entries.length, preview ? 0 : state.selected, capacity);
  return <>
    {warning}
    {!compact ? <Line left={playlistTrackRow(null, 0, false, area.width)} width={area.width} /> : null}
    {capacity ? state.entries.slice(window.start, window.end).map(({ track, ref }, offset) => {
      const index = window.start + offset;
      const selected = !preview && index === state.selected;
      if (!track) {
        const role = selected ? "selection" : "warn";
        const identity = `friend ${ref.friend_id} · ${ref.track_id}`;
        return compact ? <React.Fragment key={index}>
          <Line left={[{ text: `${index + 1} Unavailable track`, role }]} width={area.width} />
          <Line left={[{ text: `  ${identity}`, role }]} width={area.width} />
        </React.Fragment> : <Line key={index} left={[{ text: `${fitRight(String(index + 1), 3)} Unavailable track · ${identity}`, role }]} width={area.width} />;
      }
      return compact ? <React.Fragment key={index}>
        <Line left={[{ text: `${index + 1} ${track.title}`, role: selected ? "selection" : "ink" }]} width={area.width} />
        <Line left={[{ text: `  ${track.artist} · ${parseBpm(track.bpm) ?? "---"} · ${camelotOf(track.key) ?? "---"}`, role: selected ? "selection" : "muted" }]} width={area.width} />
      </React.Fragment> : <Line key={index} left={playlistTrackRow(track, index, selected, area.width)} width={area.width} />;
    }) : null}
  </>;
}

function PlaylistList({ state, area }: { state: PlayerPlaylists; area: BodyArea }) {
  const lines: Array<{ segments: Segment[]; selected?: boolean }> = [];
  let index = 0;
  for (const group of state.groups) {
    lines.push({ segments: [reverseLabel(group.label)] });
    for (const playlist of group.playlists) {
      const selected = index++ === state.selected;
      if (area.width <= 40) {
        lines.push({ segments: [{ text: `${selected ? "›" : " "} ${playlist.name}`, role: selected ? "selection" : "ink" }], selected });
        lines.push({ segments: [{ text: `  ${playlist.set ? "SET · " : ""}${playlist.tracks.length} tracks · ${playlistDuration(playlist)}`, role: selected ? "selection" : "dim" }], selected });
      } else lines.push({ segments: playlistRow(playlist, selected, area.width), selected });
    }
  }
  const selected = Math.max(0, lines.reduce((last, line, index) => line.selected ? index : last, -1));
  const window = visibleWindow(lines.length, selected, area.rows);
  // Repeat the current section when scrolling past its divider.
  const header = lines.slice(0, window.start + 1).reduce((last, line, index) => line.segments[0]?.role === "reverse" ? index : last, -1);
  const repeat = window.start > header && header >= 0 && area.rows > 2;
  return <>{repeat ? <Line left={lines[header].segments} width={area.width} /> : null}
    {lines.slice(window.start + (repeat ? 1 : 0), window.end).map((line, index) => <Line key={index} left={line.segments} width={area.width} />)}
  </>;
}

/** Prefer full track artwork over the list endpoint’s thumbnails; try another cover if one is stale. */
export function playlistArtworkSources(playlist: Playlist, tracks: Track[]): string[] {
  return [...new Set([
    playlist.set?.cover_image_url,
    ...tracks.map(artworkSource).filter(Boolean).slice(0, 4),
    ...(playlist.cover_urls ?? []).slice(0, 4),
  ].filter((url): url is string => !!url))];
}

function PlaylistPreview({ state, area, keymap }: { state: PlayerPlaylists; area: BodyArea; keymap: Keymap }) {
  const playlist = state.playlist!;
  const width = area.width - 5;
  const sources = playlistArtworkSources(playlist, state.tracks);
  const art = sources.length > 0 && width >= 40 && area.rows >= 20;
  const date = playlistDate(playlist)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? "Undated";
  const actions: Segment[] = [];
  for (const [id, label] of [["list.select", "PLAY"], ["queue.add", "ENQUEUE"], ["nav.open", "OPEN"]] as const) {
    const key = primaryKey(keymap, id, "playlists");
    if (key) actions.push({ text: `${key} ${label}`, role: id === "list.select" ? "reverse" : "selection" }, { text: "  " });
  }
  return <OutlinedBox width={area.width - 1} height={area.rows - 1} title={[reverseLabel("PLAYLIST")]}>
    <Box flexDirection="column" paddingX={1}>
      {art ? <ArtworkSlot source={sources[0]} fallbacks={sources.slice(1)} width={12} height={6} /> : null}
      <Styled role="strong">{fit(playlist.name, width)}</Styled>
      <Styled role="dim">{fit(`${playlist.tracks.length} tracks · ${playlistDuration(playlist)} · ${date}`, width)}</Styled>
      <Styled> </Styled>
      <Line left={actions} width={width} />
      <Styled> </Styled>
      <PlaylistTracks state={state} area={{ width, rows: Math.max(0, area.rows - 9 - (art ? 6 : 0)) }} preview />
      {state.tracks.length ? <Styled role="dim">{fit(`${state.entries.length} tracks · ${primaryKey(keymap, "nav.open", "playlists")} open tracks`, width)}</Styled> : null}
    </Box>
  </OutlinedBox>;
}

export function PlaylistsView({ state, area, keymap }: { state: PlayerPlaylists; area: BodyArea; keymap: Keymap }) {
  if (area.rows <= 0) return null;
  const filter = state.editing || !!state.query;
  const rows = Math.max(0, area.rows - (filter ? 1 : 0));
  const split = !state.opened && area.width >= 80 && rows >= 10;
  const listWidth = split ? Math.max(30, Math.floor(area.width * 0.38)) : area.width;
  return <>
    {filter ? <Line left={[reverseLabel("FILTER"), { text: searchInputText(state.query, state.editing, area.width - 8), role: state.editing ? "strong" : "muted" }]} width={area.width} /> : null}
    {rows <= 0 ? null : state.loading ? <Styled role="dim">Loading playlists…</Styled>
      : state.error ? <Line left={[{ text: state.error, role: "error" }]} width={area.width} />
      : !state.playlist ? <Styled role="dim">{state.playlists.length ? "No playlists match this filter." : "No playlists."}</Styled>
      : state.opened ? <>
        <Styled role="strong">{fit(state.playlist!.name, area.width)}</Styled>
        <PlaylistTracks state={state} area={{ width: area.width, rows: rows - 1 }} />
      </> : <Box flexDirection="row">
        <Box flexDirection="column" width={listWidth}><PlaylistList state={state} area={{ width: listWidth - (split ? 2 : 0), rows }} /></Box>
        {split && state.playlist ? <PlaylistPreview state={state} area={{ width: area.width - listWidth, rows }} keymap={keymap} /> : null}
      </Box>}
  </>;
}
