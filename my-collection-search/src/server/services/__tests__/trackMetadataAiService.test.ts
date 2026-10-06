import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockGetPrompt, mockListFlat, mockFindTrack, mockReleaseCounts } = vi.hoisted(
  () => ({
    mockCreate: vi.fn(),
    mockGetPrompt: vi.fn(),
    mockListFlat: vi.fn(),
    mockFindTrack: vi.fn(),
    mockReleaseCounts: vi.fn(),
  })
);

vi.mock("openai", () => ({
  default: class {
    responses = { create: mockCreate };
  },
}));
vi.mock("@/lib/serverPrompts", () => ({
  getTrackMetadataPromptForFriend: mockGetPrompt,
}));
vi.mock("@/server/repositories/genreRepository", () => ({
  genreRepository: { listFlat: mockListFlat },
}));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackWithAlbumMetadata: mockFindTrack },
}));
vi.mock("@/server/repositories/trackGenreRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/trackGenreRepository")>()),
  trackGenreRepository: { listReleaseGenreCounts: mockReleaseCounts },
}));

import { generateTrackMetadata, TrackMetadataError } from "../trackMetadataAiService";

// ─── Response builders ────────────────────────────────────────────────────────

const ELECTRONIC = "00000000-0000-4000-8000-000000000001";
const DEEP_HOUSE = "00000000-0000-4000-8000-000000000002";
const LATIN = "00000000-0000-4000-8000-000000000003";
const CUMBIA = "00000000-0000-4000-8000-000000000004";

const genreRow = (id: string, name: string, parent_id: string | null, track_count = 0) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  parent_id,
  source: "discogs" as const,
  track_count,
  album_count: 0,
});

const TAXONOMY = [
  genreRow(DEEP_HOUSE, "Deep House", ELECTRONIC, 4),
  genreRow(ELECTRONIC, "Electronic", null),
  genreRow(LATIN, "Latin", null),
  genreRow(CUMBIA, "Cumbia", LATIN, 9),
];

const DEEP_HOUSE_GENRE = {
  id: DEEP_HOUSE,
  name: "Deep House",
  slug: "deep-house",
  parent_id: ELECTRONIC,
  parent_name: "Electronic",
};

const META = {
  genres: ["Deep House"],
  descriptors: ["Late-Night"],
  notes: "Warm, dubby groove.",
  needs_search: false,
  artist_match_confidence: "high" as const,
};

const SUGGESTION = {
  genres: [DEEP_HOUSE_GENRE],
  descriptors: ["late-night"],
  notes: "Warm, dubby groove.",
};

/** The JSON schema sent with the nth OpenAI call. */
const schemaOf = (call = 0) => mockCreate.mock.calls[call][0].text.format.schema;
/** The user prompt sent with the nth OpenAI call. */
const promptOf = (call = 0) => mockCreate.mock.calls[call][0].input[1].content as string;

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
  mockListFlat.mockResolvedValue(TAXONOMY);
  mockFindTrack.mockResolvedValue(null);
  mockReleaseCounts.mockResolvedValue([]);
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
  it("returns taxonomy genres, descriptors and notes on a high-confidence result", async () => {
    mockCreate.mockResolvedValueOnce(outputText(META));
    const res = await generateTrackMetadata({ prompt: "Artist - Title" });
    expect(res).toEqual(SUGGESTION);
    // First (only) pass is search-backed.
    expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
  });

  it("returns a generic fallback when artist confidence is not high", async () => {
    mockCreate.mockResolvedValueOnce(outputText({ ...META, artist_match_confidence: "low" }));
    const res = await generateTrackMetadata({ prompt: "Artist - Title" });
    expect(res.genres).toEqual([]);
    expect(res.descriptors).toEqual([]);
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
    expect(res).toEqual(SUGGESTION);
  });

  it("reads metadata from JSON in a content text block", async () => {
    mockCreate.mockResolvedValueOnce(textContent(META));
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res.genres).toEqual([DEEP_HOUSE_GENRE]);
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
    expect(res.genres).toEqual([DEEP_HOUSE_GENRE]);
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
    expect(res.genres).toEqual([DEEP_HOUSE_GENRE]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // First call is search-backed (tools), second (non-search) has no tools.
    expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
    expect(mockCreate.mock.calls[1][0].tools).toBeUndefined();
  });
});

// ─── Taxonomy constraint (#374) ────────────────────────────────────────────────

