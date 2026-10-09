import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp, { type OutputInfo } from "sharp";

import {
  albumRepository,
  type AlbumArtMatchStatus,
  type AlbumArtSource,
  type AlbumArtworkRow,
} from "@/server/repositories/albumRepository";
import { trackAudioMetadataService } from "@/server/services/trackAudioMetadataService";
import { saveAlbumCover } from "@/lib/fileUpload";
import {
  ARTWORK_MATCH_MAX_DISTANCE,
  hammingDistance,
  perceptualHash,
} from "@/lib/imageHash";

/**
 * Album artwork: choosing between Discogs, Apple Music (art embedded in the
 * downloaded audio) and an upload, previewing before committing, restoring
 * Discogs art, and the bulk matcher that only applies Apple Music art when it
 * is recognisably the same cover (#494).
 *
 * Whatever is chosen is cached under public/uploads/album-covers and becomes
 * `audio_file_album_art_url` on the album and its tracks — the field every
 * view already prefers over `album_thumbnail` — so no reader has to change.
 */

const PUBLIC_PREFIX = "/uploads/album-covers/";
const REMOTE_TIMEOUT_MS = 15_000;
const MAX_REMOTE_BYTES = 15 * 1024 * 1024;

export class AlbumArtworkError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AlbumArtworkError";
  }
}

export type AlbumArtworkState = {
  release_id: string;
  friend_id: number;
  current_url: string | null;
  source: AlbumArtSource | null;
  discogs_art_url: string | null;
  apple_music_art_url: string | null;
  art_match_status: AlbumArtMatchStatus | null;
  art_match_distance: number | null;
  has_local_audio: boolean;
};

export type AppleMusicArtPreview = {
  url: string;
  width: number;
  height: number;
  track_id: string;
};

export type AlbumArtMatchResult = {
  release_id: string;
  friend_id: number;
  status: AlbumArtMatchStatus;
  distance: number | null;
  applied: boolean;
  apple_music_art_url: string | null;
};

export type AlbumArtworkReviewItem = {
  release_id: string;
  friend_id: number;
  title: string;
  artist: string;
  current_url: string | null;
  discogs_art_url: string | null;
  apple_music_art_url: string | null;
  art_match_status: AlbumArtMatchStatus;
  art_match_distance: number | null;
};

type CachedCover = { url: string; width: number; height: number; image: Buffer };

function coversDir(): string {
  return path.join(process.cwd(), "public", "uploads", "album-covers");
}

