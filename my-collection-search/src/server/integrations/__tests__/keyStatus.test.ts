import { describe, expect, it } from "vitest";
import { readKeyStatus } from "../keyStatus";

describe("readKeyStatus", () => {
  it("reports each key as configured only when it has a value", () => {
    expect(readKeyStatus({ OPENAI_API_KEY: "sk-secret", YOUTUBE_API_KEY: "yt-secret" })).toEqual({
      openai: { configured: true },
      youtube: { configured: true },
    });
    expect(readKeyStatus({ OPENAI_API_KEY: "sk-secret" })).toEqual({
      openai: { configured: true },
      youtube: { configured: false },
    });
  });

  it("treats empty and whitespace-only values as unset", () => {
    expect(readKeyStatus({ OPENAI_API_KEY: "", YOUTUBE_API_KEY: "   " })).toEqual({
      openai: { configured: false },
      youtube: { configured: false },
    });
  });

  it("reads process.env by default and never returns a value", () => {
    const before = { ...process.env };
    process.env.OPENAI_API_KEY = "sk-secret";
    delete process.env.YOUTUBE_API_KEY;
    try {
      const result = readKeyStatus();
      expect(result.openai.configured).toBe(true);
      expect(JSON.stringify(result)).not.toContain("sk-secret");
    } finally {
      process.env = before;
    }
  });
});
