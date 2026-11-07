// API endpoint for searching and listing albums using PostgreSQL
// Supports sorting by created_at, date_added, year, title, album_rating
// Example: /api/albums?q=jazz&sort=created_at:desc&friend_id=1&limit=20&offset=0&genre=latin
import { NextRequest, NextResponse } from "next/server";
import {
  albumSearchQuerySchema,
  albumSearchResponseSchema,
  albumUpdateFieldsSchema,
} from "@/api-contract/schemas";
import { withArtistCredits } from "@/server/services/artistCreditService";
import { toWireRow } from "@/lib/wireRow";
import { albumApiService } from "@/server/services/albumApiService";
import { withDbTransaction } from "@/lib/serverDb";
import { albumRepository } from "@/server/repositories/albumRepository";
import { resolveGenreFilter, unknownGenresError } from "@/server/genres/genreFilter";
import { resolveArtistFilter, unknownArtistsError } from "@/server/artists/artistFilter";

import { AlbumOverrideError, resolveAlbumOverrides } from "@/server/genres/albumOverrides";
import { syncIdentityEmbeddings } from "@/server/services/trackEmbeddingSyncService";
import { triggerGenreSimilarityRefresh } from "@/server/services/genreSimilarityService";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q") || "";
    // Paging is the one part of this query string that is checked: an empty or
    // absent value takes the default (as it always has), but a value that is not a
    // non-negative integer used to reach SQL as NaN or a negative LIMIT and come
    // back as a 500. That is a client bug, so it is a 400. Everything else here
    // stays lenient on purpose: flags other than "1" are off, a non-numeric
    // friend_id matches nothing, and an unknown sort falls back to the default.
    const limit = albumSearchQuerySchema.shape.limit.safeParse(
      searchParams.get("limit") || undefined,
    );
    const offset = albumSearchQuerySchema.shape.offset.safeParse(
      searchParams.get("offset") || undefined,
    );
    if (!limit.success || !offset.success) {
      return NextResponse.json(
        { error: "limit and offset must be non-negative integers" },
        { status: 400 },
      );
    }
    const friendId = searchParams.get("friend_id");

    // Support multiple sort options:
    // - created_at:desc (recently added to Groovenet, default)
    // - date_added:desc / date_added:asc (Discogs collection date)
    // - year:desc (newest releases)
    // - year:asc (oldest releases)
    // - title:asc (alphabetical)
    // - album_rating:desc (highest rated)
    const sort = searchParams.get("sort") || "created_at:desc";
    const missingLibraryIdentifier = searchParams.get("missing_library_identifier") === "1";
    const missingLocalCoverArtUrl = searchParams.get("missing_local_cover_art_url") === "1";
    const missingAudio = searchParams.get("missing_audio") === "1";
    // Repeatable; each value is a slug, id or name, and includes its subgenres.
    const includeSimilar = searchParams.get("include_similar") === "1";
    const similarLimitRaw = searchParams.get("similar_limit");
    const similarLimit = similarLimitRaw ? Number(similarLimitRaw) : undefined;
    const genreResolution = await resolveGenreFilter(searchParams.getAll("genre"), {
      includeSimilar,
      similarLimit,
      excludeSimilarIds: searchParams.getAll("similar_exclude"),
    });
    if (genreResolution.unknown) {
      return NextResponse.json(unknownGenresError(genreResolution.unknown), { status: 400 });
    }
    // Repeatable artist slugs or ids (#709), matched through the credit tables.
    const artistResolution = await resolveArtistFilter(searchParams.getAll("artist"));
    if (artistResolution.unknown) {
      return NextResponse.json(unknownArtistsError(artistResolution.unknown), { status: 400 });
    }

    const response = await albumApiService.searchAlbums({
      q,
      limit: limit.data,
      offset: offset.data,
      friendId,
      sort,
      missingLibraryIdentifier: missingLibraryIdentifier || undefined,
      missingLocalCoverArtUrl: missingLocalCoverArtUrl || undefined,
      missingAudio: missingAudio || undefined,
      genreFilter: genreResolution.filter,
      artistIds: artistResolution.ids,
    });
    const addedGenres = genreResolution.added ?? [];
    const { albums: credited } = await withArtistCredits(
      response.hits as { release_id: string; friend_id: number }[],
      [],
    );
    return NextResponse.json(
      albumSearchResponseSchema.parse({
        ...response,
        hits: credited.map(toWireRow),
        ...(addedGenres.length > 0 ? { added_genres: addedGenres } : {}),
        ...(artistResolution.ids !== undefined ? { filter_artists: artistResolution.artists } : {}),
      }),
    );
  } catch (error) {
    console.error("Error searching albums:", error);
    return NextResponse.json(
      {
        error: "Failed to search albums",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    // The taxonomy fields keep their own resolver, which also accepts the legacy
    // `genres`/`styles` name lists; the scalar fields are checked against the
    // shared schema, whose `error` strings are the 400 messages.
    const overrides = await resolveAlbumOverrides(body);
    const fields = albumUpdateFieldsSchema.safeParse(body);
    if (!fields.success) {
      return NextResponse.json(
        { error: fields.error.issues[0].message, details: fields.error.flatten() },
        { status: 400 },
      );
    }
    const {
      release_id,
      friend_id,
      album_rating,
      album_notes,
      purchase_price,
      condition,
      library_identifier,
    } = fields.data;

    if (
      album_rating === undefined &&
      album_notes === undefined &&
      purchase_price === undefined &&
      condition === undefined &&
      library_identifier === undefined &&
      overrides.genre_override_ids === undefined &&
      overrides.style_override_ids === undefined
    ) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updatedAlbum = await withDbTransaction(async (client) => {
      return albumRepository.updateAlbumFields(client, {
        ...overrides,
        release_id,
        friend_id,
        album_rating,
        album_notes,
        purchase_price,
        condition,
        library_identifier,
      });
    });

    if (!updatedAlbum) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    if (overrides.genre_override_ids !== undefined || overrides.style_override_ids !== undefined) {
      triggerGenreSimilarityRefresh();
      await syncIdentityEmbeddings(
        await albumRepository.getTracksByReleaseAndFriend(release_id, friend_id),
      );
    }

    let updatedTracksCount = 0;
    if (library_identifier !== undefined) {
      try {
        const tracksResult = await albumRepository.getTracksForAlbumWithLibraryIdentifier(
          release_id,
          friend_id,
        );
        updatedTracksCount = tracksResult.length;
      } catch (tracksError) {
        console.error("Error fetching tracks for updated album:", tracksError);
      }
    }

    return NextResponse.json({
      success: true,
      album: updatedAlbum,
      tracksUpdated: updatedTracksCount,
    });
  } catch (error) {
    if (error instanceof AlbumOverrideError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error updating album:", error);

    if (
      error instanceof Error &&
      error.message.includes("idx_albums_unique_friend_library_identifier")
    ) {
      return NextResponse.json(
        {
          error: "Duplicate library identifier",
          message:
            "This library identifier is already in use for another album in your collection.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update album",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