describe("generateTrackMetadata — genres from the taxonomy", () => {
  it("offers the taxonomy's names as the genre enum, sorted, at most three", async () => {
    mockCreate.mockResolvedValueOnce(outputText(META));
    await generateTrackMetadata({ prompt: "p" });
    const { genres, descriptors, notes } = schemaOf().properties;
    expect(genres.items.enum).toEqual(["Cumbia", "Deep House", "Electronic", "Latin"]);
    expect(genres.maxItems).toBe(3);
    expect(descriptors.maxItems).toBe(3);
    expect(notes).toEqual({ type: "string" });
    expect(schemaOf().properties.genre).toBeUndefined();
    expect(mockCreate.mock.calls[0][0].input[0].content).toMatch(/Genre rules:/);
  });

  it("drops names outside the taxonomy and repeats, resolving the rest by spelling", async () => {
    mockCreate.mockResolvedValueOnce(
      parsedContent({
        ...META,
        genres: ["Feminist Anthem", "deep house", "Deep House", "cumbia", 7],
        descriptors: ["Uplifting", "uplifting", "Dark", "Hypnotic", "Warm"],
      })
    );
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res.genres.map((genre) => genre.name)).toEqual(["Deep House", "Cumbia"]);
    expect(res.genres[1]).toEqual({
      id: CUMBIA,
      name: "Cumbia",
      slug: "cumbia",
      parent_id: LATIN,
      parent_name: "Latin",
    });
    expect(res.descriptors).toEqual(["uplifting", "dark", "hypnotic"]);
  });

  it("reads the text instead when a pre-parsed object lacks the new fields", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", parsed: { genre: "Deep House", notes: "old shape" } },
            { type: "output_text", text: JSON.stringify(META) },
          ],
        },
      ],
    });
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res).toEqual(SUGGESTION);
  });

  it("treats missing genre and descriptor arrays in free text as empty", async () => {
    mockCreate.mockResolvedValueOnce(
      textContent({ notes: "n", needs_search: true, artist_match_confidence: "high" })
    );
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res).toEqual({ genres: [], descriptors: [], notes: "n" });
  });

  it("returns empty notes when free text has none", async () => {
    mockCreate.mockResolvedValueOnce(
      textContent({ genres: [], descriptors: ["dub"], artist_match_confidence: "high" })
    );
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(res).toEqual({ genres: [], descriptors: ["dub"], notes: "" });
  });

  it("allows no genres at all when the taxonomy is empty", async () => {
    mockListFlat.mockResolvedValueOnce([]);
    mockCreate.mockResolvedValueOnce(outputText(META));
    const res = await generateTrackMetadata({ prompt: "p" });
    expect(schemaOf().properties.genres).toEqual({
      type: "array",
      items: { type: "string" },
      maxItems: 0,
    });
    expect(res.genres).toEqual([]);
  });
});

describe("generateTrackMetadata — album context", () => {
  it("adds the album's Discogs genres, styles and the release's track genres", async () => {
    mockFindTrack.mockResolvedValueOnce({
      track_id: "t1",
      release_id: "r1",
      album_genres: ["Latin"],
      album_styles: ["Cumbia", "Salsa"],
    });
    mockReleaseCounts.mockResolvedValueOnce([{ name: "Cumbia", track_count: 3 }]);
    mockCreate.mockResolvedValueOnce(outputText(META));

    await generateTrackMetadata({ prompt: "Artist - Title", friendId: 6, trackId: "t1" });

    expect(mockFindTrack).toHaveBeenCalledWith("t1", 6);
    expect(mockReleaseCounts).toHaveBeenCalledWith("r1", 6, "t1");
    expect(promptOf()).toBe(
      [
        "Artist - Title",
        "Album Discogs genres: Latin",
        "Album Discogs styles: Cumbia, Salsa",
        "Track genres already used on this album: Cumbia (3)",
      ].join("\n")
    );
  });

  it("falls back to the track's own genres and styles without an album row", async () => {
    mockFindTrack.mockResolvedValueOnce({
      track_id: "t1",
      release_id: null,
      album_genres: null,
      album_styles: null,
      genres: ["Electronic"],
      styles: ["Deep House"],
    });
    mockCreate.mockResolvedValueOnce(outputText(META));

    await generateTrackMetadata({ prompt: "p", friendId: 6, trackId: "t1" });

    expect(mockReleaseCounts).not.toHaveBeenCalled();
    expect(promptOf()).toBe(
      "p\nAlbum Discogs genres: Electronic\nAlbum Discogs styles: Deep House"
    );
  });

  it("still works for a track with no album styles or genres", async () => {
    mockFindTrack.mockResolvedValueOnce({ track_id: "t1", release_id: "r1" });
    mockCreate.mockResolvedValueOnce(outputText(META));

    const res = await generateTrackMetadata({ prompt: "p", friendId: 6, trackId: "t1" });

    expect(promptOf()).toBe("p");
    expect(res).toEqual(SUGGESTION);
  });

  it("adds nothing for an unknown track or without a friend", async () => {
    mockCreate.mockResolvedValue(outputText(META));

    await generateTrackMetadata({ prompt: "p", friendId: 6, trackId: "missing" });
    await generateTrackMetadata({ prompt: "p", trackId: "t1" });

    expect(mockFindTrack).toHaveBeenCalledTimes(1);
    expect(promptOf(0)).toBe("p");
    expect(promptOf(1)).toBe("p");
  });
});
