import { describe, expect, it } from "vitest";
import {
  addedMeta,
  choresCliHint,
  CHORES_CLI_STACK_COMMAND,
  moreInBacklog,
  paceLine,
  progressAriaLabel,
  rowKey,
  selectionLabel,
  sleeveAriaLabel,
  sleeveLine,
  sleeveTotal,
  spunMeta,
  stackBlocks,
  stackItemRow,
  stackUpNextLabel,
  todoCount,
} from "./choresWording";

const bySleeve = { original: 0, paper: 0, "poly-rice-paper-poly": 10, poly: 0, unknown: 402 };

describe("chores wording", () => {
  it("keeps the CLI hint in one constant", () => {
    expect(CHORES_CLI_STACK_COMMAND).toBe("groovenet records clean --stack");
    expect(choresCliHint(2)).toBe("groovenet records clean --stack 2");
  });

  it("keys a copy, or a release's implicit copy", () => {
    expect(rowKey({ copy_id: 4, release_id: "r" })).toBe("copy:4");
    expect(rowKey({ copy_id: null, release_id: "r" })).toBe("release:r");
  });

  it("counts what is left, never below zero", () => {
    expect(todoCount({ cleaned: 10, total: 412 })).toBe(402);
    expect(todoCount({ cleaned: 5, total: 3 })).toBe(0);
  });

  it("names the next stack", () => {
    const p = { next_stack_no: 2, stacks_total: 42, total: 412 };
    expect(stackUpNextLabel(p, "desktop")).toBe("STACK 2 OF 42 UP NEXT");
    expect(stackUpNextLabel(p, "phone")).toBe("STACK 2 OF 42 NEXT");
    expect(stackUpNextLabel({ ...p, next_stack_no: null }, "desktop")).toBe("ALL CLEANED");
    expect(stackUpNextLabel({ ...p, total: 0, next_stack_no: null }, "phone")).toBe(
      "NO RECORDS YET",
    );
  });

  it("labels the block grid", () => {
    expect(progressAriaLabel({ cleaned: 10, total: 1412, stack_size: 10 })).toBe(
      "10 of 1,412 copies cleaned, in stacks of 10",
    );
  });

  it("fills done stacks and outlines the next", () => {
    expect(stackBlocks({ stacks_total: 4, stacks_done: 1, next_stack_no: 2 })).toEqual([
      "done",
      "next",
      "todo",
      "todo",
    ]);
    expect(stackBlocks({ stacks_total: 2, stacks_done: 2, next_stack_no: null })).toEqual([
      "done",
      "done",
    ]);
  });

  it("hides the pace clause without a pace", () => {
    expect(paceLine({ stack_size: 10, pace: null }, "UTC")).toBe("ONE BLOCK = ONE STACK OF 10");
  });

  it("shows the pace and finish date", () => {
    const pace = { stacks_per_week: 1.46, projected_finish_date: "2027-03-14T12:00:00Z" };
    expect(paceLine({ stack_size: 10, pace }, "UTC")).toBe(
      "ONE BLOCK = ONE STACK OF 10 · 1.5 STACKS/WEEK FINISHES BY MAR 14, 2027",
    );
    expect(paceLine({ stack_size: 10, pace: { ...pace, stacks_per_week: 1 } }, "UTC")).toContain(
      "1 STACK/WEEK",
    );
  });

  it("describes the sleeves", () => {
    expect(sleeveTotal(bySleeve)).toBe(412);
    expect(sleeveAriaLabel(bySleeve)).toBe(
      "Copies by sleeve: 10 poly / rice paper / poly; 402 unknown",
    );
    expect(sleeveAriaLabel({ ...bySleeve, "poly-rice-paper-poly": 0, unknown: 0 })).toBe(
      "No copies yet",
    );
    expect(sleeveLine(bySleeve, "used")).toBe("POLY/RICE/POLY 10 · UNKNOWN 402");
    expect(sleeveLine(bySleeve, "unused")).toBe("POLY 0 · PAPER 0 · ORIGINAL 0");
  });

  it("words the row meta", () => {
    expect(spunMeta(3, "OCT")).toBe("SPUN 3× IN OCT");
    expect(addedMeta("2026-10-17T16:25:39Z", "America/Los_Angeles")).toBe("ADDED OCT 17");
    expect(moreInBacklog(1380)).toBe("1,380 MORE IN THE BACKLOG");
  });

  it("labels the selection", () => {
    expect(selectionLabel(0, 2, "desktop")).toBe("Select records, or pull the next stack.");
    expect(selectionLabel(10, 2, "desktop")).toBe("STACK 2 · 10 SELECTED");
    expect(selectionLabel(10, 2, "phone")).toBe("STACK 2 · 10");
    expect(selectionLabel(3, null, "phone")).toBe("3 SELECTED");
  });

  it("turns a stack item into a row, naming a departed album", () => {
    const item = {
      position: 0,
      copy_id: null,
      release_id: "r",
      album_title: null,
      album_artist: null,
      album_thumbnail: null,
      inner_sleeve_type: null,
      last_cleaned_at: null,
    };
    expect(stackItemRow(item)).toMatchObject({ title: "Unknown album", artist: "", copy_id: null });
    expect(
      stackItemRow({ ...item, album_title: "ATF", album_artist: "After The Fire" }),
    ).toMatchObject({ title: "ATF", artist: "After The Fire" });
  });
});
