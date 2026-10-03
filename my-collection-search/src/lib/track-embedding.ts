import { Track } from "@/types/track";
import { settingsRepository } from "@/server/repositories/settingsRepository";
import { createOpenAiEmbeddingProvider } from "@/lib/embeddings/openaiProvider";

/**
 * The legacy free-text "prompt" embedding (`tracks.embedding`). Out of scope
 * for #386's multi-model storage/cutover — the column has no `model`/`dims`
 * and isn't used in any `<=>` query (ga-service receives it verbatim, see
 * the follow-up issue to move that onto `track_embeddings`) — so it stays
 * pinned to one model, just routed through the shared provider interface
 * instead of its own OpenAI client.
 */
const PROMPT_MODEL = "text-embedding-3-small";

const DEFAULT_TEMPLATE = [
  "Title: {{title}}",
  "Artist: {{artist}}",
  "Album: {{album}}",
  "Year: {{year}}",
  "Style: {{local_tags}}",
  "Genres: {{genres}}",
  "Styles: {{styles}}",
  "Key: {{key}}",
  "BPM: {{bpm}}",
  "Danceability: {{danceability}}",
  "Mood Happy: {{mood_happy}}",
  "Mood Sad: {{mood_sad}}",
  "Mood Relaxed: {{mood_relaxed}}",
  "Mood Aggressive: {{mood_aggressive}}",
  "Notes: {{notes}}",
].join("\n");

type TemplateCacheEntry = {
  template: string;
  expiresAt: number;
};

const templateCache = new Map<number, TemplateCacheEntry>();
const TEMPLATE_TTL_MS = 60_000;

export function getDefaultTrackEmbeddingTemplate(): string {
  return DEFAULT_TEMPLATE;
}

export function invalidateTrackEmbeddingTemplateCache(friendId?: number): void {
  if (!friendId || Number.isNaN(friendId)) return;
  templateCache.delete(friendId);
}

function cleanNotes(notes?: string | null): string {
  if (!notes) return "";
  return notes
    .replace(/^["“”'].*?["“”']\s*/, "This track ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .trim();
}

function asList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

async function getTemplateForFriend(friendId?: number): Promise<string> {
  if (!friendId || Number.isNaN(friendId)) return DEFAULT_TEMPLATE;

  const now = Date.now();
  const cached = templateCache.get(friendId);
  if (cached && cached.expiresAt > now) return cached.template;

  try {
    const template =
      (await settingsRepository.findEmbeddingTemplateByFriendId(friendId)) ??
      DEFAULT_TEMPLATE;
    templateCache.set(friendId, {
      template,
      expiresAt: now + TEMPLATE_TTL_MS,
    });
    return template;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

function renderTemplate(template: string, track: Track): string {
  const values: Record<string, string> = {
    title: track.title || "",
    artist: track.artist || "",
    album: track.album || "",
    year: track.year != null ? String(track.year) : "",
    local_tags: asList(track.local_tags),
    styles: asList(track.styles),
    genres: asList(track.genres),
    key: track.key != null ? String(track.key) : "",
    bpm: track.bpm != null ? String(track.bpm) : "",
    danceability:
      track.danceability != null ? String(track.danceability) : "",
    mood_happy: track.mood_happy != null ? String(track.mood_happy) : "",
    mood_sad: track.mood_sad != null ? String(track.mood_sad) : "",
    mood_relaxed:
      track.mood_relaxed != null ? String(track.mood_relaxed) : "",
    mood_aggressive:
      track.mood_aggressive != null ? String(track.mood_aggressive) : "",
    notes: cleanNotes(track.notes),
  };

  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token: string) => {
      return values[token] ?? "";
    })
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n");
}

export function buildTrackPrompt(track: Track, template: string): string {
  return renderTemplate(template || DEFAULT_TEMPLATE, track);
}

export async function getTrackEmbedding(track: Track): Promise<number[]> {
  const template = await getTemplateForFriend(track.friend_id);
  const prompt = buildTrackPrompt(track, template);
  console.log("Generating embedding for prompt:", prompt);
  const provider = createOpenAiEmbeddingProvider(PROMPT_MODEL);
  const [embedding] = await provider.embed([prompt]);
  return embedding;
}
