import { describe, expect, it } from "vitest";
import { errorDetail, errorSegments } from "./playerTuiError.js";

const output = {
  id: "202481586338774",
  name: "Lounge Room Audio",
  lost_at: "2026-11-21T01:47:41.000Z",
  reason: "not_listed",
  detail: "OwnTone no longer lists the output",
  back_at: null,
};

describe("TUI playback error line (#1241)", () => {
  it("renders nothing without an error", () => {
    expect(errorSegments(null)).toBeNull();
    expect(errorDetail(undefined)).toBeNull();
  });
  it("keeps the code and message for errors that are not about a speaker", () => {
    expect(errorSegments({ code: "NO_AUDIO", message: "No audio" })).toEqual([
      { text: "NO_AUDIO: No audio", role: "error" },
    ]);
    expect(errorDetail({ code: "NO_AUDIO", message: "No audio" })).toBeNull();
  });
  it("puts the instruction first and the speaker detail after it", () => {
    const segments = errorSegments({
      code: "DEVICE_UNAVAILABLE",
      message: "Not listed.",
      output,
    } as never);
    expect(segments?.[0]).toEqual({ text: "DEVICE_UNAVAILABLE: Not listed.", role: "error" });
    expect(segments?.[1]).toMatchObject({ role: "muted" });
    expect(segments?.[1]?.text).toMatch(
      /^ · Lounge Room Audio · lost .+ · OwnTone no longer lists the output$/,
    );
  });
  it("shows a speaker that is back as a live hint, not an error", () => {
    const segments = errorSegments({
      code: "DEVICE_UNAVAILABLE",
      message: "Lounge Room Audio is back — press play to resume.",
      output: { ...output, back_at: "2026-11-21T01:48:05.000Z" },
    } as never);
    expect(segments?.[0]).toEqual({
      text: "Lounge Room Audio is back — press play to resume.",
      role: "live",
    });
  });
});
