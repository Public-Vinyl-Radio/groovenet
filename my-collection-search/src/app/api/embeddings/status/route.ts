import { NextResponse } from "next/server";
import { embeddingsStatusQuerySchema } from "@/api-contract/schemas";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";

/**
 * Counts of tracks missing each embedding type (#388) — the visibility half
 * of the backfill story. `groovenet embeddings status` reads this before
 * deciding whether a backfill is even worth running.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = embeddingsStatusQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { friend_id } = parsed.data;

    const [identity, audioVibe, prompt, totalTracks, identityByModel, audioVibeByModel] =
      await Promise.all([
        embeddingsRepository.listTracksNeedingIdentityEmbeddings({ friend_id }),
        embeddingsRepository.listTracksNeedingAudioVibeEmbeddings({ friend_id }),
        embeddingsRepository.listTracksNeedingPromptEmbeddings({ friend_id }),
        embeddingsRepository.countTracks(friend_id),
        embeddingsRepository.countEmbeddingsByModel("identity", friend_id),
        embeddingsRepository.countEmbeddingsByModel("audio_vibe", friend_id),
      ]);

    return NextResponse.json({
      total_tracks: totalTracks,
      missing: {
        identity: identity.length,
        audio_vibe: audioVibe.length,
        prompt: prompt.length,
      },
      by_model: {
        identity: identityByModel,
        audio_vibe: audioVibeByModel,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading embeddings status:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read embeddings status" },
      { status: 500 }
    );
  }
}
