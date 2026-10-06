import OpenAI from "openai";
import { getTrackMetadataPromptForFriend } from "@/lib/serverPrompts";
import type { TrackGenre } from "@/types/track";
import { genreRepository } from "@/server/repositories/genreRepository";
import {
  normalizeDescriptors,
  trackGenreRepository,
} from "@/server/repositories/trackGenreRepository";
import { trackRepository } from "@/server/repositories/trackRepository";
import {
  albumContextLines,
  genreEnumNames,
  MAX_SUGGESTED_DESCRIPTORS,
  MAX_SUGGESTED_GENRES,
  resolveSuggestedGenres,
  toGenreChoices,
  type AlbumGenreContext,
} from "@/server/genres/enrichmentGenres";

let _openai: OpenAI | undefined;
function getOpenAI(): OpenAI {
  _openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const PRIMARY_MODEL = process.env.OPENAI_TRACK_METADATA_MODEL || "gpt-5-mini";
const FALLBACK_MODEL =
  process.env.OPENAI_TRACK_METADATA_FALLBACK_MODEL || "gpt-4.1-mini";
const SEARCH_MODEL =
  process.env.OPENAI_TRACK_METADATA_SEARCH_MODEL || PRIMARY_MODEL;
const HARD_GUARDRAILS = `
Non-negotiable rules:
- Do not guess genre, vibe, energy, BPM, or cultural context from title/artist alone.
- Use cautious wording unless facts are verifiable.
- Avoid generic hype language (e.g., "peak-time", "pulsating beat", "driven energy") unless explicitly supported.
- Keep "notes" concise (1-3 sentences), practical for DJs, and evidence-aware.
- If information is uncertain after checking available context, leave uncertain fields empty and explain uncertainty briefly in notes.
- If multiple artists could match the same name/title combination, treat the result as ambiguous.
- Do not claim nationality, era, or scene unless the exact artist-track match is clear.
`.trim();

const GENRE_RULES = `
Genre rules:
- "genres": up to ${MAX_SUGGESTED_GENRES} entries, only from the allowed list, naming what this track is. Usually one.
- Prefer a narrower genre than the album's Discogs genres and styles when the evidence supports it; repeat an album style only when it is the best fit for this track.
- When the album's other tracks already use a genre that fits, reuse it rather than a near-synonym.
- Moods, eras, scenes and other description words go in "descriptors" (0-${MAX_SUGGESTED_DESCRIPTORS} short lowercase words or phrases), never in genres.
- If no allowed genre fits, leave "genres" empty and describe the track with descriptors.
`.trim();

/**
 * The structured output, with track genres constrained to the taxonomy (#374):
 * the model can only name a genre that exists, so enrichment never invents
 * one. New genres come through the taxonomy's own admin and review flow.
 */
function buildMetadataSchema(genreNames: string[]) {
  return {
    type: "json_schema" as const,
    name: "track_metadata",
    schema: {
      type: "object",
      properties: {
        genres: {
          type: "array",
          items: genreNames.length > 0 ? { type: "string", enum: genreNames } : { type: "string" },
          maxItems: genreNames.length > 0 ? MAX_SUGGESTED_GENRES : 0,
        },
        descriptors: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_SUGGESTED_DESCRIPTORS,
        },
        notes: { type: "string" },
        needs_search: { type: "boolean" },
        artist_match_confidence: { type: "string", enum: ["high", "low"] },
      },
      required: ["genres", "descriptors", "notes", "needs_search", "artist_match_confidence"],
      additionalProperties: false,
    },
    strict: true,
  };
}

type MetadataSchema = ReturnType<typeof buildMetadataSchema>;

type MetadataResult = {
  genres: string[];
  descriptors: string[];
  notes: string;
  needs_search: boolean;
  artist_match_confidence: "high" | "low";
};

export type TrackMetadataSuggestion = {
  /** Taxonomy genres only: anything else the model returns is dropped. */
  genres: TrackGenre[];
  /** Normalised, at most MAX_SUGGESTED_DESCRIPTORS. */
  descriptors: string[];
  notes: string;
};

export class TrackMetadataError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "TrackMetadataError";
    this.status = status;
  }
}

type ParseableResponse = {
  output_text?: string;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
};

function parseMetadataFromResponse(
  response: Awaited<ReturnType<OpenAI["responses"]["create"]>>
): MetadataResult {
  const res = response as ParseableResponse;
  const candidates: string[] = [];

  if (typeof res.output_text === "string" && res.output_text.trim()) {
    candidates.push(res.output_text.trim());
  }

  for (const item of res.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;

      // Some SDK/parser paths include parsed JSON directly on content.
      const parsed = (content as unknown as { parsed?: unknown }).parsed;
      if (parsed && typeof parsed === "object") {
        const maybe = parsed as Partial<MetadataResult>;
        if (
          Array.isArray(maybe.genres) &&
          Array.isArray(maybe.descriptors) &&
          typeof maybe.notes === "string" &&
          typeof maybe.needs_search === "boolean" &&
          (maybe.artist_match_confidence === "high" ||
            maybe.artist_match_confidence === "low")
        ) {
          return maybe as MetadataResult;
        }
      }

      if (typeof content.text === "string" && content.text.trim()) {
        candidates.push(content.text.trim());
      }
    }
  }

  for (const text of candidates) {
    try {
      return JSON.parse(text) as MetadataResult;
    } catch {
      // Try the next candidate.
    }
  }

  throw new TrackMetadataError(
    "Model returned non-JSON output for track metadata"
  );
}

