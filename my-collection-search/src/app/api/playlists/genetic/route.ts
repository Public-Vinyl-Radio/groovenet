import { serviceNotRunning } from "@/lib/serviceConnection";
import { NextResponse } from "next/server";
import { getServingModel } from "@/lib/embeddings/config";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { ratingKey, trackRatingRepository } from "@/server/repositories/trackRatingRepository";
import { resolveRatingViewer } from "@/server/services/trackRatingService";
import { playlistGeneticBodySchema, playlistGeneticResponseSchema } from "@/api-contract/schemas";
import { RANKING_CONFIG_IDS } from "@groovenet/contracts";
import { optimizerRankingFor } from "@/lib/ranking/ordering";
import { isPresetId } from "@/lib/ranking/profiles";
import {
  rankingProfileService,
  RankingProfileError,
  type ResolvedRanker,
} from "@/server/services/rankingProfileService";

/**
 * The profile that orders the playlist (#1193): `ranking` when given, else the
 * library's active `playlists` profile. No library to ask: Default.
 */
function resolveOrdering(
  ref: string | undefined,
  friendId: number | undefined,
): Promise<ResolvedRanker> {
  const named = ref ?? (friendId === undefined ? "default" : undefined);
  return rankingProfileService.resolveRanker(named, friendId ?? 0, "playlists");
}

/** What the response says ordered it: Default when the profile fell back. */
function appliedRanking(ranker: ResolvedRanker) {
  if (ranker.fallback) return { id: "default", name: ranker.profile.name, fallback: true };
  // A built-in config (`strict`) has no profile of its own; it is named after its id.
  const builtIn =
    (RANKING_CONFIG_IDS as readonly string[]).includes(ranker.id) && !isPresetId(ranker.id);
  const name = builtIn
    ? ranker.id.charAt(0).toUpperCase() + ranker.id.slice(1)
    : ranker.profile.name;
  return { id: ranker.id, name, fallback: false };
}

export async function POST(req: Request) {
  try {
    const parsedBody = playlistGeneticBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid playlist payload",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const inputTracks = parsedBody.data.playlist;
    const mode = parsedBody.data.mode ?? "genetic";
    const friendId =
      parsedBody.data.friend_id ??
      inputTracks.find((track) => typeof track.friend_id === "number")?.friend_id;
    const ranker = await resolveOrdering(parsedBody.data.ranking, friendId);
    // Default sends no `ranking`, so its request is the one from before profiles.
    const ranking = optimizerRankingFor(ranker);
    const invalid: Array<{ track_id?: string; reason: string }> = [];

    // Vectors come from `track_embeddings` at the audio_vibe serving model,
    // not from the request: the client's `Track.embedding` is the legacy
    // prompt column (#393), and a single model keeps every vector in one space.
    const lookupRefs = inputTracks.flatMap((track) =>
      typeof track.friend_id === "number"
        ? [{ trackId: track.track_id, friendId: track.friend_id }]
        : [],
    );
    const { model, templateVersion } = await getServingModel("audio_vibe");
    const embeddingRows = await embeddingsRepository.findEmbeddingsForTracks(
      lookupRefs,
      "audio_vibe",
      model,
      templateVersion,
    );
    const embeddingByTrack = new Map(
      embeddingRows.map((row) => [`${row.friend_id}:${row.track_id}`, row.embedding]),
    );
    // ga-service reads `star_rating` (energy fallback): the requesting
    // profile's, never the client's value (#1283). Its contract is unchanged.
    const viewer = await resolveRatingViewer(req);
    const ratings = await trackRatingRepository.forTracks(
      lookupRefs.map((ref) => ({ track_id: ref.trackId, friend_id: ref.friendId })),
      viewer.id,
    );

    const normalizedTracks = inputTracks
      .map((track: Record<string, unknown>) => {
        const bpmRaw = track.bpm;
        const bpm =
          typeof bpmRaw === "number"
            ? bpmRaw
            : typeof bpmRaw === "string"
              ? Number.parseFloat(bpmRaw)
              : NaN;

        const trackId = typeof track.track_id === "string" ? track.track_id : undefined;

        const embedding =
          typeof track.friend_id === "number"
            ? embeddingByTrack.get(`${track.friend_id}:${track.track_id}`)
            : undefined;

        if (mode === "genetic" && !embedding) {
          invalid.push({ track_id: trackId, reason: "missing_embedding" });
          return null;
        }
        if (mode === "genetic" && !Number.isFinite(bpm)) {
          invalid.push({ track_id: trackId, reason: "missing_bpm" });
          return null;
        }

        // Other profiles' ratings are display-only; the optimiser never sees them.
        const { other_ratings: _others, ...sent } = track;
        return {
          ...sent,
          bpm: Number.isFinite(bpm) ? bpm : undefined,
          // Replaced only where sent: an absent rating is ga-service's
          // neutral energy fallback, and Default's request must not change.
          ...("star_rating" in track && typeof track.friend_id === "number"
            ? {
                star_rating:
                  ratings.get(ratingKey(String(track.track_id), track.friend_id))?.rating ?? 0,
              }
            : {}),
          embedding,
        };
      })
      .filter(Boolean);

    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "Some tracks are missing required data (embedding or bpm).",
          invalid,
          invalid_count: invalid.length,
        },
        { status: 400 },
      );
    }

    if (normalizedTracks.length === 0) {
      return NextResponse.json(
        { error: "No valid tracks provided for genetic optimization." },
        { status: 400 },
      );
    }
    const res = await fetch(`http://ga-service:8002/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracks: normalizedTracks,
        mode,
        ...(ranking ? { ranking } : {}),
      }),
    });
    const responseJson = await res.json();
    if (res.ok) {
      const validated = playlistGeneticResponseSchema.safeParse({
        ...responseJson,
        ranking: appliedRanking(ranker),
      });
      if (validated.success) {
        return NextResponse.json(validated.data, { status: res.status });
      }
    }
    return NextResponse.json(responseJson, { status: res.status });
  } catch (error) {
    if (error instanceof RankingProfileError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (serviceNotRunning(error)) {
      return NextResponse.json({ error: "Optimization service not running" }, { status: 503 });
    }
    console.error("Error creating playlist:", error);
    return NextResponse.json({ error: "Failed to create playlist" }, { status: 500 });
  }
}
