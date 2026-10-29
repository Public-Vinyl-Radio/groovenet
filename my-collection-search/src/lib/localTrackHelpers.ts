import { v4 as uuidv4 } from "uuid";

export function generateLocalReleaseId(): string {
  return `local-${uuidv4()}`;
}

export function generateLocalTrackId(): string {
  return `local-${uuidv4()}`;
}

export function isLocalTrack(trackId: string): boolean {
  return trackId.startsWith("local-");
}

export function isLocalAlbum(releaseId: string): boolean {
  return releaseId.startsWith("local-");
}
