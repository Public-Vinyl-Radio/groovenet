import { NextResponse } from "next/server";
import { getServingModel } from "@/lib/embeddings/config";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import {
  playlistGeneticBodySchema,
  playlistGeneticResponseSchema,
} from "@/api-contract/schemas";

export async function POST(req: Request) {
  try {
    const parsedBody = playlistGeneticBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid playlist payload",
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const inputTracks = parsedBody.data.playlist;
    const mode = parsedBody.data.mode ?? "genetic";
    const invalid: Array<{ track_id?: string; reason: string }> = [];

    // Vectors come from `track_embeddings` at the audio_vibe serving model,
    // not from the request: the client's `Track.embedding` is the legacy
    // prompt column (#393), and a single model keeps every vector in one space.
    const lookupRefs = inputTracks.flatMap((track) =>
      typeof track.friend_id === "number"
        ? [{ trackId: track.track_id, friendId: track.friend_id }]
        : []
    );
    const { model, templateVersion } = await getServingModel("audio_vibe");
    const embeddingRows = await embeddingsRepository.findEmbeddingsForTracks(
      lookupRefs,
      "audio_vibe",
      model,
      templateVersion
    );
    const embeddingByTrack = new Map(
      embeddingRows.map((row) => [`${row.friend_id}:${row.track_id}`, row.embedding])
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

        const trackId =
          typeof track.track_id === "string" ? track.track_id : undefined;

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

        return {
          ...track,
          bpm: Number.isFinite(bpm) ? bpm : undefined,
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
        { status: 400 }
      );
    }

    if (normalizedTracks.length === 0) {
      return NextResponse.json(
        { error: "No valid tracks provided for genetic optimization." },
        { status: 400 }
      );
    }
    const res = await fetch(`http://ga-service:8002/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracks: normalizedTracks,
        mode,
      }),
    });
    const responseJson = await res.json();
    if (res.ok) {
      const validated = playlistGeneticResponseSchema.safeParse(responseJson);
      if (validated.success) {
        return NextResponse.json(validated.data, { status: res.status });
      }
    }
    return NextResponse.json(responseJson, { status: res.status });
  } catch (error) {
    console.error("Error creating playlist:", error);
    return NextResponse.json(
      { error: "Failed to create playlist" },
      { status: 500 }
    );
  }
}
