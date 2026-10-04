import { NextResponse } from "next/server";
import { getServingModel } from "@/lib/embeddings/config";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { trackRepository } from "@/server/repositories/trackRepository";

/**
 * `audio_vibe` vectors at the serving model, keyed `friend_id:track_id`
 * (#393). Parsed from pgvector text so the response carries a float array,
 * as `_vectors.default` always has.
 */
async function loadVectors(
  tracks: Array<{ track_id: string; friend_id: number }>
): Promise<Map<string, number[]>> {
  const { model, templateVersion } = await getServingModel("audio_vibe");
  const rows = await embeddingsRepository.findEmbeddingsForTracks(
    tracks.map((t) => ({ trackId: t.track_id, friendId: t.friend_id })),
    "audio_vibe",
    model,
    templateVersion
  );
  const vectors = new Map<string, number[]>();
  for (const row of rows) {
    try {
      vectors.set(`${row.friend_id}:${row.track_id}`, JSON.parse(row.embedding) as number[]);
    } catch {
      // An unparseable vector is treated as absent rather than failing the batch.
    }
  }
  return vectors;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tracks: Array<{ track_id: string; friend_id: number; position?: number }>;
      include_vectors?: boolean;
    };
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];
    const includeVectors = body?.include_vectors === true;
    if (tracks.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // Build a VALUES table of (track_id, friend_id, ord) to preserve order
    const rows = await trackRepository.findTracksByRefsPreservingOrder(tracks);
    const vectors = includeVectors ? await loadVectors(tracks) : null;

    const ordered = rows.map((t) => {
      const rest = { ...t } as Record<string, unknown>;
      delete rest.ord;
      const vector = vectors?.get(`${t.friend_id}:${t.track_id}`);
      return vector ? { ...rest, _vectors: { default: vector } } : rest;
    });
    return NextResponse.json(ordered);
  } catch (error) {
    console.error("Error fetching tracks by ids:", error);
    return NextResponse.json(
      { error: "Failed to fetch tracks" },
      { status: 500 }
    );
  }
}
