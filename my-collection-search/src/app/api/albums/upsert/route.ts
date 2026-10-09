import { NextRequest, NextResponse } from 'next/server';
import { withDbTransaction } from '@/lib/serverDb';
import { generateLocalTrackId } from '@/lib/localTrackHelpers';
import { saveAlbumCover } from '@/lib/fileUpload';
import { AlbumToUpsert, upsertAlbum } from '@/server/services/albumUpsertService';
import { Track } from '@/types/track';
import { AlbumMetadata, TrackUpsertMetadata } from '@/types/albumMetadata';
import { albumRepository } from '@/server/repositories/albumRepository';
import { albumArtworkService } from '@/server/services/albumArtworkService';
import { syncIdentityEmbeddings } from '@/server/services/trackEmbeddingSyncService';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Parse JSON fields
    const releaseId = formData.get('release_id') as string;
    const albumJson = formData.get('album') as string;
    const tracksJson = formData.get('tracks') as string;
    const friendIdStr = formData.get('friend_id') as string;
    const coverArtFile = formData.get('cover_art') as File | null;

    if (!releaseId || !albumJson || !tracksJson || !friendIdStr) {
      return NextResponse.json(
        { error: 'Missing required fields: release_id, album, tracks, friend_id' },
        { status: 400 }
      );
    }

    const album: AlbumMetadata = JSON.parse(albumJson);
    const tracks: TrackUpsertMetadata[] = JSON.parse(tracksJson);
    const friendId = parseInt(friendIdStr, 10);

    // Validate required fields
    if (!album.title || !album.artist) {
      return NextResponse.json(
        { error: 'Album title and artist are required' },
        { status: 400 }
      );
    }

    if (!tracks.length) {
      return NextResponse.json(
        { error: 'At least one track is required' },
        { status: 400 }
      );
    }

    if (isNaN(friendId)) {
      return NextResponse.json(
        { error: 'Invalid friend_id' },
        { status: 400 }
      );
    }

    for (const track of tracks) {
      if (!track.title || !track.artist) {
        return NextResponse.json(
          { error: 'All tracks must have title and artist' },
          { status: 400 }
        );
      }
    }

    // Handle cover art upload if provided
    let albumThumbnail: string | undefined;
    if (coverArtFile && coverArtFile.size > 0) {
      try {
        albumThumbnail = await saveAlbumCover(coverArtFile);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to upload cover art' },
          { status: 413 }
        );
      }
    }

    const username = await albumRepository.getFriendUsernameById(friendId);
    if (!username) {
      return NextResponse.json(
        { error: 'Friend not found' },
        { status: 404 }
      );
    }

    const { updatedAlbum, upsertedTracks, tracksToDelete } = await withDbTransaction(
      async (client) => {
      // Get existing album to preserve thumbnail if no new one uploaded
      const existingAlbumThumbnail = await albumRepository.getAlbumThumbnail(
        releaseId,
        friendId
      );

      // Upsert album
      const now = new Date().toISOString();
      const albumToUpsert: AlbumToUpsert = {
        release_id: releaseId,
        friend_id: friendId,
        title: album.title,
        artist: album.artist,
        year: album.year,
        genres: album.genres || [],
        styles: album.styles || [],
        album_thumbnail: albumThumbnail || existingAlbumThumbnail || undefined,
        track_count: tracks.length,
        label: album.label,
        catalog_number: album.catalog_number,
        country: album.country,
        format: album.format,
        date_changed: now,
        album_notes: album.album_notes,
        album_rating: album.album_rating,
        purchase_price: album.purchase_price,
        condition: album.condition,
        library_identifier: album.library_identifier,
      };

      const updatedAlbum = await upsertAlbum(client, albumToUpsert);

      // Get existing track IDs for this album
      const existingTrackIds = new Set(
        await albumRepository.listTrackIdsForAlbum(releaseId, friendId)
      );

      // Track IDs that are in the update
      const updatedTrackIds = new Set(
        tracks.filter((t) => t.track_id).map((t) => t.track_id as string)
      );

      // Delete tracks that are no longer in the album
      const tracksToDelete = Array.from(existingTrackIds).filter(
        (id) => !updatedTrackIds.has(id)
      );

      if (tracksToDelete.length > 0) {
        await albumRepository.deleteTracksByIds(client, tracksToDelete, friendId);
      }

      // Upsert tracks
      const upsertedTracks: Track[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackId = track.track_id || generateLocalTrackId();
        const position = track.position ?? `${i + 1}`;

        const upsertedTrack = await albumRepository.upsertTrackByTrackIdUsername(client, [
          trackId,
          friendId,
          username,
          track.title,
          track.artist,
          album.title,
          album.year || '',
          album.styles || [],
          album.genres || [],
          track.duration_seconds ? `${Math.floor(track.duration_seconds / 60)}:${String(track.duration_seconds % 60).padStart(2, '0')}` : '0:00',
          track.duration_seconds || 0,
          position,
          '', // discogs_url empty for local tracks
          track.apple_music_url || '',
          track.youtube_url || '',
          track.soundcloud_url || '',
          albumThumbnail || existingAlbumThumbnail || '',
          track.local_tags || '',
          track.bpm || null,
          track.key || null,
          track.notes || '',
          track.star_rating || 0,
          releaseId,
          album.library_identifier || null,
        ]);

        upsertedTracks.push(upsertedTrack);
      }

      return { updatedAlbum, upsertedTracks, tracksToDelete };
      }
    );

    // Album genres/styles/label feed every track's identity embedding, so
    // refresh them now that the album and tracks are committed.
    await syncIdentityEmbeddings(upsertedTracks);

    // An upload has to become the displayed art, or an existing Apple Music
    // cover (which views prefer over album_thumbnail) would keep hiding it.
    if (albumThumbnail) {
      await albumArtworkService.useUploadedCover(releaseId, friendId, albumThumbnail);
      updatedAlbum.audio_file_album_art_url = albumThumbnail;
      updatedAlbum.album_art_source = 'upload';
      for (const track of upsertedTracks) track.audio_file_album_art_url = albumThumbnail;
    }

      return NextResponse.json({
        album: updatedAlbum,
        tracks: upsertedTracks,
        deletedTracks: tracksToDelete.length,
      });

  } catch (error) {
    console.error('Error upserting album:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update album' },
      { status: 500 }
    );
  }
}
