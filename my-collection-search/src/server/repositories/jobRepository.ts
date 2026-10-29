import { dbQuery } from "@/lib/serverDb";

export type JobTrackPair = {
  trackId: string;
  friendId: number;
};

export type JobTrackRow = {
  track_id: string;
  friend_id: number;
  release_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  year: string | number | null;
  album_thumbnail: string | null;
  discogs_url: string | null;
  apple_music_url: string | null;
  youtube_url: string | null;
  soundcloud_url: string | null;
  local_audio_url: string | null;
  library_identifier: string | null;
  username: string | null;
};

export class JobRepository {
  async findTracksByTrackAndFriendPairs(pairs: JobTrackPair[]): Promise<JobTrackRow[]> {
    if (pairs.length === 0) return [];

    const values: string[] = [];
    const params: Array<string | number> = [];

    pairs.forEach((pair, idx) => {
      const paramOffset = idx * 2;
      values.push(`($${paramOffset + 1}, $${paramOffset + 2})`);
      params.push(pair.trackId, pair.friendId);
    });

    const result = await dbQuery<JobTrackRow>(
      `
        SELECT track_id, friend_id, release_id, title, artist, album, year, album_thumbnail,
               discogs_url, apple_music_url, youtube_url, soundcloud_url,
               local_audio_url, library_identifier, username
        FROM tracks
        WHERE (track_id, friend_id) IN (${values.join(", ")})
      `,
      params,
    );

    return result.rows;
  }
}

export const jobRepository = new JobRepository();
