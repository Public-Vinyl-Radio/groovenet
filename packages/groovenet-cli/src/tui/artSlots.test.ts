import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtSlotReporter, artSlotReporter, writeReport, type ArtSlotReport } from "./artSlots.js";

const size = { columns: 120, rows: 40 };
const rect = (x: number, y: number, sources = ["/a.jpg"]) => ({
  x,
  y,
  width: 18,
  height: 8,
  sources,
});
const recorder = () => {
  const writes: ArtSlotReport[] = [];
  return { writes, write: (_file: string, report: ArtSlotReport) => void writes.push(report) };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ArtSlotReporter", () => {
  it("writes every slot, top to bottom then left to right", () => {
    const { writes, write } = recorder();
    const reporter = new ArtSlotReporter("slots.json", write);
    reporter.set("b", rect(40, 20), size);
    reporter.set("a", rect(2, 2), size);
    reporter.set("c", rect(4, 20), size);
    expect(writes).toHaveLength(3);
    expect(writes[2]).toEqual({
      columns: 120,
      rows: 40,
      slots: [rect(2, 2), rect(4, 20), rect(40, 20)],
    });
  });

  it("writes only when a rectangle, its sources or the terminal changes", () => {
    const { writes, write } = recorder();
    const reporter = new ArtSlotReporter("slots.json", write);
    reporter.set("a", rect(2, 2), size);
    reporter.set("a", rect(2, 2), size);
    expect(writes).toHaveLength(1);
    reporter.set("a", rect(2, 3), size);
    reporter.set("a", rect(2, 3, ["/b.jpg"]), size);
    reporter.set("a", rect(2, 3, ["/b.jpg"]), { columns: 100, rows: 40 });
    reporter.set("a", rect(2, 3, ["/b.jpg"]), { columns: 100, rows: 30 });
    expect(writes).toHaveLength(5);
    expect(writes[4]).toMatchObject({ columns: 100, rows: 30 });
  });

  it("defers the write for a removed slot, once, so a killed process keeps its last screen", async () => {
    vi.useFakeTimers();
    const { writes, write } = recorder();
    const reporter = new ArtSlotReporter("slots.json", write);
    reporter.set("a", rect(2, 2), size);
    reporter.set("b", rect(2, 20), size);
    reporter.delete("a");
    reporter.delete("b");
    reporter.delete("missing");
    expect(writes).toHaveLength(2);
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(3);
    expect(writes[2].slots).toEqual([]);
  });

  it("folds a pending removal into the next write", async () => {
    vi.useFakeTimers();
    const { writes, write } = recorder();
    const reporter = new ArtSlotReporter("slots.json", write);
    reporter.set("a", rect(2, 2), size);
    reporter.delete("a");
    reporter.set("b", rect(4, 4), size);
    expect(writes[1].slots).toEqual([rect(4, 4)]);
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(2);
  });

  it("swallows a failing write", () => {
    const reporter = new ArtSlotReporter("slots.json", () => {
      throw new Error("disk full");
    });
    expect(() => reporter.set("a", rect(2, 2), size)).not.toThrow();
  });
});

describe("artSlotReporter", () => {
  it("is off unless GROOVENET_TUI_ART_SLOTS names a file", () => {
    expect(artSlotReporter({})).toBeNull();
    expect(artSlotReporter({ GROOVENET_TUI_ART_SLOTS: "" })).toBeNull();
  });

  it("shares one reporter per file", () => {
    const first = artSlotReporter({ GROOVENET_TUI_ART_SLOTS: "/tmp/a.json" });
    expect(first?.file).toBe("/tmp/a.json");
    expect(artSlotReporter({ GROOVENET_TUI_ART_SLOTS: "/tmp/a.json" })).toBe(first);
    expect(artSlotReporter({ GROOVENET_TUI_ART_SLOTS: "/tmp/b.json" })).not.toBe(first);
  });
});

describe("writeReport", () => {
  it("replaces the file whole and leaves no temporary file", () => {
    const dir = mkdtempSync(join(tmpdir(), "art-slots-"));
    try {
      const file = join(dir, "slots.json");
      writeReport(file, { columns: 1, rows: 1, slots: [] });
      writeReport(file, { ...size, slots: [rect(2, 2)] });
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ ...size, slots: [rect(2, 2)] });
      expect(readdirSync(dir)).toEqual(["slots.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
