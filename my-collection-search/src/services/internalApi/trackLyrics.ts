import type { TrackLyrics, TrackLyricsDeleteResponse } from "@groovenet/contracts";
import { http } from "@/services/http";

export type { TrackLyrics };

/**
 * What the lyrics panel needs to know (#1171): the lyrics, that there are none
 * (an instrumental, or a file without them), or that the track is a friend's
 * and the panel should not show at all.
 */
export type TrackLyricsState =
  { kind: "lyrics"; lyrics: TrackLyrics } | { kind: "none" } | { kind: "not_owner" };

const lyricsUrl = (trackId: string, friendId: number) =>
  `/api/tracks/${encodeURIComponent(trackId)}/lyrics?friend_id=${friendId}`;

export async function fetchTrackLyrics(
  trackId: string,
  friendId: number,
): Promise<TrackLyricsState> {
  try {
    const lyrics = await http<TrackLyrics>(lyricsUrl(trackId, friendId), {
      method: "GET",
      cache: "no-store",
    });
    return { kind: "lyrics", lyrics };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return { kind: "none" };
    if (status === 403) return { kind: "not_owner" };
    throw error;
  }
}

export function saveTrackLyrics(
  trackId: string,
  friendId: number,
  text: string,
): Promise<TrackLyrics> {
  return http<TrackLyrics>(lyricsUrl(trackId, friendId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function clearTrackLyrics(
  trackId: string,
  friendId: number,
): Promise<TrackLyricsDeleteResponse> {
  return http<TrackLyricsDeleteResponse>(lyricsUrl(trackId, friendId), { method: "DELETE" });
}
