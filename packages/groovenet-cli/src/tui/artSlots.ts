/**
 * Debug output for the site's TUI screenshots (#931). VHS captures through
 * xterm.js, which has no Kitty graphics, so the covers are composited in
 * afterwards; this says where. With `GROOVENET_TUI_ART_SLOTS=<file>`, every
 * mounted artwork slot's cell rectangle is written to that file as JSON. Off,
 * and never touching the filesystem, unless the variable is set.
 */
import { renameSync, writeFileSync } from "node:fs";

export interface ArtSlotRect {
  /** Zero-based cells from the top-left of the screen. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Cover URLs in the order the slot tries them. */
  sources: string[];
}

export interface ArtSlotReport {
  columns: number;
  rows: number;
  slots: ArtSlotRect[];
}

export type ReportWriter = (file: string, report: ArtSlotReport) => void;

/** Write then rename, so a reader never sees half a file. */
export const writeReport: ReportWriter = (file, report) => {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporary, file);
};

const sameRect = (a: ArtSlotRect, b: ArtSlotRect) =>
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height &&
  a.sources.join("\n") === b.sources.join("\n");

export class ArtSlotReporter {
  private slots = new Map<string, ArtSlotRect>();
  private size = { columns: 0, rows: 0 };
  private pending?: NodeJS.Timeout;

  constructor(
    readonly file: string,
    private readonly write: ReportWriter = writeReport,
  ) {}

  report(): ArtSlotReport {
    const slots = [...this.slots.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    return { ...this.size, slots };
  }

  /** Records a slot's rectangle and writes the report at once when anything changed. */
  set(id: string, rect: ArtSlotRect, size: { columns: number; rows: number }): void {
    const previous = this.slots.get(id);
    if (
      previous &&
      sameRect(previous, rect) &&
      size.columns === this.size.columns &&
      size.rows === this.size.rows
    )
      return;
    this.slots.set(id, rect);
    this.size = { columns: size.columns, rows: size.rows };
    this.flush();
  }

  /**
   * Forgets a slot. The write is deferred on an unref'd timer: when the
   * process is killed at the end of a capture, Ink unmounts every slot on the
   * way out, and the report must still describe the last screen drawn.
   */
  delete(id: string): void {
    if (!this.slots.delete(id) || this.pending) return;
    this.pending = setTimeout(() => this.flush(), 0);
    this.pending.unref();
  }

  flush(): void {
    clearTimeout(this.pending);
    this.pending = undefined;
    try {
      this.write(this.file, this.report());
    } catch {
      /* A debug aid must never take the player down. */
    }
  }
}

let shared: ArtSlotReporter | null = null;

/** The process's reporter, or null when `GROOVENET_TUI_ART_SLOTS` is unset or empty. */
export function artSlotReporter(env: NodeJS.ProcessEnv = process.env): ArtSlotReporter | null {
  const file = env.GROOVENET_TUI_ART_SLOTS;
  if (!file) return null;
  if (shared?.file !== file) shared = new ArtSlotReporter(file);
  return shared;
}