function remoteUrl(value: string | null | undefined): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class AlbumArtworkService {
  async getState(releaseId: string, friendId: number): Promise<AlbumArtworkState> {
    const album = await this.requireAlbum(releaseId, friendId);
    const tracks = await albumRepository.getTracksForReleaseWithAudio(friendId, releaseId);
    return this.toState(album, tracks.length > 0);
  }

  /** Albums the bulk matcher flagged for a person to decide. */
  async listReview(friendId: number | null, limit: number): Promise<AlbumArtworkReviewItem[]> {
    const rows = await albumRepository.listArtworkReview(friendId, limit);
    return rows.map((album) => ({
      release_id: album.release_id,
      friend_id: album.friend_id,
      title: album.title,
      artist: album.artist,
      current_url: album.audio_file_album_art_url || album.album_thumbnail || null,
      discogs_art_url: this.discogsReference(album),
      apple_music_art_url: album.apple_music_art_url,
      // The repository only returns flagged albums.
      art_match_status: album.art_match_status as AlbumArtMatchStatus,
      art_match_distance: album.art_match_distance,
    }));
  }

  /**
   * Extracts the embedded cover from the album's downloaded audio and caches
   * it, without changing what the album displays.
   */
  async previewAppleMusicArt(
    releaseId: string,
    friendId: number
  ): Promise<AppleMusicArtPreview> {
    await this.requireAlbum(releaseId, friendId);
    const { cover, trackId } = await this.extractAppleMusicCover(releaseId, friendId);
    return { url: cover.url, width: cover.width, height: cover.height, track_id: trackId };
  }

  async apply(
    releaseId: string,
    friendId: number,
    source: "apple_music" | "discogs"
  ): Promise<AlbumArtworkState> {
    const album = await this.requireAlbum(releaseId, friendId);

    if (source === "apple_music") {
      // Use exactly the cover that was previewed, unless its file has gone.
      const previewed = album.apple_music_art_url;
      const url =
        previewed && (await this.localCoverExists(previewed))
          ? previewed
          : (await this.extractAppleMusicCover(releaseId, friendId)).cover.url;
      await albumRepository.setAlbumDisplayArt(releaseId, friendId, url, "apple_music");
    } else {
      const discogsUrl = this.discogsReference(album);
      if (!discogsUrl) {
        throw new AlbumArtworkError("This album has no Discogs artwork to restore", 404);
      }
      const cover = await this.cacheCover(await this.loadImage(discogsUrl), "discogs", album);
      await albumRepository.setAlbumDisplayArt(releaseId, friendId, cover.url, "discogs");
    }

    return this.getState(releaseId, friendId);
  }

  async upload(releaseId: string, friendId: number, file: File): Promise<AlbumArtworkState> {
    await this.requireAlbum(releaseId, friendId);
    let url: string;
    try {
      url = await saveAlbumCover(file);
    } catch (error) {
      throw new AlbumArtworkError(
        error instanceof Error ? error.message : "Failed to save cover art",
        400
      );
    }
    await albumRepository.setAlbumDisplayArt(releaseId, friendId, url, "upload");
    return this.getState(releaseId, friendId);
  }

  /** Records an already-saved upload (from the album add/edit forms) as the displayed art. */
  async useUploadedCover(releaseId: string, friendId: number, url: string): Promise<void> {
    await albumRepository.setAlbumDisplayArt(releaseId, friendId, url, "upload");
  }

  /**
   * The bulk matcher's step for one album: extract the Apple Music cover,
   * compare it with the Discogs cover, and apply it only when the two are
   * perceptually the same image. Anything else is recorded for manual review.
   */
  async match(releaseId: string, friendId: number): Promise<AlbumArtMatchResult> {
    const album = await this.requireAlbum(releaseId, friendId);
    const result = (
      status: AlbumArtMatchStatus,
      distance: number | null,
      applied: boolean,
      appleUrl: string | null
    ): AlbumArtMatchResult => ({
      release_id: releaseId,
      friend_id: friendId,
      status,
      distance,
      applied,
      apple_music_art_url: appleUrl,
    });

    let cover: CachedCover;
    try {
      cover = (await this.extractAppleMusicCover(releaseId, friendId)).cover;
    } catch (error) {
      if (error instanceof AlbumArtworkError && error.status === 404) {
        await albumRepository.recordArtMatch(releaseId, friendId, "no_candidate", null);
        return result("no_candidate", null, false, null);
      }
      throw error;
    }

    const reference = this.discogsReference(album);
    if (!reference) {
      await albumRepository.recordArtMatch(releaseId, friendId, "no_reference", null);
      return result("no_reference", null, false, cover.url);
    }

    // A failed Discogs download throws rather than recording a verdict, so the
    // album stays a candidate and the next run tries again.
    const referenceImage = await this.loadImage(reference);
    const [candidateHash, referenceHash] = await Promise.all([
      perceptualHash(cover.image),
      perceptualHash(referenceImage),
    ]);
    const distance = hammingDistance(candidateHash, referenceHash);

    if (distance <= ARTWORK_MATCH_MAX_DISTANCE) {
      await albumRepository.setAlbumDisplayArt(releaseId, friendId, cover.url, "apple_music");
      await albumRepository.recordArtMatch(releaseId, friendId, "matched", distance);
      return result("matched", distance, true, cover.url);
    }

    await albumRepository.recordArtMatch(releaseId, friendId, "mismatch", distance);
    return result("mismatch", distance, false, cover.url);
  }

  private async requireAlbum(releaseId: string, friendId: number): Promise<AlbumArtworkRow> {
    const album = await albumRepository.getAlbumArtwork(releaseId, friendId);
    if (!album) throw new AlbumArtworkError("Album not found", 404);
    return album;
  }

  private toState(album: AlbumArtworkRow, hasLocalAudio: boolean): AlbumArtworkState {
    return {
      release_id: album.release_id,
      friend_id: album.friend_id,
      current_url: album.audio_file_album_art_url || album.album_thumbnail || null,
      source: album.album_art_source,
      discogs_art_url: this.discogsReference(album),
      apple_music_art_url: album.apple_music_art_url,
      art_match_status: album.art_match_status,
      art_match_distance: album.art_match_distance,
      has_local_audio: hasLocalAudio,
    };
  }

  private discogsReference(album: AlbumArtworkRow): string | null {
    return remoteUrl(album.discogs_art_url) ?? remoteUrl(album.album_thumbnail);
  }

  private async extractAppleMusicCover(
    releaseId: string,
    friendId: number
  ): Promise<{ cover: CachedCover; trackId: string }> {
    const tracks = await albumRepository.getTracksForReleaseWithAudio(friendId, releaseId);
    for (const track of tracks) {
      if (!track.local_audio_url) continue;
      const audioPath = trackAudioMetadataService.resolveAudioFilePath(track.local_audio_url);
      if (!audioPath) continue;
      const probe = await trackAudioMetadataService.runFfprobe(audioPath);
      const pic = trackAudioMetadataService.getAttachedPicStream(probe);
      if (pic?.index === undefined) continue;

      const image = await trackAudioMetadataService.extractAttachedPic(audioPath, pic.index);
      const cover = await this.cacheCover(image, "apple", { release_id: releaseId, friend_id: friendId });
      await albumRepository.setAppleMusicArtUrl(releaseId, friendId, cover.url);
      return { cover, trackId: track.track_id };
    }
    throw new AlbumArtworkError(
      "No downloaded track on this album has embedded cover art",
      404
    );
  }

  /**
   * Re-encodes to JPEG (which also proves the bytes are an image) and writes it
   * under a content-addressed name, so a changed cover gets a new URL and
   * browsers never show a stale cached copy.
   */
  private async cacheCover(
    image: Buffer,
    prefix: "apple" | "discogs",
    album: Pick<AlbumArtworkRow, "release_id" | "friend_id">
  ): Promise<CachedCover> {
    let encoded: { data: Buffer; info: OutputInfo };
    try {
      encoded = await sharp(image)
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new AlbumArtworkError("Artwork is not a readable image", 422);
    }

    const digest = crypto.createHash("sha256").update(encoded.data).digest("hex").slice(0, 12);
    const filename = `${prefix}_${safeName(album.release_id)}_${album.friend_id}_${digest}.jpg`;
    await fs.mkdir(coversDir(), { recursive: true });
    await fs.writeFile(path.join(coversDir(), filename), encoded.data);

    return {
      url: `${PUBLIC_PREFIX}${filename}`,
      width: encoded.info.width,
      height: encoded.info.height,
      image: encoded.data,
    };
  }

  private async localCoverExists(url: string): Promise<boolean> {
    if (!url.startsWith(PUBLIC_PREFIX)) return false;
    try {
      await fs.access(path.join(coversDir(), path.basename(url)));
      return true;
    } catch {
      return false;
    }
  }

  private async loadImage(url: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "groovenet-artwork" },
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AlbumArtworkError(
        `Could not download artwork: ${error instanceof Error ? error.message : String(error)}`,
        502
      );
    }
    if (!response.ok) {
      throw new AlbumArtworkError(`Could not download artwork: HTTP ${response.status}`, 502);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_REMOTE_BYTES) {
      throw new AlbumArtworkError("Artwork download is too large", 502);
    }
    return body;
  }
}

export const albumArtworkService = new AlbumArtworkService();
