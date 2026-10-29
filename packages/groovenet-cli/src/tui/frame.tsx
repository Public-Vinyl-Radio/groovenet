/**
 * The player's frame: top bar, Now Playing card, tabs, body, status line and
 * hint bar, laid out for the layout `pickLayout` chose. Views render only into
 * the two slots it hands them, `nowPlaying` and `children` (the body), each
 * given the exact cells it has.
 */
import React, { type ReactNode } from "react";
import { Box, Text } from "ink";
import type { HelpEntry } from "../commands/playerKeymap.js";
import {
  CARD_ROWS,
  FULL_MIN_COLUMNS,
  FULL_MIN_ROWS,
  SIDE_MIN_COLUMNS,
  SIDE_MIN_ROWS,
  STRIP_MIN_COLUMNS,
  STRIP_ROWS,
  type Layout,
  type LayoutKind,
} from "./layout.js";
import {
  fitSegments,
  HintBar,
  Line,
  OutlinedBox,
  reverseLabel,
  Rule,
  Styled,
  type Hint,
  type Segment,
} from "./primitives.js";
import { ArtworkSlot } from "./artworkSlot.js";
import { displayWidth, fit, wrap } from "./text.js";

/** `live`: connected to a server player; `offline`: its connection dropped; null: local playback. */
export type LiveState = "live" | "offline" | null;

export interface TabItem {
  /** The key that opens it, already formatted (`primaryKey`). */
  keys: string;
  label: string;
  count?: number;
  active: boolean;
}

/**
 * What the card's text gets: right of the art in full and side, the whole
 * first row in the strip. The side pane also calls `nowPlaying` a second time
 * with `region: "below"`, for the card's full width under the art.
 */
export interface CardArea {
  kind: Exclude<LayoutKind, "too-small">;
  width: number;
  height: number;
  region?: "below";
}

export interface BodyArea {
  width: number;
  rows: number;
}

export interface PlayerFrameProps {
  layout: Layout;
  /** Where audio plays: the server player's name, or `LOCAL`. */
  target: string;
  live: LiveState;
  /** Formatted `app.help` / `app.quit` keys for the top bar; empty when unbound. */
  helpKeys: string;
  quitKeys: string;
  tabs: TabItem[];
  status: { left: Segment[]; right?: Segment[] };
  /** A message that replaces the status line (and the strip's hints) while set. */
  alert?: Segment[] | null;
  hints: Hint[];
  /** When set, the `?` overlay replaces the body (and the strip's hints). */
  help?: HelpEntry[] | null;
  /** Search uses a compact playback summary in the top bar. */
  compactPlayback?: Segment[];
  artwork?: string;
  nowPlaying: (area: CardArea) => ReactNode;
  children: (area: BodyArea) => ReactNode;
}

function liveMarker(live: LiveState, short: boolean): Segment[] {
  if (live === "live") return [{ text: short ? "●" : "● LIVE", role: "live" }];
  if (live === "offline") return [{ text: short ? "○" : "○ DISCONNECTED", role: "error" }];
  return [];
}

function keyHint(keys: string, label: string): Segment[] {
  return keys
    ? [
        { text: keys, role: "strong" },
        { text: ` ${label}`, role: "dim" },
      ]
    : [];
}

/** `GROOVENET  PLAY ON LOUNGE ● LIVE … ? help   q quit`; the side pane keeps the brand and target only. */
export function TopBar({
  kind,
  width,
  target,
  live,
  helpKeys,
  quitKeys,
  playback = [],
}: {
  playback?: Segment[];
  kind: "full" | "side";
  width: number;
  target: string;
  live: LiveState;
  helpKeys: string;
  quitKeys: string;
}) {
  const marker = liveMarker(live, kind === "side");
  if (kind === "side") {
    return (
      <Line
        left={[reverseLabel("GROOVENET")]}
        right={[
          { text: target, role: "strong" },
          ...(marker.length ? [{ text: " " }, ...marker] : []),
        ]}
        width={width}
      />
    );
  }
  const help = keyHint(helpKeys, "help");
  const quit = keyHint(quitKeys, "quit");
  const right = [...help, ...(help.length && quit.length ? [{ text: "   " }] : []), ...quit];
  const left: Segment[] = [
    reverseLabel("GROOVENET"),
    { text: " " },
    { text: "PLAY ON ", role: "dim" },
    { text: target, role: "strong" },
    ...(marker.length ? [{ text: " " }, ...marker] : []),
  ];
  return (
    <Line
      left={[...left, ...(playback.length ? [{ text: "   " }, ...playback] : [])]}
      right={right}
      width={width}
    />
  );
}

