import { getCurrentUser } from "@/server/auth/currentUser";
import type { TrackLyrics } from "@groovenet/contracts";
import { stripNullBytes } from "@/lib/stripNullBytes";
import {
  trackLyricsRepository,
  type TrackLyricsRow,
} from "@/server/repositories/trackLyricsRepository";

/**
 * Lyrics are kept and shown for your own library only (#1171): a friend's
 * track never returns them, and cannot be given any. "Your own" is the library
 * mapped to the current household profile, the same rule Settings → Libraries uses to flag
 * the account; with it unset, no library is yours.
 */
export type LyricsAccess = "owner" | "not_owner" | "not_found";

export type LyricsResult<T> = { access: "owner"; value: T } | { access: "not_owner" | "not_found" };

function toWire(row: TrackLyricsRow): TrackLyrics {
  return {
    text: row.text,
    source: row.source,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export class TrackLyricsService {
  async access(trackId: string, friendId: number, req?: Request): Promise<LyricsAccess> {
    const library = await trackLyricsRepository.findTrackLibrary(trackId, friendId);
    if (library === null) return "not_found";
    const account = (await getCurrentUser(req))?.discogs_username;
    return account && library === account ? "owner" : "not_owner";
  }

  private async asOwner<T>(
    trackId: string,
    friendId: number,
    run: () => Promise<T>,
    req?: Request,
  ): Promise<LyricsResult<T>> {
    const access = await this.access(trackId, friendId, req);
    if (access !== "owner") return { access };
    return { access, value: await run() };
  }

  /** The track's lyrics, or `value: null` when it has none. */
  get(trackId: string, friendId: number, req?: Request): Promise<LyricsResult<TrackLyrics | null>> {
    return this.asOwner(
      trackId,
      friendId,
      async () => {
        const row = await trackLyricsRepository.find(trackId, friendId);
        return row ? toWire(row) : null;
      },
      req,
    );
  }

  save(
    trackId: string,
    friendId: number,
    text: string,
    req?: Request,
  ): Promise<LyricsResult<TrackLyrics>> {
    return this.asOwner(
      trackId,
      friendId,
      async () =>
        toWire(await trackLyricsRepository.saveUserLyrics(trackId, friendId, stripNullBytes(text))),
      req,
    );
  }

  /** Delete the row so a later tag read can fill it from the file again. */
  clear(trackId: string, friendId: number, req?: Request): Promise<LyricsResult<boolean>> {
    return this.asOwner(
      trackId,
      friendId,
      () => trackLyricsRepository.delete(trackId, friendId),
      req,
    );
  }
}

export const trackLyricsService = new TrackLyricsService();
