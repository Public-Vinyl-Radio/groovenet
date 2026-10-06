import OpenAI from "openai";
import { normalizeGenreName } from "@/lib/genres/normalization";
import type { LocalTagValue } from "@/lib/genres/localTags";
import type { ProposalDraft, TaxonomyEntry } from "@/server/repositories/genreReconciliationRepository";

/**
 * The AI step of local_tags reconciliation (#372): values no taxonomy name or
 * alias matches go to the model in batches, with the taxonomy as an enum, and
 * come back as proposals for a person to review. Nothing here writes.
 */

export const RECONCILIATION_MODEL = process.env.OPENAI_GENRE_RECONCILIATION_MODEL || "gpt-5-mini";
export const RECONCILIATION_BATCH_SIZE = 40;

// USD per million tokens. Defaults are gpt-5-mini's list prices; set both when
// switching model, or the logged cost is wrong (the calls themselves are not).
const INPUT_USD_PER_MTOK = Number(process.env.GENRE_RECONCILIATION_INPUT_USD_PER_MTOK || 0.25);
const OUTPUT_USD_PER_MTOK = Number(process.env.GENRE_RECONCILIATION_OUTPUT_USD_PER_MTOK || 2);

export type AiUsage = { input_tokens: number; output_tokens: number; cost_usd: number };

export type AiMapping = {
  value: string;
  action: "map" | "new_genre" | "descriptor" | "drop";
  genres: string[];
  proposed_genre: string | null;
  proposed_parent: string | null;
  confidence: number;
};

