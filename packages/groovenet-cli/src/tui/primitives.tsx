/**
 * Ink building blocks for the player TUI. Text is laid out as segments
 * (`{ text, role }`) so a row can be measured and fitted to an exact width
 * before it is drawn; Ink then never wraps or clips it on its own.
 */
import React, { type ReactNode } from "react";
import { Box, Text } from "ink";
import { displayWidth, progressBar, sliceWidth } from "./text.js";
import { useTheme, type Role } from "./theme.js";

export interface Segment {
  text: string;
  role?: Role;
}

export function segmentsWidth(segments: readonly Segment[]): number {
  return segments.reduce((sum, segment) => sum + displayWidth(segment.text), 0);
}

/**
 * Segments cut to `width` cells, the cut one ending in `…`. With `pad`, the
 * result is padded with plain spaces to exactly `width`.
 */
export function fitSegments(
  segments: readonly Segment[],
  width: number,
  { pad = false } = {},
): Segment[] {
  const max = Math.max(0, width);
  const total = segmentsWidth(segments);
  const out: Segment[] = [];
  if (total <= max) {
    out.push(...segments);
  } else {
    let room = max;
    for (const segment of segments) {
      const cells = displayWidth(segment.text);
      // The last cell is the ellipsis, so a segment fits whole only with a cell to spare.
      if (cells < room) {
        out.push(segment);
        room -= cells;
        continue;
      }
      if (room > 0) out.push({ ...segment, text: `${sliceWidth(segment.text, room - 1)}…` });
      break;
    }
  }
  const used = segmentsWidth(out);
  if (pad && used < max) out.push({ text: " ".repeat(max - used) });
  return out;
}

/** Text in a theme role. Views use this rather than Ink colour props. */
export function Styled({ role = "ink", children }: { role?: Role; children: ReactNode }) {
  const theme = useTheme();
  return <Text {...theme[role]}>{children}</Text>;
}

function Segments({ segments }: { segments: readonly Segment[] }) {
  return (
    <Text>
      {segments.map((segment, index) => (
        <Styled key={index} role={segment.role}>
          {segment.text}
        </Styled>
      ))}
    </Text>
  );
}

/**
 * One row exactly `width` cells wide: `left` fitted and padded, `right`
 * right-aligned. When both do not fit, `right` wins and `left` is cut.
 */
export function Line({
  left,
  right = [],
  width,
}: {
  left: readonly Segment[];
  right?: readonly Segment[];
  width: number;
}) {
  const rightFitted = fitSegments(right, width);
  const rightWidth = segmentsWidth(rightFitted);
  const gap = rightWidth && rightWidth < width ? 1 : 0;
  const leftFitted = fitSegments(left, width - rightWidth - gap, { pad: true });
  return <Segments segments={[...leftFitted, ...(gap ? [{ text: " " }] : []), ...rightFitted]} />;
}

/** `GROOVENET`, `NOW PLAYING`, the active tab: inverse bold with a cell of padding. */
export function reverseLabel(text: string): Segment {
  return { text: ` ${text} `, role: "reverse" };
}

export function ReverseLabel({ text }: { text: string }) {
  return <Segments segments={[reverseLabel(text)]} />;
}

/** The bar as segments: the played part strong, the rest dim. */
export function progressSegments(
  position: number,
  duration: number | null,
  width: number,
): Segment[] {
  const bar = progressBar(position, duration, width);
  const filled = bar.match(/^━*/)![0];
  const segments: Segment[] = [
    { text: filled, role: "strong" },
    { text: bar.slice(filled.length), role: "dim" },
  ];
  return segments.filter((segment) => segment.text);
}

export function ProgressBar({
  position,
  duration,
  width,
}: {
  position: number;
  duration: number | null;
  width: number;
}) {
  return <Segments segments={progressSegments(position, duration, width)} />;
}

/** A full-width rule: `━` under the tabs, a dim `─` above the hint bar. */
export function Rule({ width, heavy = false }: { width: number; heavy?: boolean }) {
  return (
    <Styled role={heavy ? "ink" : "dim"}>{(heavy ? "━" : "─").repeat(Math.max(0, width))}</Styled>
  );
}

