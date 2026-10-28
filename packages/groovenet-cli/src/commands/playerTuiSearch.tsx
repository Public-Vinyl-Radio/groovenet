import React from "react";
import { Box, Text } from "ink";
import { camelotOf, parseBpm, trackDurationLabel, type Album, type Track } from "@groovenet/client";
import { primaryKey, type Keymap } from "./playerKeymap.js";
import type { ActionId } from "./playerKeymapRegistry.js";
import { modeLabel, type PlayerSearch } from "./playerTuiSearchState.js";
import { visibleWindow } from "./playerTuiView.js";
import type { BodyArea } from "../tui/frame.js";
import { ArtSlot, Line, OutlinedBox, reverseLabel, Rule, segmentsWidth, Styled, type Hint, type Segment } from "../tui/primitives.js";
import { displayWidth, fit, fitRight } from "../tui/text.js";

export function searchHints(search: PlayerSearch, keymap: Keymap): Hint[] {
  const view = search.editing ? "input" : "search";
  const hint = (id: ActionId, label: string) => ({ keys: primaryKey(keymap, id, view), label });
  return (search.editing
    ? [hint("input.submit", "results"), hint("input.cancel", "done"), hint("list.down", "results")]
    : [{ keys: [primaryKey(keymap, "list.up", view), primaryKey(keymap, "list.down", view)].filter(Boolean).join("/"), label: "select" }, hint("list.select", "play"), hint("queue.add", search.scope === "albums" && !search.opened ? "add all" : "add"), ...(search.scope === "albums" && !search.opened ? [hint("nav.open", "open album")] : []), hint("view.search", "find"), hint("input.cancel", search.opened ? "back" : "clear")])
    .concat([hint("search.scope", search.scope === "tracks" ? "albums" : "tracks"), ...(search.scope === "tracks" ? [hint("search.mode", "mode")] : []), hint("app.help", "keys")]).filter((item) => item.keys);
}

/** Keep the insertion point visible when a query is wider than FIND. */
export function searchInputText(query: string, editing: boolean, width: number): string {
  if (!editing) return fit(` / ${query}`, width);
  const parts = Array.from(new Intl.Segmenter().segment(query), (part) => part.segment);
  let tail = "";
  for (let index = parts.length - 1; index >= 0; index--) {
    if (displayWidth(parts[index] + tail) > Math.max(0, width - 4)) break;
    tail = parts[index] + tail;
  }
  return fit(` / ${tail}▏`, width);
}

/** One search result, with a compact two-line form in narrow panes. */
export function searchTrackRows(track: Track, cursor: boolean, width: number, compact: boolean): Segment[][] {
  const role = cursor ? "selection" : "ink";
  const title = track.local_audio_url ? track.title : `${track.title} [no downloaded audio]`;
  if (compact) return [
    [{ text: `${cursor ? "›" : " "} ${fit(title, width - 8)} ${fitRight(trackDurationLabel(track) || "-:--", 5)}`, role }],
    [{ text: fit(`    ${track.artist}`, width), role: cursor ? role : "muted" }],
  ];
  const titleWidth = Math.floor(Math.max(0, width - 25) * 0.53);
  const artistWidth = Math.max(0, width - 25 - titleWidth);
  const bpm = parseBpm(track.bpm);
  return [[{ text: `${cursor ? "›" : " "} ${fit(title, titleWidth)}  ${fit(track.artist, artistWidth)}  ${fitRight(trackDurationLabel(track) || "-:--", 5)}  ${fitRight(bpm === null ? "---" : String(Math.round(bpm)), 4)}  ${fit(camelotOf(track.key) ?? "---", 6)}`, role }]];
}

function TrackList({ tracks, selected, area }: { tracks: Track[]; selected: number; area: BodyArea }) {
  const compact = area.width < 70;
  const header = compact ? 0 : 1;
  const capacity = Math.max(0, Math.floor((area.rows - header) / (compact ? 2 : 1)));
  const window = visibleWindow(tracks.length, selected, capacity);
  const title = Math.floor(Math.max(0, area.width - 25) * 0.53);
  return <>
    {!compact && area.rows > 0 ? <Styled role="dim">{fit(`  ${fit("TITLE", title)}  ${fit("ARTIST", area.width - 25 - title)}   TIME   BPM  KEY`, area.width)}</Styled> : null}
    {capacity > 0 ? tracks.slice(window.start, window.end).flatMap((track, offset) => searchTrackRows(track, window.start + offset === selected, area.width, compact).map((segments, line) => <Line key={`${offset}-${line}`} left={segments} width={area.width} />)) : null}
  </>;
}

export function albumResultRows(album: Album, cursor: boolean, width: number): Segment[][] {
  const titleWidth = Math.floor(Math.max(0, width - 10) * 0.58);
  const artistWidth = Math.max(0, width - 10 - titleWidth);
  const role = cursor ? "selection" : "ink";
  return [
    [{ text: `${cursor ? "›" : " "} ${fit(album.title, titleWidth)} ${fit(album.artist, artistWidth)} ${fitRight(String(album.year ?? "----"), 4)}`, role }],
    [{ text: fit(`    ${album.library_identifier ?? "No library ID"} · ${album.track_count ?? "?"} tracks`, width), role: cursor ? role : "dim" }],
  ];
}

