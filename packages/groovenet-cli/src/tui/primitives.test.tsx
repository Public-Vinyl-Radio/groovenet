import React from "react";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ArtSlot,
  fitSegments,
  HintBar,
  hintSegments,
  Line,
  OutlinedBox,
  ProgressBar,
  progressSegments,
  ReverseLabel,
  Rule,
  segmentsWidth,
  Styled,
} from "./primitives.js";
import { forceTerminal } from "./testing.js";
import { ThemeContext, makeTheme } from "./theme.js";

beforeEach(() => {
  forceTerminal(120, 40);
});
afterEach(() => {
  cleanup();
});

const text = (segments: { text: string }[]) => segments.map((segment) => segment.text).join("");

describe("fitSegments", () => {
  const segments = [{ text: "Money " }, { text: "Trees", role: "strong" as const }];

  it("keeps segments that fit and pads on request", () => {
    expect(fitSegments(segments, 20)).toEqual(segments);
    expect(text(fitSegments(segments, 13, { pad: true }))).toBe("Money Trees  ");
  });

  it("cuts across segments with an ellipsis in the cut one's role", () => {
    expect(fitSegments(segments, 8)).toEqual([{ text: "Money " }, { text: "T…", role: "strong" }]);
    // A segment that exactly fills the room still needs a cell for the ellipsis.
    expect(fitSegments(segments, 6)).toEqual([{ text: "Money…" }]);
    expect(fitSegments([{ text: "東京" }, { text: "の夜" }], 5)).toEqual([
      { text: "東京" },
      { text: "…" },
    ]);
    expect(fitSegments(segments, 0)).toEqual([]);
    expect(segmentsWidth(fitSegments([{ text: "東京の夜" }], 4, { pad: true }))).toBe(4);
  });
});

describe("hintSegments", () => {
  const hints = [
    { keys: "↑/↓", label: "select" },
    { keys: "Enter", label: "play" },
    { keys: "q", label: "quit" },
  ];

  it("joins hints with a gap and drops whole hints that do not fit", () => {
    expect(text(hintSegments(hints, 80))).toBe("↑/↓ select   Enter play   q quit");
    expect(text(hintSegments(hints, 24))).toBe("↑/↓ select   Enter play");
    expect(hintSegments(hints, 5)).toEqual([]);
    expect(hintSegments(hints, 80)[0]).toEqual({ text: "↑/↓", role: "strong" });
  });
});

describe("progressSegments", () => {
  it("splits the bar into a strong played part and a dim rest, omitting empty parts", () => {
    expect(progressSegments(50, 100, 4)).toEqual([
      { text: "━━", role: "strong" },
      { text: "──", role: "dim" },
    ]);
    expect(progressSegments(0, null, 3)).toEqual([{ text: "───", role: "dim" }]);
    expect(progressSegments(100, 100, 2)).toEqual([{ text: "━━", role: "strong" }]);
  });
});

describe("primitives", () => {
  it("draws an outlined box with its title, clipped content and hard shadow", () => {
    const app = render(
      <OutlinedBox width={12} height={4} title={[{ text: " NOW PLAYING ", role: "reverse" }]}>
        <Styled>first</Styled>
        <Styled>second</Styled>
        <Styled>clipped</Styled>
      </OutlinedBox>,
    );
    expect(app.lastFrame()).toBe(
      ["┏━ NOW PLA…┓", "┃first     ┃▐", "┃second    ┃▐", "┗━━━━━━━━━━┛▐", " ▀▀▀▀▀▀▀▀▀▀▀▀"].join(
        "\n",
      ),
    );
  });

  it("draws a box without a shadow or interior", () => {
    const app = render(<OutlinedBox width={4} height={2} shadow={false} />);
    expect(app.lastFrame()).toBe("┏━━┓\n┗━━┛");
    expect(
      render(
        <OutlinedBox width={4} height={3} shadow={false}>
          <Styled>ab</Styled>
        </OutlinedBox>,
      ).lastFrame(),
    ).toBe("┏━━┓\n┃ab┃\n┗━━┛");
    const tiny = render(<OutlinedBox width={2} height={2} shadow={false} />);
    expect(tiny.lastFrame()).toBe("┏┓\n┗┛");
  });

  it("centres ART in the artwork slot, and fills a slot too narrow for the label", () => {
    expect(render(<ArtSlot width={9} height={3} />).lastFrame()).toBe(
      "░░░░░░░░░\n░░ ART ░░\n░░░░░░░░░",
    );
    expect(render(<ArtSlot width={3} height={1} />).lastFrame()).toBe("░░░");
  });

  it("right-aligns a line, cutting the left side first", () => {
    expect(
      render(<Line left={[{ text: "left" }]} right={[{ text: "1/3" }]} width={10} />).lastFrame(),
    ).toBe("left   1/3");
    expect(
      render(
        <Line left={[{ text: "a long left side" }]} right={[{ text: "1/3" }]} width={10} />,
      ).lastFrame(),
    ).toBe("a lon… 1/3");
    expect(
      render(
        <Line left={[{ text: "left" }]} right={[{ text: "too wide on the right" }]} width={6} />,
      ).lastFrame(),
    ).toBe("too w…");
  });

  it("renders a reverse label, progress bar, rules and hint bar", () => {
    // Ink trims the trailing space of the last cell.
    expect(render(<ReverseLabel text="GROOVENET" />).lastFrame()).toBe(" GROOVENET");
    expect(render(<ProgressBar position={1} duration={4} width={4} />).lastFrame()).toBe("━───");
    expect(render(<Rule width={3} heavy />).lastFrame()).toBe("━━━");
    expect(render(<Rule width={3} />).lastFrame()).toBe("───");
    expect(render(<HintBar hints={[{ keys: "?", label: "help" }]} width={20} />).lastFrame()).toBe(
      "? help",
    );
  });

  it("styles text from the theme in context", () => {
    const app = render(
      <ThemeContext.Provider value={makeTheme({ color: false })}>
        <Styled role="live">live</Styled>
      </ThemeContext.Provider>,
    );
    expect(app.lastFrame()).toBe("live");
  });
});
