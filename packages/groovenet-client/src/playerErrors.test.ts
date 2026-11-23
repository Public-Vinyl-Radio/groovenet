import { describe, expect, it } from "vitest";
import { describePlayerError } from "./playerErrors.js";
import { pendingMessage } from "./serverPlayerSession.js";

const utc = { locale: "en-GB", timeZone: "UTC" };
const output = {
  id: "202481586338774",
  name: "Lounge Room Audio",
  lost_at: "2026-11-21T01:47:41.000Z",
  reason: "output_lost",
  detail: "OwnTone reported the output lost during playback",
  back_at: null,
};

describe("describePlayerError", () => {
  it("is null without an error, and passes through errors that are not about a speaker", () => {
    expect(describePlayerError(null)).toBeNull();
    expect(describePlayerError(undefined)).toBeNull();
    expect(describePlayerError({ code: "NO_AUDIO", message: "No audio" })).toEqual({
      headline: "No audio",
      detail: null,
      back: false,
      lostOutputId: null,
    });
  });

  it("names the lost speaker, when, and the engine's last word", () => {
    expect(
      describePlayerError({ code: "PLAYBACK_INTERRUPTED", message: "went away", output }, utc),
    ).toEqual({
      headline: "went away",
      detail:
        "Lounge Room Audio · lost 01:47:41 · OwnTone reported the output lost during playback",
      back: false,
      lostOutputId: output.id,
    });
  });

  it("says when it is back, and that a retry already ran", () => {
    expect(
      describePlayerError(
        {
          code: "PLAYBACK_INTERRUPTED",
          message: "Lounge Room Audio is back — press play to resume.",
          output: { ...output, back_at: "2026-11-21T01:48:05.000Z", retried: true },
        },
        utc,
      ),
    ).toEqual({
      headline: "Lounge Room Audio is back — press play to resume.",
      detail: "Lounge Room Audio · lost 01:47:41 · back 01:48:05 · retried once",
      back: true,
      lostOutputId: null,
    });
  });

  it("falls back to the output ID and skips unreadable times and missing details", () => {
    expect(
      describePlayerError({
        code: "DEVICE_UNAVAILABLE",
        message: "m",
        output: { ...output, name: null, lost_at: "not a time", detail: null },
      })?.detail,
    ).toBe("202481586338774");
    // The default format uses the reader's own locale and zone.
    expect(describePlayerError({ code: "X", message: "m", output })?.detail).toMatch(
      /^Lounge Room Audio · lost /,
    );
  });
});

describe("pendingMessage", () => {
  it("keeps the old wording when it doesn't know the command", () => {
    expect(pendingMessage(null)).toBe("A command is in progress. Try again when it finishes.");
  });
  it("says what it waits on, and only blames the speaker for connecting commands", () => {
    expect(pendingMessage({ type: "volume", since: 0 }, 1_400)).toBe(
      "Still waiting for Volume (1 s). Try again when it finishes.",
    );
    expect(pendingMessage({ type: "queue.add", since: 5_000 }, 0)).toBe(
      "Still waiting for The last command (0 s). Try again when it finishes.",
    );
    expect(pendingMessage({ type: "resume", since: 0 }, 9_000)).toMatch(
      /^Still waiting for Resume \(9 s\) while the server reaches the speaker\./,
    );
  });
});
