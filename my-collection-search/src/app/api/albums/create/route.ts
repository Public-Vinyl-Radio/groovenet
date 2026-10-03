import { NextRequest, NextResponse } from 'next/server';
import { withDbTransaction } from '@/lib/serverDb';
import { generateLocalReleaseId, generateLocalTrackId } from '@/lib/localTrackHelpers';
import { saveAlbumCover } from '@/lib/fileUpload';
import { AlbumToUpsert, upsertAlbum } from '@/server/services/albumUpsertService';
import { Track } from '@/types/track';
import { AlbumMetadata, TrackMetadata } from '@/types/albumMetadata';
import { albumRepository } from '@/server/repositories/albumRepository';
import { syncIdentityEmbeddings } from '@/server/services/trackEmbeddingSyncService';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Parse JSON fields
    const albumJson = formData.get('album') as string;
    const tracksJson = formData.get('tracks') as string;
    const friendIdStr = formData.get('friend_id') as string;
    const coverArtFile = formData.get('cover_art') as File | null;

    if (!albumJson || !tracksJson || !friendIdStr) {
      return NextResponse.json(
        { error: 'Missing required fields: album, tracks, friend_id' },
        { status: 400 }
      );
    }

    const album: AlbumMetadata = JSON.parse(albumJson);
    const tracks: TrackMetadata[] = JSON.parse(tracksJson);
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

    // Generate release_id
    const releaseId = generateLocalReleaseId();

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

    const { createdAlbum, createdTracks } = await withDbTransaction(async (client) => {
      // Insert album
      const now = new Date().toISOString();
      const albumToUpsert: AlbumToUpsert = {
        release_id: releaseId,
        friend_id: friendId,
        title: album.title,
        artist: album.artist,
        year: album.year,
        genres: album.genres || [],
        styles: album.styles || [],
        album_thumbnail: albumThumbnail,
        track_count: tracks.length,
        label: album.label,
        catalog_number: album.catalog_number,
        country: album.country,
        format: album.format,
        date_added: now,
        date_changed: now,
      };

      const createdAlbum = await upsertAlbum(client, albumToUpsert);

      // Insert tracks
      const createdTracks: Track[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackId = generateLocalTrackId();
        const position = track.position ?? `${i + 1}`;

        const createdTrack = await albumRepository.insertTrack(client, [
          trackId,
          friendId,
          username,
          track.title,
          track.artist,
          album.title, // Use album title
          album.year || '',
          album.styles || [],
          album.genres || [],
          track.duration_seconds
            ? `${Math.floor(track.duration_seconds / 60)}:${String(track.duration_seconds % 60).padStart(2, '0')}`
            : '0:00',
          track.duration_seconds || 0,
          position,
          '', // discogs_url empty for local tracks
          track.apple_music_url || '',
          track.youtube_url || '',
          track.soundcloud_url || '',
          albumThumbnail || '',
          track.local_tags || '',
          track.bpm || null,
          track.key || null,
          track.notes || '',
          track.star_rating || 0,
          releaseId,
          album.library_identifier || null,
        ]);

        createdTracks.push(createdTrack);
      }

      return { createdAlbum, createdTracks };
    });

    await syncIdentityEmbeddings(createdTracks);

    return NextResponse.json({
      album: createdAlbum,
      tracks: createdTracks,
    });

  } catch (error) {
    console.error('Error creating album:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create album' },
      { status: 500 }
    );
  }
}
