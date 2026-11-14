/**
 * Lyric summaries for #1170: the fixed prompt, the output schema, validation
 * and the two renderings (identity line, context sentence). Pure functions;
 * the Ollama call lives in `summarize.mjs`.
 *
 * Only the lyrics go to the model: no title, artist or album, so the model
 * cannot fill a summary from what it remembers about a famous song instead
 * of what the text says.
 */
import { createHash } from "node:crypto";

/** Bump when the prompt, schema, options or truncation change: the cache key includes it. */
export const PROMPT_VERSION = 1;

/** Lyrics longer than this are cut before prompting; the cut is recorded per track. */
export const MAX_LYRICS_CHARS = 6000;

export const VOCAL_PRESENCE = ["hook-only", "sparse", "full lyrics"];

export const SYSTEM_PROMPT = `You summarise song lyrics for a DJ's music library.
Use only the lyrics you are given. Do not guess the song, artist or genre, and do not add anything the lyrics do not say.

Return JSON with:
- themes: 0 to 4 short phrases (1 to 4 words each) naming what the lyrics are about, e.g. "late-night longing", "protest", "party", "heartbreak". Use an empty list when the lyrics are too short or too repetitive to have a theme.
- mood: 1 to 3 single words for the emotional tone of the words, e.g. "joyful", "melancholic", "defiant".
- languages: the language or languages the lyrics are written in, as lowercase English names, e.g. "spanish", "english".
- vocal_presence: "hook-only" when the lyrics are one or two lines repeated, "sparse" when there are a few distinct lines, "full lyrics" when there are verses.

Write every phrase in lowercase English, whatever the language of the lyrics.`;

/** JSON schema passed to Ollama's `format`, so decoding is constrained to this shape. */
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    themes: { type: "array", items: { type: "string" }, maxItems: 4 },
    mood: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    languages: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    vocal_presence: { type: "string", enum: VOCAL_PRESENCE },
  },
  required: ["themes", "mood", "languages", "vocal_presence"],
};

/** Deterministic decoding. `seed` matters only if a sampler is ever used. */
export const MODEL_OPTIONS = { temperature: 0, seed: 0, num_ctx: 8192 };

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** The text the model sees, and whether it was cut. */
export function promptLyrics(lyrics) {
  const text = String(lyrics ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return text.length > MAX_LYRICS_CHARS
    ? { text: text.slice(0, MAX_LYRICS_CHARS), truncated: true }
    : { text, truncated: false };
}

export function chatRequest(model, lyrics) {
  return {
    model,
    stream: false,
    think: false,
    format: OUTPUT_SCHEMA,
    options: MODEL_OPTIONS,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Lyrics:\n${promptLyrics(lyrics).text}` },
    ],
  };
}

/** Everything that changes the output for the same lyrics. */
export function cacheKey(modelDigest, lyrics) {
  return sha256(`${PROMPT_VERSION}\n${modelDigest}\n${promptLyrics(lyrics).text}`);
}

const phrase = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/^[\s"'.,;:-]+|[\s"'.,;:-]+$/g, "")
    .trim();

function phrases(value, max, maxWords) {
  if (!Array.isArray(value)) throw new Error("Expected a list");
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error("Expected strings");
    const p = phrase(item);
    if (!p) continue;
    if (p.split(" ").length > maxWords) throw new Error(`Phrase too long: ${p.length} chars`);
    if (!out.includes(p)) out.push(p);
  }
  return out.slice(0, max);
}

/**
 * Normalise the model's JSON, or throw. A summary that breaks the shape is
 * dropped (no summary line), never repaired into something the model did
 * not say.
 */
export function validateSummary(raw) {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!value || typeof value !== "object") throw new Error("Summary is not an object");
  const summary = {
    themes: phrases(value.themes, 4, 4),
    mood: phrases(value.mood, 3, 2),
    languages: phrases(value.languages, 3, 2),
    vocal_presence: value.vocal_presence,
  };
  if (!VOCAL_PRESENCE.includes(summary.vocal_presence)) throw new Error("Invalid vocal_presence");
  if (!summary.mood.length) throw new Error("Missing mood");
  if (!summary.languages.length) throw new Error("Missing languages");
  return summary;
}

const join = (items) => items.join(", ");

/** One identity line, after `Tags:`. */
export function identityLyricsLine(s) {
  return [
    s.themes.length ? `Lyrics: ${join(s.themes)}` : "Lyrics: no clear theme",
    `mood ${join(s.mood)}`,
    `language ${join(s.languages)}`,
    `vocals ${s.vocal_presence}`,
  ].join("; ");
}

/** One sentence for the context text, after the descriptor sentence. */
export function contextLyricsSentence(s) {
  const about = s.themes.length ? `Lyrics about ${join(s.themes)}` : "Lyrics with no clear theme";
  return `${about}; ${join(s.mood)} mood; sung in ${join(s.languages)}; ${s.vocal_presence}.`;
}