async function fetchMetadata(
  systemPrompt: string,
  prompt: string,
  schema: MetadataSchema,
  useSearch: boolean
): Promise<MetadataResult> {
  const model = useSearch ? SEARCH_MODEL : PRIMARY_MODEL;
  const fallbackModel = FALLBACK_MODEL;
  const baseRequest = {
    model,
    input: [
      {
        role: "system" as const,
        content: `${systemPrompt}\n\n${HARD_GUARDRAILS}\n\n${GENRE_RULES}`,
      },
      { role: "user" as const, content: prompt },
    ],
    ...(useSearch
      ? {
          tools: [{ type: "web_search" as const }],
          tool_choice: "required" as const,
        }
      : {}),
    text: { format: schema },
    max_output_tokens: 300,
  };

  try {
    const response = await getOpenAI().responses.create(baseRequest);
    return parseMetadataFromResponse(response);
  } catch (error) {
    const err = error as { message?: string; status?: number };
    const shouldFallback =
      fallbackModel &&
      fallbackModel !== model &&
      (err.status === 404 ||
        err.status === 400 ||
        /model|unsupported|not found/i.test(err.message || ""));

    if (!shouldFallback) {
      throw error;
    }

    console.warn(
      `[track-metadata] model '${model}' failed (${err.status ?? "unknown"}), retrying with '${fallbackModel}'`
    );

    const retryResponse = await getOpenAI().responses.create({
      ...baseRequest,
      model: fallbackModel,
    });
    return parseMetadataFromResponse(retryResponse);
  }
}

/**
 * The album's Discogs genres and styles and the genres its other tracks
 * already carry, so the model picks a track genre narrower than the album's
 * rather than repeating it. Empty for a track with no album or no styles.
 */
async function loadAlbumGenreContext(
  trackId: string | undefined,
  friendId: number | undefined
): Promise<AlbumGenreContext> {
  const empty: AlbumGenreContext = { albumGenres: [], albumStyles: [], releaseGenres: [] };
  if (!trackId || friendId === undefined) return empty;

  const track = await trackRepository.findTrackWithAlbumMetadata(trackId, friendId);
  if (!track) return empty;
  return {
    albumGenres: track.album_genres ?? track.genres ?? [],
    albumStyles: track.album_styles ?? track.styles ?? [],
    releaseGenres: track.release_id
      ? await trackGenreRepository.listReleaseGenreCounts(track.release_id, friendId, trackId)
      : [],
  };
}

export async function generateTrackMetadata(args: {
  prompt: string;
  friendId?: number;
  trackId?: string;
}): Promise<TrackMetadataSuggestion> {
  if (!process.env.OPENAI_API_KEY) {
    throw new TrackMetadataError("Missing OPENAI_API_KEY env variable", 500);
  }
  if (typeof args.prompt !== "string" || args.prompt.trim().length === 0) {
    throw new TrackMetadataError("Missing or invalid prompt", 400);
  }

  const [systemPrompt, genreRows, context] = await Promise.all([
    getTrackMetadataPromptForFriend(args.friendId),
    genreRepository.listFlat(),
    loadAlbumGenreContext(args.trackId, args.friendId),
  ]);
  const choices = toGenreChoices(genreRows);
  const schema = buildMetadataSchema(genreEnumNames(choices, context));
  const prompt = [args.prompt.trim(), ...albumContextLines(context)].join("\n");

  let result: MetadataResult;
  try {
    // Prefer search-backed metadata first to avoid generic hallucinated descriptions.
    result = await fetchMetadata(systemPrompt, prompt, schema, true);
  } catch (error) {
    console.warn(
      "[track-metadata] search-backed pass failed, retrying without search:",
      error
    );
    result = await fetchMetadata(systemPrompt, prompt, schema, false);
  }

  if (result.needs_search) {
    console.warn("[track-metadata] model signaled unresolved uncertainty");
  }

  if (result.artist_match_confidence !== "high") {
    return {
      genres: [],
      descriptors: [],
      notes:
        "Could not confidently identify the exact artist/recording from available context. Add album/year or a source URL and retry.",
    };
  }

  const descriptors = Array.isArray(result.descriptors)
    ? result.descriptors.filter((value): value is string => typeof value === "string")
    : [];
  return {
    genres: resolveSuggestedGenres(result.genres, choices),
    descriptors: normalizeDescriptors(descriptors).slice(0, MAX_SUGGESTED_DESCRIPTORS),
    notes: typeof result.notes === "string" ? result.notes : "",
  };
}