function AlbumPreview({ search, area, keymap }: { search: PlayerSearch; area: BodyArea; keymap: Keymap }) {
  const album = search.detail?.album ?? search.album!;
  const width = area.width - 5;
  const art = width >= 40 && area.rows >= 14;
  const artWidth = 12;
  const textWidth = art ? width - artWidth - 2 : width;
  const tracks = search.detail?.tracks ?? [];
  const previewCount = Math.max(0, Math.min(tracks.length, area.rows - (art ? 14 : 11)));
  return <OutlinedBox width={area.width - 1} height={Math.max(3, area.rows - 1)} title={[reverseLabel(album.library_identifier ?? "ALBUM")]}>
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row">
        {art ? <Box marginRight={2}><ArtSlot width={artWidth} height={6} /></Box> : null}
        <Box flexDirection="column" width={textWidth}>
          <Styled role="strong">{fit(album.title, textWidth)}</Styled>
          <Styled role="muted">{fit(album.artist, textWidth)}</Styled>
          <Styled role="dim">{fit([album.label, album.year].filter(Boolean).join(" · "), textWidth)}</Styled>
          <Styled role="dim">{fit(`${album.track_count ?? tracks.length} tracks`, textWidth)}</Styled>
          <Text> </Text>
          <Line left={[{ text: `${primaryKey(keymap, "list.select", "search")} PLAY`, role: "reverse" }, { text: "  " }, { text: `${primaryKey(keymap, "queue.add", "search")} ADD ALL`, role: "selection" }]} width={textWidth} />
        </Box>
      </Box>
      <Text> </Text>
      <Styled role="dim">{fit("TRACKLIST", width)}</Styled>
      {search.detailLoading ? <Styled role="dim">Loading album…</Styled> : search.detailError ? <Styled role="error">{fit(search.detailError, width)}</Styled> : !tracks.length ? <Styled role="dim">No tracks in this album.</Styled> : tracks.slice(0, previewCount).map((track, index) => <Line key={index} left={[{ text: `${track.position ?? index + 1}  `, role: "dim" }, { text: track.title }]} right={[{ text: trackDurationLabel(track) || "-:--", role: "dim" }]} width={width} />)}
      {tracks.length ? <Styled role="dim">{fit(`${tracks.length > previewCount ? `… ${tracks.length - previewCount} more · ` : ""}${primaryKey(keymap, "nav.open", "search")} open album`, width)}</Styled> : null}
    </Box>
  </OutlinedBox>;
}

export function SearchView({ search, area, keymap }: { search: PlayerSearch; area: BodyArea; keymap: Keymap }) {
  const { width, rows } = area;
  const results = search.scope === "tracks" ? search.tracks : search.albums;
  const mode = modeLabel(search.scope === "albums" ? "lexical" : search.mode);
  const modeKey = primaryKey(keymap, "search.mode", search.editing ? "input" : "search");
  const scopeKey = primaryKey(keymap, "search.scope", search.editing ? "input" : "search");
  const modeHint = width >= 70 && search.scope === "tracks" && modeKey ? `  ${modeKey} mode ` : search.scope === "albums" && width >= 70 ? "  keyword only " : " ";
  const inputRight: Segment[] = [{ text: ` ${mode} `, role: "selection" }, { text: modeHint, role: "dim" }];
  const inputWidth = Math.max(0, width - 5 - segmentsWidth(inputRight));
  const bodyRows = Math.max(0, rows - 7);
  const split = width >= 100 && bodyRows >= 12;
  const listWidth = split ? Math.floor(width * 0.5) : width;
  const capacity = Math.max(0, Math.floor((bodyRows - 1) / 2));
  const window = visibleWindow(search.albums.items.length, search.selected, capacity);
  return <>
    <OutlinedBox width={width - 2} height={3} title={[reverseLabel("FIND")]}>
      <Line left={[{ text: searchInputText(search.query, search.editing, inputWidth), role: search.editing ? "strong" : "ink" }]} right={inputRight} width={width - 4} />
    </OutlinedBox>
    <Text> </Text>
    <Line left={[{ text: ` TRACKS · ${search.tracks.loading ? "…" : search.tracks.total} `, role: search.scope === "tracks" ? "reverse" : "muted" }, { text: "  " }, { text: ` ALBUMS · ${search.albums.loading ? "…" : search.albums.total} `, role: search.scope === "albums" ? "reverse" : "muted" }, { text: `  ${scopeKey} tracks / albums`, role: "dim" }]} width={width} />
    <Rule width={width} />
    {!search.query.trim() ? <Styled role="dim">Type a query to search your library.</Styled>
      : results.loading ? <Styled role="dim">Searching {search.scope}…</Styled>
      : results.error ? <Styled role="error">{fit(results.error, width)}</Styled>
      : !results.items.length ? <Styled role="dim">No {search.scope} found.</Styled>
      : search.opened ? <><Styled role="strong">{fit(`${search.album?.title} · ${search.album?.artist}`, width)}</Styled><TrackList tracks={search.detail?.tracks ?? []} selected={search.selected} area={{ width, rows: Math.max(0, bodyRows - 1) }} /></>
      : search.scope === "tracks" ? <TrackList tracks={search.tracks.items} selected={search.selected} area={{ width, rows: bodyRows }} />
      : <Box flexDirection="row">
        <Box flexDirection="column" width={listWidth}>
          <Styled role="dim">{fit("  ALBUM / ARTIST / YEAR", listWidth)}</Styled>
          {capacity > 0 ? search.albums.items.slice(window.start, window.end).flatMap((album, offset) => albumResultRows(album, window.start + offset === search.selected, listWidth - 2).map((segments, line) => <Line key={`${offset}-${line}`} left={segments} width={listWidth} />)) : null}
        </Box>
        {split && search.album ? <AlbumPreview search={search} area={{ width: width - listWidth, rows: bodyRows }} keymap={keymap} /> : null}
      </Box>}
  </>;
}