export interface Hint {
  keys: string;
  label: string;
}

const HINT_GAP = "   ";

/** Hints as segments, keeping only the whole hints that fit in `width`. */
export function hintSegments(hints: readonly Hint[], width: number): Segment[] {
  const out: Segment[] = [];
  let used = 0;
  for (const hint of hints) {
    const item: Segment[] = [
      ...(out.length ? [{ text: HINT_GAP }] : []),
      { text: hint.keys, role: "strong" as const },
      { text: ` ${hint.label}`, role: "dim" as const },
    ];
    const cells = segmentsWidth(item);
    if (used + cells > width) break;
    out.push(...item);
    used += cells;
  }
  return out;
}

/** `key label   key label`, key strong and label dim; hints that do not fit are dropped whole. */
export function HintBar({ hints, width }: { hints: readonly Hint[]; width: number }) {
  return <Line left={hintSegments(hints, width)} width={width} />;
}

/** The fixed artwork placeholder: a `░` block with `ART` in the middle. */
export function ArtSlot({ width, height }: { width: number; height: number }) {
  const label = " ART ";
  const middle = Math.floor((height - 1) / 2);
  const before = Math.max(0, Math.floor((width - label.length) / 2));
  const after = Math.max(0, width - before - label.length);
  return (
    <Box flexDirection="column" width={width} height={height} flexShrink={0}>
      {Array.from({ length: height }, (_, row) =>
        row === middle && width >= label.length ? (
          <Text key={row}>
            <Styled role="dim">{"░".repeat(before)}</Styled>
            <Styled role="muted">{label}</Styled>
            <Styled role="dim">{"░".repeat(after)}</Styled>
          </Text>
        ) : (
          <Styled key={row} role="dim">
            {"░".repeat(width)}
          </Styled>
        ),
      )}
    </Box>
  );
}

/**
 * The outlined box: `┏━┓┃┗┛` with a hard shadow, `▐` down the right edge and
 * a `▀` row underneath, so it takes `width + 1` columns and `height + 1` rows.
 * `title` sits in the top border. Children get `width - 2` × `height - 2`
 * cells and are clipped to them.
 */
export function OutlinedBox({
  width,
  height,
  title = [],
  shadow = true,
  children,
}: {
  width: number;
  height: number;
  title?: readonly Segment[];
  shadow?: boolean;
  children?: ReactNode;
}) {
  const inner = Math.max(0, width - 2);
  const innerRows = Math.max(0, height - 2);
  const label = fitSegments(title, Math.max(0, inner - 1));
  const fill = Math.max(0, inner - 1 - segmentsWidth(label));
  const column = (char: string) => Array.from({ length: innerRows }, () => char).join("\n");
  return (
    <Box flexDirection="column" width={width + (shadow ? 1 : 0)} flexShrink={0}>
      <Text>
        {inner ? "┏━" : "┏"}
        <Segments segments={label} />
        {"━".repeat(fill)}┓
      </Text>
      {innerRows > 0 ? (
        <Box flexDirection="row" height={innerRows}>
          <Text>{column("┃")}</Text>
          {/* The inner box must not shrink, or Yoga squeezes rows out of the top instead of clipping the bottom. */}
          <Box flexDirection="column" width={inner} height={innerRows} overflow="hidden">
            <Box flexDirection="column" flexShrink={0}>
              {children}
            </Box>
          </Box>
          <Text>{column("┃")}</Text>
          {shadow ? <Styled role="shadow">{column("▐")}</Styled> : null}
        </Box>
      ) : null}
      <Text>
        ┗{"━".repeat(inner)}┛{shadow ? <Styled role="shadow">▐</Styled> : null}
      </Text>
      {shadow ? (
        <Text>
          {" "}
          <Styled role="shadow">{"▀".repeat(width)}</Styled>
        </Text>
      ) : null}
    </Box>
  );
}