let _openai: OpenAI | undefined;
function getOpenAI(): OpenAI {
  _openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export function costOf(inputTokens: number, outputTokens: number): number {
  return (inputTokens * INPUT_USD_PER_MTOK + outputTokens * OUTPUT_USD_PER_MTOK) / 1_000_000;
}

/** Structured-output schema; genre names are an enum, shared through `$defs`. */
export function buildMappingSchema(genreNames: string[]) {
  return {
    type: "json_schema" as const,
    name: "genre_reconciliation",
    strict: true,
    schema: {
      type: "object",
      $defs: { genre: { type: "string", enum: genreNames } },
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              action: { type: "string", enum: ["map", "new_genre", "descriptor", "drop"] },
              genres: { type: "array", items: { $ref: "#/$defs/genre" } },
              proposed_genre: { type: ["string", "null"] },
              proposed_parent: { anyOf: [{ $ref: "#/$defs/genre" }, { type: "null" }] },
              confidence: { type: "number" },
            },
            required: ["value", "action", "genres", "proposed_genre", "proposed_parent", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      additionalProperties: false,
    },
  };
}

export function buildSystemPrompt(taxonomy: TaxonomyEntry[], newGenreMinTracks: number): string {
  const lines = taxonomy.map((g) => (g.parent_name ? `${g.parent_name} > ${g.name}` : g.name));
  return `You map a DJ's free-text track genre tags onto a fixed genre taxonomy.

For each tag, choose one action:
- "map": the tag names a genre the taxonomy already covers. Put 1-3 taxonomy names in "genres", most specific first. Spelling variants, translations and near-synonyms map.
- "new_genre": a real, established DJ genre or scene the taxonomy lacks (for example "Chicha" or "Psychedelic Cumbia"). Give a clean display name in "proposed_genre" and the closest taxonomy entry as "proposed_parent". Only when the tag says may_propose_new_genre=true; otherwise map it to the nearest entry.
- "descriptor": a mood, era, function or description with no genre in it ("Uplifting", "Feminist Anthem", "Wu-Tang Classic").
- "drop": noise, an artist or label name, or nothing useful.

A tag mixing a genre with a mood word ("Uplifting MPB", "Timeless Salsa") maps to the genre.
Album styles are context from the record; one album can mix genres, so the tag outranks them.
"confidence" is 0-1. Use null for proposed_genre and proposed_parent unless the action is "new_genre".
Return exactly one result per input tag, with "value" copied verbatim.
New genres need at least ${newGenreMinTracks} tracks.

Taxonomy (Parent > Child):
${lines.join("\n")}`;
}

export function buildUserPrompt(batch: LocalTagValue[], newGenreMinTracks: number): string {
  return JSON.stringify(
    batch.map((value) => ({
      value: value.value_normalized,
      spellings: value.raw_examples,
      tracks: value.track_count,
      album_styles: value.styles,
      may_propose_new_genre: value.track_count >= newGenreMinTracks,
    }))
  );
}

/**
 * Turns the model's answers into proposals, trusting nothing: names resolve
 * through the taxonomy, a new genre below the track threshold becomes a map to
 * its parent, and a value the batch did not contain is ignored.
 */
export function toProposalDrafts(
  batch: LocalTagValue[],
  mappings: AiMapping[],
  taxonomy: TaxonomyEntry[],
  newGenreMinTracks: number
): ProposalDraft[] {
  const byName = new Map(taxonomy.map((g) => [g.normalized_name, g.id]));
  const resolve = (name: string | null) => (name ? byName.get(normalizeGenreName(name)) : undefined);
  const byValue = new Map(batch.map((value) => [value.value_normalized, value]));
  const drafts = new Map<string, ProposalDraft>();

  for (const mapping of mappings) {
    const value = byValue.get(normalizeGenreName(mapping.value));
    if (!value || drafts.has(value.value_normalized)) continue;

    let confidence = Math.min(Math.max(Number(mapping.confidence) || 0, 0), 1);
    let action = mapping.action;
    let targets = [...new Set(mapping.genres.map(resolve).filter((id): id is string => !!id))];
    let proposedName = mapping.proposed_genre?.trim() || null;
    const parentId = resolve(mapping.proposed_parent) ?? null;

    if (action === "new_genre") {
      const existing = resolve(proposedName);
      if (existing) {
        // The "new" genre is already in the taxonomy.
        action = "map";
        targets = [existing];
      } else if (!proposedName || !parentId || value.track_count < newGenreMinTracks) {
        // Too rare for its own genre, or unplaceable: fall back to the parent.
        action = "map";
        targets = parentId ? [parentId] : targets;
        confidence *= 0.5;
      }
    }
    if (action === "map" && targets.length === 0) continue;
    if (action !== "new_genre") proposedName = null;

    drafts.set(value.value_normalized, {
      value_normalized: value.value_normalized,
      raw_examples: value.raw_examples,
      track_count: value.track_count,
      action,
      target_genre_ids: action === "map" ? targets : [],
      proposed_genre_name: proposedName,
      proposed_parent_id: action === "new_genre" ? parentId : null,
      confidence,
      method: "ai",
    });
  }
  return [...drafts.values()];
}

/** One batch, one model call. Throws on a refusal or unparseable output. */
export async function mapValuesWithAi(
  batch: LocalTagValue[],
  taxonomy: TaxonomyEntry[],
  newGenreMinTracks: number
): Promise<{ drafts: ProposalDraft[]; usage: AiUsage }> {
  const response = await getOpenAI().responses.create({
    model: RECONCILIATION_MODEL,
    input: [
      { role: "system", content: buildSystemPrompt(taxonomy, newGenreMinTracks) },
      { role: "user", content: buildUserPrompt(batch, newGenreMinTracks) },
    ],
    text: { format: buildMappingSchema(taxonomy.map((g) => g.name)) },
    max_output_tokens: 16_000,
  });

  const input = response.usage?.input_tokens ?? 0;
  const output = response.usage?.output_tokens ?? 0;
  const usage = { input_tokens: input, output_tokens: output, cost_usd: costOf(input, output) };

  if (response.status === "incomplete") {
    throw Object.assign(new Error(`Model output incomplete: ${response.incomplete_details?.reason ?? "unknown"}`), { usage });
  }
  let parsed: { results: AiMapping[] };
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw Object.assign(new Error("Model returned non-JSON output"), { usage });
  }
  return { drafts: toProposalDrafts(batch, parsed.results, taxonomy, newGenreMinTracks), usage };
}
