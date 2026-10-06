/**
 * Get the manifest file path for a given username.
 * For the current user (DISCOGS_USERNAME), returns manifest.json
 * For other users (friends), returns manifest_${username}.json
 */
export function getManifestPath(username: string): string {
  const currentUser = process.env.DISCOGS_USERNAME;
  if (currentUser && username === currentUser) {
    const p = path.join(DISCOGS_EXPORTS_DIR, "manifest.json");
    assertWithinExportsDir(p);
    return p;
  }
  const p = path.join(DISCOGS_EXPORTS_DIR, `manifest_${path.basename(safePart(username))}.json`);
  assertWithinExportsDir(p);
  return p;
}
/**
 * Get all release IDs for a given username from their manifest file.
 * Returns an empty array if the manifest does not exist or is invalid.
 */
export function getManifestReleaseIds(username: string): string[] {
  const manifestPath = getManifestPath(username);
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return Array.isArray(manifest.releaseIds)
      ? manifest.releaseIds.map((id: unknown) => String(id))
      : [];
  } catch {
    return [];
  }
}
import fs from "fs";
import path from "path";
import { DiscogsRelease, DiscogsTrack, ProcessedTrack } from "@/types/track";
import { parseDurationToSeconds } from "@/lib/trackUtils";

export const DISCOGS_EXPORTS_DIR = path.resolve(
  process.cwd(),
  "discogs_exports"
);

/** Strip any characters that could escape the exports directory */
function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Throw if the resolved path escapes the exports directory */
function assertWithinExportsDir(filePath: string): void {
  const resolved = path.resolve(filePath);
  const base = DISCOGS_EXPORTS_DIR + path.sep;
  if (!resolved.startsWith(base) && resolved !== DISCOGS_EXPORTS_DIR) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
}

export function getManifestFiles(): string[] {
  if (!fs.existsSync(DISCOGS_EXPORTS_DIR)) return [];
  return fs
    .readdirSync(DISCOGS_EXPORTS_DIR)
    .filter((f) => /^manifest(_.*)?\.json$/.test(f));
}

export function createExportsDir() {
  if (!fs.existsSync(DISCOGS_EXPORTS_DIR)) {
    fs.mkdirSync(DISCOGS_EXPORTS_DIR);
  }
}

export function getReleasePath(
  username: string,
  releaseId: string
): string | null {
  const safeUsername = path.basename(safePart(username));
  const safeReleaseId = path.basename(safePart(releaseId));
  // For friends, prioritize their specific release file
  if (
    username &&
    process.env.DISCOGS_USERNAME &&
    username !== process.env.DISCOGS_USERNAME
  ) {
    const friendPath = path.join(
      DISCOGS_EXPORTS_DIR,
      `${safeUsername}_release_${safeReleaseId}.json`
    );
    assertWithinExportsDir(friendPath);
    if (fs.existsSync(friendPath)) {
      return friendPath;
    }
  }

  // Fall back to current user's release file
  const currentUserPath = path.join(
    DISCOGS_EXPORTS_DIR,
    `release_${safeReleaseId}.json`
  );
  assertWithinExportsDir(currentUserPath);
  if (fs.existsSync(currentUserPath)) {
    return currentUserPath;
  }

  return null;
}

export function getReleaseWritePath(
  username: string,
  releaseId: string
): string {
  const safeUsername = path.basename(safePart(username));
  const safeReleaseId = path.basename(safePart(releaseId));
  // For writing new releases, determine the path based on username
  if (
    username &&
    process.env.DISCOGS_USERNAME &&
    username !== process.env.DISCOGS_USERNAME
  ) {
    const p = path.join(
      DISCOGS_EXPORTS_DIR,
      `${safeUsername}_release_${safeReleaseId}.json`
    );
    assertWithinExportsDir(p);
    return p;
  } else {
    const p = path.join(DISCOGS_EXPORTS_DIR, `release_${safeReleaseId}.json`);
    assertWithinExportsDir(p);
    return p;
  }
}

export function loadAlbum(releasePath: string): DiscogsRelease | null {
  try {
    return JSON.parse(fs.readFileSync(releasePath, "utf-8"));
  } catch {
    return null;
  }
}

