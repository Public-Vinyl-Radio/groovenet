import React from "react";
import { Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HelpOverlay, PlayerFrame, tabSegments, TopBar, type PlayerFrameProps } from "./frame.js";
import { pickLayout } from "./layout.js";
import { forceTerminal } from "./testing.js";

beforeEach(() => { forceTerminal(120, 40); });
afterEach(() => { cleanup(); });

function props(overrides: Partial<PlayerFrameProps> = {}): PlayerFrameProps {
  return {
    layout: pickLayout(120, 40),
    target: "LOUNGE",
    live: "live",
    helpKeys: "?",
    quitKeys: "q",
    tabs: [{ keys: "/", label: "SEARCH", active: false }, { keys: "u", label: "QUEUE", count: 59, active: true }],
    status: { left: [{ text: "LOUNGE ROOM AUDIO" }], right: [{ text: "17/59" }] },
    hints: [{ keys: "↑/↓", label: "select" }],
    nowPlaying: (area) => <Text>{`card ${area.kind} ${area.width}×${area.height}`}</Text>,
    children: (area) => <Text>{`body ${area.width}×${area.rows}`}</Text>,
    ...overrides,
  };
}

describe("PlayerFrame", () => {
  it("hands each slot its exact area", () => {
    const frame = render(<PlayerFrame {...props()} />).lastFrame()!;
    expect(frame).toContain("card full 93×8");
    expect(frame).toContain("body 120×21");
    expect(frame.split("\n")).toHaveLength(40);
    forceTerminal(40, 50);
    const side = render(<PlayerFrame {...props({ layout: pickLayout(40, 50) })} />).lastFrame()!;
    expect(side).toContain("card side 18×14");
    expect(side).toContain("body 40×25");
  });

  it("shows an alert in place of the status line", () => {
    const frame = render(<PlayerFrame {...props({ alert: [{ text: "mpv stream failed", role: "warn" }] })} />).lastFrame()!;
    expect(frame).toContain("mpv stream failed");
    expect(frame).not.toContain("LOUNGE ROOM AUDIO");
  });

  it("replaces the body with the help overlay", () => {
    const help = [{ keys: "Space", description: "Pause or resume" }, { keys: "q", description: "Quit the player" }];
    const frame = render(<PlayerFrame {...props({ help })} />).lastFrame()!;
    expect(frame).toContain(" KEYS ");
    expect(frame).toMatch(/Space\s+Pause or resume/);
    expect(frame).toMatch(/q\s+Quit the player/);
    expect(frame).not.toContain("body ");
  });

  it("marks a dropped server connection", () => {
    expect(render(<PlayerFrame {...props({ live: "offline" })} />).lastFrame()).toContain("PLAY ON LOUNGE ○ DISCONNECTED");
    expect(render(<PlayerFrame {...props({ live: null })} />).lastFrame()).not.toMatch(/[●○]/);
  });

  it("draws the strip with hints, or the alert, or the help line in its second row", () => {
    const layout = pickLayout(120, 5);
    const strip = render(<PlayerFrame {...props({ layout })} />).lastFrame()!;
    expect(strip.split("\n")[0]).toMatch(/^┏━ GROOVENET {3}LOUNGE ●/);
    expect(strip).toContain("card strip 114×1");
    expect(strip).toContain("↑/↓ select");
    const alert = render(<PlayerFrame {...props({ layout, alert: [{ text: "API key rejected" }] })} />).lastFrame()!;
    expect(alert).toContain("API key rejected");
    expect(alert).not.toContain("↑/↓ select");
    const help = render(<PlayerFrame {...props({ layout, help: [{ keys: "Space", description: "Pause or resume" }] })} />).lastFrame()!;
    expect(help).toContain("Space Pause or resume");
    const offline = render(<PlayerFrame {...props({ layout, live: "offline" })} />).lastFrame()!;
    expect(offline.split("\n")[0]).toContain("LOUNGE ○");
  });

  it("shows only the size message below every minimum", () => {
    forceTerminal(20, 3);
    const frame = render(<PlayerFrame {...props({ layout: pickLayout(20, 3) })} />).lastFrame()!;
    expect(frame.split("\n")).toHaveLength(3);
    expect(frame).toMatch(/^Terminal too small\n\(20×3\)/);
    expect(frame).not.toContain("GROOVENET");
  });
});

describe("chrome", () => {
  it("leaves unbound help and quit keys out of the top bar", () => {
    const bar = (helpKeys: string, quitKeys: string) => render(<TopBar kind="full" width={60} target="LOCAL" live={null} helpKeys={helpKeys} quitKeys={quitKeys} />).lastFrame();
    expect(bar("?", "q")).toMatch(/\? help {3}q quit$/);
    expect(bar("", "q")).toMatch(/LOCAL\s+q quit$/);
    expect(bar("?", "")).toMatch(/LOCAL\s+\? help$/);
    expect(bar("", "")).toBe(" GROOVENET  PLAY ON LOCAL");
  });

  it("keeps only the brand, target and live dot in the side pane's top bar", () => {
    const live = render(<TopBar kind="side" width={40} target="LOUNGE" live="live" helpKeys="?" quitKeys="q" />).lastFrame()!;
    expect(live).toMatch(/^ GROOVENET\s+LOUNGE ●$/);
    expect(live).toHaveLength(40);
    expect(render(<TopBar kind="side" width={40} target="LOCAL" live={null} helpKeys="?" quitKeys="q" />).lastFrame()).toMatch(/^ GROOVENET\s+LOCAL$/);
  });

  it("lays out tabs with counts, collapsing inactive ones in the side pane", () => {
    const tabs = [
      { keys: "/", label: "SEARCH", active: false },
      { keys: "u", label: "QUEUE", count: 59, active: true },
      { keys: "", label: "DEVICES", active: false },
    ];
    const text = (kind: "full" | "side") => tabSegments(tabs, kind).map((segment) => segment.text).join("");
    expect(text("full")).toBe(" / SEARCH   u QUEUE · 59   DEVICES ");
    expect(text("side")).toBe(" /   u QUEUE · 59    ");
    expect(tabSegments([{ keys: "", label: "QUEUE", active: true }], "full")).toEqual([{ text: " QUEUE ", role: "reverse" }]);
  });

  it("splits the help overlay into columns and counts what does not fit", () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({ keys: `k${i}`, description: `Action ${i}` }));
    const wide = render(<HelpOverlay entries={entries} width={100} rows={8} />).lastFrame()!;
    expect(wide).toMatch(/k0\s+Action 0\s+k5\s+Action 5/);
    expect(wide).toContain("+20 more");
    const narrow = render(<HelpOverlay entries={entries.slice(0, 2)} width={38} rows={8} />).lastFrame()!;
    expect(narrow).toMatch(/k0\s+Action 0\s+┃/);
    expect(narrow).not.toContain("more");
  });
});
