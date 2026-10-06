import { NextRequest, NextResponse } from "next/server";
import { trackGenreFacetsResponseSchema } from "@/api-contract/schemas";
import { genreRepository } from "@/server/repositories/genreRepository";
import {
  buildTrackSearchWhere,
  lexicalMatchClause,
  parseTrackSearchParams,
} from "@/server/services/trackSearchWhere";

/**
 * Genre counts for the search's filter UI (#375): the same parameters as
 * `/api/tracks/search`, counted per genre. `genre` itself is ignored, so
 * picking one genre leaves the others' counts in view. Keyword search only —
 * semantic and hybrid return a single ranked page, which counts can't describe.
 */
export async function GET(request: NextRequest) {
  try {
    const parsedQuery = parseTrackSearchParams(request.nextUrl.searchParams);
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }
    const { q, filter, friend_id, mode, bpm_min, bpm_max, key, star_rating } = parsedQuery.data;
    const words = q.trim();
    if (mode !== "lexical" && words.length > 0) {
      return NextResponse.json(
        { error: `Genre counts are for keyword search, not mode=${mode}` },
        { status: 400 }
      );
    }
    if (bpm_min !== undefined && bpm_max !== undefined && bpm_min > bpm_max) {
      return NextResponse.json({ error: "bpm_min must not exceed bpm_max" }, { status: 400 });
    }

    const { where, params } = buildTrackSearchWhere({
      filter,
      friendId: friend_id,
      attributes: { bpmMin: bpm_min, bpmMax: bpm_max, key, minStarRating: star_rating },
    });
    if (words.length > 0) {
      params.push(words);
      where.push(lexicalMatchClause(`$${params.length}`));
    }

    const genres = await genreRepository.trackFacets(where, params);
    return NextResponse.json(trackGenreFacetsResponseSchema.parse({ genres }));
  } catch (error) {
    console.error("Genre facets error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Genre facets failed" },
      { status: 500 }
    );
  }
}
