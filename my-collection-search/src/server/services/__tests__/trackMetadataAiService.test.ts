import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockGetPrompt } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockGetPrompt: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    responses = { create: mockCreate };
  },
}));
vi.mock("@/lib/serverPrompts", () => ({
  getTrackMetadataPromptForFriend: mockGetPrompt,
}));

import { generateTrackMetadata, TrackMetadataError } from "../trackMetadataAiService";

// ─── Response builders ────────────────────────────────────────────────────────

const META = {
  genre: "Deep House",
  notes: "Warm, dubby groove.",
  needs_search: false,
  artist_match_confidence: "high" as const,
};

const outputText = (obj: unknown) => ({ output_text: JSON.stringify(obj) });
const parsedContent = (obj: unknown) => ({
  output: [{ type: "message", content: [{ type: "output_text", parsed: obj }] }],
});
const textContent = (obj: unknown) => ({
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }],
});
const junk = { output_text: "not json at all", output: [] };

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  mockGetPrompt.mockResolvedValue("SYSTEM PROMPT");
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

// ─── Guard clauses ────────────────────────────────────────────────────────────

describe("generateTrackMetadata — validation", () => {
  it("throws a 500 when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generateTrackMetadata({ prompt: "x" })).rejects.toMatchObject({
      name: "TrackMetadataError",
      status: 500,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws a 400 for an empty/whitespace prompt", async () => {
    await expect(generateTrackMetadata({ prompt: "   " })).rejects.toBeInstanceOf(
      TrackMetadataError
    );
    await expect(generateTrackMetadata({ prompt: "   " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws a 400 for a non-string prompt", async () => {
    await expect(
      generateTrackMetadata({ prompt: undefined as unknown as string })
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ─── Happy paths + confidence gate ────────────────────────────────────────────

describe("generateTrackMetadata — result handling", () => {
  it("returns genre/notes on a high-confidence result", async () => {
    mockCreate.mockResolvedValueOnce(outputText(META));
    const res = await generateTrackMetadata({ prompt: "Artist - Title" });
    expect(res).toEqual({ genre: "Deep House", notes: "Warm, dubby groove." });
    // First (only) pass is search-backed.
    expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
  });

  it("returns a generic fallback when artist confidence is not high", async () => {
    mockCreate.mockResolvedValueOnce(outputText({ ...META, artist_match_confidence: "low" }));
    const res = await generateTrackMetadata({ prompt: "Artist - Title" });
    expect(res.genre).toBe("");
    expect(res.notes).toMatch(/could not confidently identify/i);
  });

  it("passes the friend-specific system prompt through", async () => {
    mockGetPrompt.mockResolvedValueOnce("FRIEND PROMPT");
    mockCreate.mockResolvedValueOnce(outputText(META));
    await generateTrackMetadata({ prompt: "p", friendId: 7 });
    expect(mockGetPrompt).toHaveBeenCalledWith(7);
    expect(mockCreate.mock.calls[0][0].input[0].content).toMatch(/FRIEND PROMPT/);
  });
});

// ─── Response parsing variants ─────────────────────────────────────────────────

describe("generateTrackMetadata — response parsing", () => {
  it("reads metadata from a pre-parsed content object", async () => {
    mockCreate.mockResolvedValueOnce(parsedContent(META));
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res).toEqual({ genre: "Deep House", notes: "Warm, dubby groove." });
  });

  it("reads metadata from JSON in a content text block", async () => {
    mockCreate.mockResolvedValueOnce(textContent(META));
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res.genre).toBe("Deep House");
  });

  it("throws a TrackMetadataError when both passes return non-JSON", async () => {
    mockCreate.mockResolvedValue(junk); // every call returns junk
    await expect(generateTrackMetadata({ prompt: "p" })).rejects.toThrow(/non-JSON/i);
  });
});

// ─── Fallback behavior ──────────────────────────────────────────────────────────

describe("generateTrackMetadata — fallbacks", () => {
  it("retries with the fallback model on a 404 within the search pass", async () => {
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error("model not found"), { status: 404 }))
      .mockResolvedValueOnce(outputText(META));
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res.genre).toBe("Deep House");
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const [first, second] = mockCreate.mock.calls;
    expect(first[0].model).not.toBe(second[0].model);
    // Both are still the search-backed pass.
    expect(first[0].tools).toBeDefined();
    expect(second[0].tools).toBeDefined();
  });

  it("falls back to a non-search pass when the search pass fails outright", async () => {
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }))
      .mockResolvedValueOnce(outputText(META));
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res.genre).toBe("Deep House");
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // First call is search-backed (tools), second (non-search) has no tools.
    expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
    expect(mockCreate.mock.calls[1][0].tools).toBeUndefined();
  });
});