export function saveManifest(
  manifestPath: string,
  releaseIds: string[],
  deletedReleaseIds?: string[]
) {
  // Read existing manifest to preserve deletedReleaseIds if not provided
  let existingDeletedIds: string[] = [];
  if (!deletedReleaseIds && fs.existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      existingDeletedIds = existing.deletedReleaseIds || [];
    } catch {
      // ignore parse errors
    }
  }

  const manifest = {
    releaseIds: Array.from(new Set(releaseIds)),
    deletedReleaseIds: deletedReleaseIds
      ? Array.from(new Set(deletedReleaseIds))
      : existingDeletedIds,
    lastSynced: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function deleteRelease(username: string, releaseId: string): boolean {
  const releasePath = getReleasePath(username, releaseId);
  if (releasePath && fs.existsSync(releasePath)) {
    fs.unlinkSync(releasePath);
    return true;
  }
  return false;
}

function stripDiscogsNumbering(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

export function extractTracksFromAlbum(
  album: DiscogsRelease,
  username: string
): DiscogsTrack[] {
  const artist_name = stripDiscogsNumbering(
    album.artists_sort || album.artists?.[0]?.name || "Unknown Artist"
  );
  return album.tracklist.map((tr: ProcessedTrack) => {
    const track_id = `${album.id}-${tr.position}`
      .trim()
      .replace(/[^A-Za-z0-9\-_]/g, "");
    return {
      track_id,
      release_id: album.id.toString(), // Add release_id for album linking
      title: tr.title,
      artist: tr.artists?.map((a) => stripDiscogsNumbering(a.name)).join(", ") || artist_name,
      album: album.title,
      year: album.year ?? null,
      styles: album.styles || [],
      genres: album.genres || [],
      duration: tr.duration,
  discogs_url: album.uri ?? "",
  album_thumbnail: album.thumb ?? "",
      position: tr.position,
      duration_seconds:
        typeof tr.duration_seconds === "number"
          ? tr.duration_seconds
          : parseDurationToSeconds(tr.duration),
      bpm: null,
      key: null,
      notes: null,
      local_tags: null,
      apple_music_url: tr.apple_music_url || null,
      youtube_url: tr.youtube_url || null,
      soundcloud_url: tr.soundcloud_url || null,
      local_audio_url: tr.local_audio_url || null,
      username,
      date_added: album.date_added || null, // Add date_added from album
    };
  });
}

export function parseManifestFile(manifestFile: string) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(DISCOGS_EXPORTS_DIR, manifestFile), "utf-8")
  );

  // If manifest has username field, use that
  if (manifest.username) {
    return { manifest, username: manifest.username };
  }

  // For manifest.json (current user), use DISCOGS_USERNAME or extract from filename
  if (manifestFile === "manifest.json") {
    const username = process.env.DISCOGS_USERNAME || "current_user";
    return { manifest, username };
  }

  // For manifest_username.json format, extract username from filename
  const username = manifestFile.replace(/^manifest_|\.json$/g, "");
  return { manifest, username };
}

export function getAllTracksFromManifests(): DiscogsTrack[] {
  const manifestFiles = getManifestFiles();
  const allTracks: DiscogsTrack[] = [];
  for (const manifestFile of manifestFiles) {
    const { manifest, username } = parseManifestFile(manifestFile);
    const releaseIds: string[] = (manifest.releaseIds || []).map((id: unknown) => String(id));
    for (const releaseId of releaseIds) {
      const releasePath = getReleasePath(username, releaseId);
      if (!releasePath) continue;
      const album = loadAlbum(releasePath);
      if (!album) continue;
      allTracks.push(...extractTracksFromAlbum(album, username));
    }
  }
  return allTracks;
}

export function getTracksFromManifestReleases(
  username: string,
  releaseIds: string[]
): DiscogsTrack[] {
  const tracks: DiscogsTrack[] = [];
  for (const releaseId of releaseIds) {
    const releasePath = getReleasePath(username, String(releaseId));
    if (!releasePath) continue;
    const album = loadAlbum(releasePath);
    if (!album) continue;
    tracks.push(...extractTracksFromAlbum(album, username));
  }
  return tracks;
}
