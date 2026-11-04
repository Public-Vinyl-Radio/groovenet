/**
 * Whole-entity response validation (#595) against a real Postgres: the shared
 * `trackSchema` and `albumSchema` run over the rows each track and album route
 * returns, so driver types (numerics, timestamps, nulls) are known rather than
 * assumed. A mocked driver returns whatever the test hands it. The embedding
 * model is stubbed; the SQL is real. Run with `just embedding-versions-test`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings/config", () => ({
  getServingModel: vi.fn(async () => ({ model: MODEL, dims: 3, templateVersion: 1 })),
}));
vi.mock("@/server/services/queryEmbeddingService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/queryEmbeddingService")>()),
  embedSearchQuery: vi.fn(async () => ({ embedding: [1, 0, 0], cacheHit: false })),
  normalizeQuery: (q: string) => q.toLowerCase().trim(),
}));

import { NextRequest } from "next/server";
import { albumSchema, trackSchema } from "@groovenet/contracts";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { EmbeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { GET as searchTracks } from "../tracks/search/route";
import { GET as listAlbums } from "../albums/route";
import { GET as getAlbum } from "../albums/[releaseId]/route";
import { GET as getTrack } from "../tracks/[id]/route";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const embeddings = new EmbeddingsRepository();

const MODEL = "entity-responses-test-model";
const USERNAME = "entity-responses-friend";
const RELEASE_FULL = "entity-full";
const RELEASE_SPARSE = "entity-sparse";
let friendId = 0;

async function cleanup() {
  await dbQuery(`DELETE FROM track_embeddings WHERE model = $1`, [MODEL]);
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
  await dbQuery(
    `DELETE FROM albums WHERE friend_id IN (SELECT id FROM friends WHERE username = $1)`,
    [USERNAME],
  );
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME],
  );
  friendId = rows[0].id;

  // Every optional column set: numerics, reals, timestamps, arrays.
  await dbQuery(
    `INSERT INTO albums (release_id, friend_id, title, artist, year, genres, styles, album_thumbnail,
       discogs_url, date_added, date_changed, track_count, album_rating, album_notes, purchase_price,
       condition, label, catalog_number, country, format, library_identifier,
       audio_file_album_art_url, album_art_source, discogs_art_url, apple_music_art_url,
       art_match_status, art_match_distance, art_matched_at)
     VALUES ($1, $2, 'Entity Full', 'Entity Artist', '1999', '{Electronic}', '{House}', 'https://img/t.jpg',
       'https://discogs/r', '2024-03-04 05:06:07', '2024-03-05 06:07:08', 2, 4, 'notes', 19.99,
       'Mint', 'Label', 'CAT-1', 'US', 'Vinyl', 'ENT-1',
       '/covers/a.jpg', 'discogs', 'https://d/a.jpg', 'https://am/a.jpg',
       'matched', 3, now())`,
    [RELEASE_FULL, friendId],
  );
  // Only the NOT NULL columns; everything else stays null or defaulted.
  await dbQuery(
    `INSERT INTO albums (release_id, friend_id, title, artist) VALUES ($1, $2, 'Entity Sparse', 'Entity Artist')`,
    [RELEASE_SPARSE, friendId],
  );

  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, album, year, styles, genres,
       duration, position, duration_seconds, bpm, key, danceability, mood_happy, mood_sad, mood_relaxed,
       mood_aggressive, key_confidence, bpm_confidence, star_rating, notes, local_tags, composer,
       local_audio_url, audio_file_album_art_url, release_id, library_identifier, date_added,
       discogs_url, apple_music_url, youtube_url, spotify_url, soundcloud_url, album_thumbnail)
     VALUES ('ent-full', $1, $2, 'Entity Full', 'Entity Artist', 'Entity Full', '1999', '{House}',
       '{Electronic}', '5:30', 'A1', 330, 124.5, 'A minor', 0.8, 0.1, 0.2, 0.3, 0.4, 0.7, 0.6, 4,
       'n', 'tag', 'Composer', '/audio/f.m4a', '/covers/f.jpg', $3, 'TRK-1', '2024-03-04 05:06:07',
       'https://discogs/t', 'https://am/t', 'https://yt/t', 'https://sp/t', 'https://sc/t', 'https://img/t.jpg')`,
    [USERNAME, friendId, RELEASE_FULL],
  );
  // Only the NOT NULL columns.
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id)
     VALUES ('ent-sparse', $1, $2, 'Entity Sparse', 'Entity Artist', $3)`,
    [USERNAME, friendId, RELEASE_SPARSE],
  );

  for (const [id, vector] of [
    ["ent-full", [1, 0, 0]],
    ["ent-sparse", [0.9, 0.1, 0]],
  ] as const) {
    await embeddings.upsertTrackEmbedding({
      trackId: id,
      friendId,
      embeddingType: "context",
      model: MODEL,
      dims: 3,
      embedding: [...vector],
      sourceHash: "h",
      identityText: `context ${id}`,
      templateVersion: 1,
    });
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

const url = (path: string) => `http://localhost${path}`;

async function json(res: Response) {
  expect(res.status).toBe(200);
  return res.json();
}

describe("track and album responses validate against the shared schemas (integration)", () => {
  dbTest("lexical search hits", async () => {
    const body = await json(
      await searchTracks(
        new NextRequest(url(`/api/tracks/search?friend_id=${friendId}&q=entity&mode=lexical`)),
      ),
    );
    expect(body.hits).toHaveLength(2);
    for (const hit of body.hits) expect(trackSchema.parse(hit)).toBeTruthy();
  });

  dbTest("semantic search hits", async () => {
    const body = await json(
      await searchTracks(
        new NextRequest(url(`/api/tracks/search?friend_id=${friendId}&q=entity&mode=semantic`)),
      ),
    );
    expect(body.hits.map((h: { track_id: string }) => h.track_id)).toEqual([
      "ent-full",
      "ent-sparse",
    ]);
    for (const hit of body.hits) expect(trackSchema.parse(hit)).toBeTruthy();
  });

  dbTest("album list", async () => {
    const body = await json(
      await listAlbums(new NextRequest(url(`/api/albums?friend_id=${friendId}&q=entity`))),
    );
    expect(body.hits).toHaveLength(2);
    for (const hit of body.hits) expect(albumSchema.parse(hit)).toBeTruthy();
  });

  for (const release of [RELEASE_FULL, RELEASE_SPARSE]) {
    dbTest(`album detail for ${release}`, async () => {
      const body = await json(
        await getAlbum(new NextRequest(url(`/api/albums/${release}?friend_id=${friendId}`)), {
          params: Promise.resolve({ releaseId: release }),
        }),
      );
      expect(albumSchema.parse(body.album)).toBeTruthy();
      expect(body.tracks).toHaveLength(1);
      for (const track of body.tracks) expect(trackSchema.parse(track)).toBeTruthy();
    });
  }

  for (const id of ["ent-full", "ent-sparse"]) {
    dbTest(`track detail for ${id}`, async () => {
      const body = await json(
        await getTrack(new NextRequest(url(`/api/tracks/${id}?friend_id=${friendId}`)), {
          params: Promise.resolve({ id }),
        }),
      );
      expect(trackSchema.parse(body)).toBeTruthy();
    });
  }
});
