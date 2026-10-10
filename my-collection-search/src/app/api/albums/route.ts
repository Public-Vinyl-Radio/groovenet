// API endpoint for searching and listing albums using PostgreSQL
// Supports sorting by created_at, date_added, year, title, album_rating
// Example: /api/albums?q=jazz&sort=created_at:desc&friend_id=1&limit=20&offset=0&genre=latin
import { NextRequest, NextResponse } from "next/server";
import { albumApiService } from "@/server/services/albumApiService";
import { withDbTransaction } from "@/lib/serverDb";
import { albumRepository } from "@/server/repositories/albumRepository";
import { resolveGenreFilter, unknownGenresError } from "@/server/genres/genreFilter";

interface AlbumUpdateRequest {
  release_id: string;
  friend_id: number;
  album_rating?: number;
  album_notes?: string;
  purchase_price?: number;
  condition?: string;
  library_identifier?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
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
    const missingLocalCoverArtUrl =
      searchParams.get("missing_local_cover_art_url") === "1";
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

    const response = await albumApiService.searchAlbums({
      q,
      limit,
      offset,
      friendId,
      sort,
      missingLibraryIdentifier: missingLibraryIdentifier || undefined,
      missingLocalCoverArtUrl: missingLocalCoverArtUrl || undefined,
      missingAudio: missingAudio || undefined,
      genreFilter: genreResolution.filter,
    });
    const addedGenres = genreResolution.added ?? [];
    return NextResponse.json(
      addedGenres.length > 0 ? { ...response, added_genres: addedGenres } : response
    );
  } catch (error) {
    console.error("Error searching albums:", error);
    return NextResponse.json(
      {
        error: "Failed to search albums",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body: AlbumUpdateRequest = await request.json();
    const {
      release_id,
      friend_id,
      album_rating,
      album_notes,
      purchase_price,
      condition,
      library_identifier,
    } = body;

    if (!release_id || !friend_id) {
      return NextResponse.json(
        { error: "release_id and friend_id are required" },
        { status: 400 }
      );
    }

    if (
      album_rating === undefined &&
      album_notes === undefined &&
      purchase_price === undefined &&
      condition === undefined &&
      library_identifier === undefined
    ) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    if (library_identifier !== undefined) {
      if (library_identifier !== null && library_identifier.length > 50) {
        return NextResponse.json(
          { error: "library_identifier must be 50 characters or less" },
          { status: 400 }
        );
      }
    }

    const updatedAlbum = await withDbTransaction(async (client) => {
      return albumRepository.updateAlbumFields(client, {
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

    let updatedTracksCount = 0;
    if (library_identifier !== undefined) {
      try {
        const tracksResult = await albumRepository.getTracksForAlbumWithLibraryIdentifier(
          release_id,
          friend_id
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
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update album",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
