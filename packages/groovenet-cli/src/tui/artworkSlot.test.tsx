import React from "react";
import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { GroovenetClient } from "@groovenet/client";
import * as fullView from "../commands/playerTuiFullView.js";
import { ArtworkCache, type PreparedArtwork } from "./artwork.js";
import { ArtworkContext, ArtworkProvider, ArtworkSlot, type ArtworkRuntime } from "./artworkSlot.js";
import { forceTerminal } from "./testing.js";
import { displayWidth } from "./text.js";

beforeEach(() => { forceTerminal(120, 40); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const pause = () => new Promise(resolve => setTimeout(resolve, 40));
const sample = async () => sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
const prepared = { png: Buffer.from("png"), rows: ["▀▀▀▀▀", "▀▀▀▀▀"] };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function tree(runtime: ArtworkRuntime | null, source: string | undefined = "/a", width = 5, height = 2) {
  return <ArtworkContext.Provider value={runtime}><Box><ArtworkSlot source={source} width={width} height={height} /><Text>EDGE</Text></Box></ArtworkContext.Provider>;
}

describe("ArtworkSlot", () => {
  it("keeps the placeholder without a provider, source or supported terminal", async () => {
    const getArtwork = vi.fn();
    const cache = new ArtworkCache({ getArtwork });
    const write = vi.fn();
    const app = render(tree(null));
    expect(app.lastFrame()).toContain("ART");
    app.rerender(tree({ mode: "off", tmux: false, cache, write })); await pause();
    app.rerender(tree({ mode: "kitty", tmux: false, cache, write }, "")); await pause();
    expect(getArtwork).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("renders real decoded colour blocks within the slot and clears on missing artwork", async () => {
    const cache = new ArtworkCache({ getArtwork: vi.fn().mockResolvedValue(await sample()) });
    const runtime: ArtworkRuntime = { mode: "blocks", tmux: false, cache, write: vi.fn() };
    const app = render(tree(runtime));
    await vi.waitFor(() => expect(app.lastFrame()).toContain("▀"));
    const lines = app.lastFrame()!.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.map(displayWidth)).toEqual([9, 5]);
    expect(runtime.write).not.toHaveBeenCalled();
    app.rerender(tree(runtime, "")); await pause();
    expect(app.lastFrame()).toContain("ART");
    expect(app.lastFrame()).not.toContain("▀");
  });

  it("transmits Kitty pixels once, retains every placeholder cell, deletes on resize and unmount", async () => {
    const cache = new ArtworkCache({ getArtwork: vi.fn().mockResolvedValue(await sample()) });
    const write = vi.fn();
    const runtime: ArtworkRuntime = { mode: "kitty", tmux: true, cache, write };
    const app = render(tree(runtime, "/a", 18, 8));
    await vi.waitFor(() => expect(app.lastFrame()).toContain("\u{10eeee}"));
    expect(app.lastFrame()!.split("\n").map(displayWidth)).toEqual([22, 18, 18, 18, 18, 18, 18, 18]);
    expect(app.lastFrame()!.match(/\u{10eeee}/gu)).toHaveLength(144);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain("\x1bPtmux;\x1b\x1b_Ga=T");
    app.rerender(tree(runtime, "/a", 14, 6));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(3));
    expect(write.mock.calls[1][0]).toContain("a=d,d=I");
    expect(write.mock.calls[2][0]).toContain("c=14,r=6");
    app.unmount(); await pause();
    expect(write).toHaveBeenCalledTimes(4);
    expect(write.mock.calls[3][0]).toContain("a=d,d=I");
  });

  it("ignores late pixels after a selection change, a view change or unmount", async () => {
    const cache = new ArtworkCache({ getArtwork: vi.fn() });
    const first = deferred<PreparedArtwork>();
    const second = deferred<PreparedArtwork>();
    const third = deferred<PreparedArtwork>();
    vi.spyOn(cache, "get").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    const write = vi.fn();
    const runtime: ArtworkRuntime = { mode: "kitty", tmux: false, cache, write };
    const app = render(tree(runtime)); await pause();
    app.rerender(tree(runtime, "/b")); await pause();
    first.resolve(prepared); await pause();
    expect(write).not.toHaveBeenCalled();
    second.resolve(prepared);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    app.rerender(tree(runtime, "/c")); await pause();
    app.unmount(); await pause();
    third.resolve(prepared); await pause();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toContain("a=d,d=I");
  });

  it("contains fetch/decoding errors, including a late failure", async () => {
    const cache = new ArtworkCache({ getArtwork: vi.fn() });
    const pending = deferred<PreparedArtwork>();
    vi.spyOn(cache, "get").mockRejectedValueOnce(new Error("bad image")).mockReturnValueOnce(pending.promise);
    const runtime: ArtworkRuntime = { mode: "kitty", tmux: false, cache, write: vi.fn() };
    const app = render(tree(runtime)); await pause();
    expect(app.lastFrame()).toContain("ART");
    app.rerender(tree(runtime, "/b")); await pause();
    app.unmount(); pending.reject(new Error("offline")); await pause();
    expect(runtime.write).not.toHaveBeenCalled();
  });

  it("enables a real provider on a Kitty terminal and writes uploads to its stdout", async () => {
    vi.stubEnv("NO_COLOR", undefined);
    vi.stubEnv("GROOVENET_TUI_ART", "kitty");
    vi.stubEnv("TMUX", undefined);
    vi.stubEnv("STY", undefined);
    vi.stubEnv("ZELLIJ", undefined);
    const probe = render(<Text />);
    const prototype = Object.getPrototypeOf(probe.stdout);
    Object.defineProperty(prototype, "isTTY", { configurable: true, value: true });
    probe.unmount();
    try {
      const api = { getArtwork: vi.fn().mockResolvedValue(await sample()) } as unknown as GroovenetClient;
      const app = render(<ArtworkProvider api={api}><ArtworkSlot source="/a" width={5} height={2} /></ArtworkProvider>);
      await vi.waitFor(() => expect(app.lastFrame()).toContain("\u{10eeee}"));
      expect(api.getArtwork).toHaveBeenCalledWith("/a");
      app.unmount();
    } finally { delete prototype.isTTY; }
  });

  it("discards capability detection that completes after its provider unmounts", async () => {
    vi.stubEnv("NO_COLOR", undefined);
    vi.stubEnv("GROOVENET_TUI_ART", "kitty");
    vi.stubEnv("TMUX", "test-session");
    vi.stubEnv("STY", undefined);
    vi.stubEnv("ZELLIJ", undefined);
    const pending = deferred<string>();
    const run = vi.spyOn(fullView, "runTmux").mockReturnValue(pending.promise);
    const probe = render(<Text />);
    const prototype = Object.getPrototypeOf(probe.stdout);
    Object.defineProperty(prototype, "isTTY", { configurable: true, value: true });
    probe.unmount();
    try {
      const api = { getArtwork: vi.fn() } as unknown as GroovenetClient;
      const app = render(<ArtworkProvider api={api}><ArtworkSlot source="/a" width={5} height={2} /></ArtworkProvider>);
      await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
      app.unmount(); await pause();
      pending.resolve("on"); await pause();
      expect(api.getArtwork).not.toHaveBeenCalled();
    } finally { delete prototype.isTTY; }
  });

  it("tries another cover after fetch or decoding failures", async () => {
    const getArtwork = vi.fn().mockRejectedValueOnce(new Error("stale URL")).mockResolvedValueOnce(Buffer.from("invalid")).mockResolvedValue(await sample());
    const runtime: ArtworkRuntime = { mode: "kitty", tmux: false, cache: new ArtworkCache({ getArtwork }), write: vi.fn() };
    const app = render(<ArtworkContext.Provider value={runtime}><ArtworkSlot source="/stale" fallbacks={["/stale", "/invalid", "/good"]} width={5} height={2} /></ArtworkContext.Provider>);
    await vi.waitFor(() => expect(app.lastFrame()).toContain("\u{10eeee}"));
    expect(getArtwork.mock.calls.map(([url]) => url)).toEqual(["/stale", "/invalid", "/good"]);
  });

  it("does not start a fallback request after leaving a preview", async () => {
    const pending = deferred<Buffer>();
    const getArtwork = vi.fn().mockReturnValueOnce(pending.promise);
    const runtime: ArtworkRuntime = { mode: "kitty", tmux: false, cache: new ArtworkCache({ getArtwork }), write: vi.fn() };
    const app = render(<ArtworkContext.Provider value={runtime}><ArtworkSlot source="/stale" fallbacks={["/next"]} width={5} height={2} /></ArtworkContext.Provider>);
    await pause(); app.unmount(); await pause();
    pending.reject(new Error("gone")); await pause();
    expect(getArtwork).toHaveBeenCalledOnce();
    expect(runtime.write).not.toHaveBeenCalled();
  });

  it("keeps the placeholder if a native upload throws and skips deleting an unuploaded ID", async () => {
    const cache = new ArtworkCache({ getArtwork: vi.fn().mockResolvedValue(await sample()) });
    const write = vi.fn(() => { throw new Error("closed output"); });
    const app = render(tree({ mode: "kitty", tmux: false, cache, write }));
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(app.lastFrame()).toContain("ART");
    app.unmount(); await pause();
    expect(write).toHaveBeenCalledOnce();
  });

  it("creates a session provider without fetching while disabled", async () => {
    vi.stubEnv("GROOVENET_TUI_ART", "off");
    const api = { getArtwork: vi.fn() } as unknown as GroovenetClient;
    const app = render(<ArtworkProvider api={api}><ArtworkSlot source="/a" width={5} height={2} /></ArtworkProvider>);
    await pause();
    expect(app.lastFrame()).toContain("ART");
    expect(api.getArtwork).not.toHaveBeenCalled();
    app.unmount();
  });
});