/** The tab row as segments. The side pane shows only the active tab's label. */
export function tabSegments(tabs: readonly TabItem[], kind: "full" | "side"): Segment[] {
  const out: Segment[] = [];
  for (const tab of tabs) {
    if (out.length) out.push({ text: " " });
    const label = `${tab.label}${tab.count !== undefined ? ` · ${tab.count}` : ""}`;
    if (tab.active)
      out.push({ text: ` ${tab.keys ? `${tab.keys} ` : ""}${label} `, role: "reverse" });
    else if (kind === "side")
      out.push({ text: " " }, { text: tab.keys, role: "strong" }, { text: " " });
    else
      out.push(
        { text: " " },
        ...(tab.keys ? [{ text: tab.keys, role: "strong" as const }, { text: " " }] : []),
        { text: `${label} `, role: "muted" },
      );
  }
  return out;
}

const COLUMN_GAP = 2;

/** The `?` overlay: every key live in the view, in two columns when there is room. */
export function HelpOverlay({
  entries,
  width,
  rows,
}: {
  entries: readonly HelpEntry[];
  width: number;
  rows: number;
}) {
  const boxRows = Math.max(3, rows - 1);
  const inner = width - 2;
  const columns = inner >= 76 ? 2 : 1;
  const perColumn = boxRows - 2;
  // Each column keeps a gap on its right, so a cut description never touches the next key.
  const columnWidth = Math.floor((inner - 1) / columns);
  const keyWidth = Math.min(
    14,
    Math.max(...entries.map((entry) => displayWidth(entry.keys)), 4) + 2,
  );
  const lines = Array.from({ length: perColumn }, (_, row) =>
    Array.from({ length: columns }, (_, column) => entries[column * perColumn + row]),
  );
  const hidden = Math.max(0, entries.length - perColumn * columns);
  return (
    <OutlinedBox
      width={width}
      height={boxRows}
      title={[
        reverseLabel("KEYS"),
        ...(hidden ? [{ text: ` +${hidden} more `, role: "dim" as const }] : []),
      ]}
    >
      {lines.map((cells, row) => (
        <Box key={row} paddingLeft={1}>
          {cells.map((entry, column) =>
            entry ? (
              <Box key={column} width={columnWidth}>
                <Line
                  left={[
                    { text: fit(entry.keys, keyWidth), role: "strong" },
                    { text: entry.description },
                  ]}
                  width={columnWidth - COLUMN_GAP}
                />
              </Box>
            ) : null,
          )}
        </Box>
      ))}
    </OutlinedBox>
  );
}

export function TooSmall({ layout }: { layout: Layout }) {
  const width = Math.max(1, layout.columns);
  const text = `Terminal too small (${layout.columns}×${layout.rows}). Needs ${STRIP_MIN_COLUMNS}×${STRIP_ROWS} for the strip, ${SIDE_MIN_COLUMNS}×${SIDE_MIN_ROWS} for the side pane or ${FULL_MIN_COLUMNS}×${FULL_MIN_ROWS} for the full window.`;
  return (
    <Box flexDirection="column">
      {wrap(text, width)
        .slice(0, Math.max(1, layout.rows))
        .map((line, index) => (
          <Styled key={index} role="warn">
            {line}
          </Styled>
        ))}
    </Box>
  );
}

function helpLine(entries: readonly HelpEntry[]): Hint[] {
  return entries.map((entry) => ({ keys: entry.keys, label: entry.description }));
}

