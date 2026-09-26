import { describe, it, expect } from "vitest";
import { shouldTriggerFingerprintIndex } from "../trackFingerprintTrigger";

function track(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "t1",
    friend_id: 1,
    local_audio_url: null,
    ...overrides,
  };
}

describe("shouldTriggerFingerprintIndex", () => {
  it("triggers when local_audio_url goes from null to a value", () => {
    const result = shouldTriggerFingerprintIndex(
      track({ local_audio_url: null }),
      track({ local_audio_url: "artist - title.m4a" })
    );
    expect(result).toBe(true);
  });

  it("triggers when local_audio_url goes from empty string to a value", () => {
    const result = shouldTriggerFingerprintIndex(
      track({ local_audio_url: "" }),
      track({ local_audio_url: "artist - title.m4a" })
    );
    expect(result).toBe(true);
  });

  it("does not trigger when local_audio_url is unchanged", () => {
    const result = shouldTriggerFingerprintIndex(
      track({ local_audio_url: "artist - title.m4a" }),
      track({ local_audio_url: "artist - title.m4a" })
    );
    expect(result).toBe(false);
  });

  it("does not trigger when neither side has audio", () => {
    const result = shouldTriggerFingerprintIndex(
      track({ local_audio_url: null }),
      track({ local_audio_url: null })
    );
    expect(result).toBe(false);
  });

  it("triggers when an existing file is replaced with another (#303)", () => {
    // The "missing" backfill never looks at a track that already has a
    // fingerprint, so this used to leave the index matching audio that was gone.
    const result = shouldTriggerFingerprintIndex(
      track({ local_audio_url: "old.m4a" }),
      track({ local_audio_url: "new.m4a" })
    );
    expect(result).toBe(true);
  });

  it("does not trigger when audio is removed", () => {
    const result = shouldTriggerFingerprintIndex(
      track({ local_audio_url: "artist - title.m4a" }),
      track({ local_audio_url: null })
    );
    expect(result).toBe(false);
  });

  it("handles a null current track (no prior row) as having no prior audio", () => {
    const result = shouldTriggerFingerprintIndex(
      null,
      track({ local_audio_url: "artist - title.m4a" })
    );
    expect(result).toBe(true);
  });
});
