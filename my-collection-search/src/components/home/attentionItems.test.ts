import { describe, expect, it } from "vitest";
import { ATTENTION_ITEMS, isAllClear, type Attention } from "./attentionItems";
const zero: Attention = {
  missing_audio: 0,
  missing_bpm_or_key: 0,
  due_for_cleaning: 0,
  failed_jobs: 0,
};
describe("needs attention", () => {
  it("is all clear only with four known zeros", () => {
    expect(isAllClear(zero)).toBe(true);
    for (const { key } of ATTENTION_ITEMS) expect(isAllClear({ ...zero, [key]: 1 })).toBe(false);
    expect(isAllClear({ ...zero, failed_jobs: null })).toBe(false);
  });
  it("links to each filtered destination", () => {
    expect(ATTENTION_ITEMS.map((item) => item.href)).toEqual([
      "/tracks?missingAudio=1",
      "/tracks?missingMetadata=1",
      "/chore?status=overdue",
      "/jobs?state=failed",
    ]);
  });
});