function Strip({ layout, target, live, alert, hints, help, nowPlaying }: PlayerFrameProps) {
  const inner = layout.boxWidth - 2;
  const title = [
    reverseLabel("GROOVENET"),
    { text: " " },
    { text: ` ${target} `, role: "strong" as const },
    ...liveMarker(live, true),
    { text: " " },
  ];
  return (
    <OutlinedBox width={layout.boxWidth} height={CARD_ROWS.strip} title={title}>
      <Box paddingX={1} height={1}>
        {nowPlaying({ kind: "strip", width: inner - 2, height: 1 })}
      </Box>
      <Box paddingX={1} height={1}>
        {alert ? (
          <Line left={alert} width={inner - 2} />
        ) : (
          <HintBar hints={help ? helpLine(help) : hints} width={inner - 2} />
        )}
      </Box>
    </OutlinedBox>
  );
}

/** The whole screen for `layout`. Below every minimum it is the "too small" message alone. */
export function PlayerFrame(props: PlayerFrameProps) {
  const {
    layout,
    target,
    live,
    helpKeys,
    quitKeys,
    tabs,
    status,
    alert,
    hints,
    help,
    nowPlaying,
    children,
    compactPlayback,
  } = props;
  if (layout.kind === "too-small") return <TooSmall layout={layout} />;
  if (layout.kind === "strip") return <Strip {...props} />;
  const { kind, columns, boxWidth } = layout;
  const bodyRows = layout.bodyRows + (compactPlayback ? CARD_ROWS[kind] + 2 : 0);
  const art = layout.art!;
  const inner = boxWidth - 2;
  const gap = kind === "full" ? 3 : 2;
  const cardHeight = CARD_ROWS[kind] - 2;
  // Beside the art in both layouts; the side pane's taller card has rows under the art too, after a blank row.
  const cardText = {
    kind,
    width: Math.max(0, inner - 1 - art.width - gap - 1),
    height: kind === "side" ? art.height : cardHeight,
  };
  const below =
    kind === "side"
      ? {
          kind,
          region: "below" as const,
          width: Math.max(0, inner - 2),
          height: Math.max(0, cardHeight - art.height - 1),
        }
      : null;
  return (
    <Box flexDirection="column" width={columns} height={layout.rows}>
      <TopBar
        kind={kind}
        width={columns}
        target={target}
        live={live}
        helpKeys={helpKeys}
        quitKeys={quitKeys}
        playback={compactPlayback}
      />
      <Text> </Text>
      {!compactPlayback ? (
        <>
          <OutlinedBox
            width={boxWidth}
            height={CARD_ROWS[kind]}
            title={[reverseLabel("NOW PLAYING")]}
          >
            <Box flexDirection="column" paddingLeft={1}>
              <Box flexDirection="row">
                <ArtworkSlot source={props.artwork} width={art.width} height={art.height} />
                <Box
                  flexDirection="column"
                  marginLeft={gap}
                  width={cardText.width}
                  height={cardText.height}
                  overflow="hidden"
                >
                  {nowPlaying(cardText)}
                </Box>
              </Box>
              {below ? (
                <Box
                  flexDirection="column"
                  marginTop={1}
                  width={below.width}
                  height={below.height}
                  overflow="hidden"
                >
                  {nowPlaying(below)}
                </Box>
              ) : null}
            </Box>
          </OutlinedBox>
          <Text> </Text>
        </>
      ) : null}
      <Line left={fitSegments(tabSegments(tabs, kind), columns)} width={columns} />
      <Rule width={columns} heavy />
      <Box flexDirection="column" height={bodyRows} overflow="hidden">
        <Box flexDirection="column" flexShrink={0}>
          {help ? (
            <HelpOverlay entries={help} width={boxWidth} rows={bodyRows} />
          ) : (
            children({ width: columns, rows: bodyRows })
          )}
        </Box>
      </Box>
      <Line left={alert ?? status.left} right={status.right} width={columns} />
      <Rule width={columns} />
      <HintBar hints={hints} width={columns} />
    </Box>
  );
}
