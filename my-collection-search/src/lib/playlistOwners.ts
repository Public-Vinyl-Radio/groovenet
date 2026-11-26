import type { Playlist } from "@/types/track";

/** "all", "mine", or another profile's id (#1284). */
export type PlaylistOwnerFilter = string;

type Profile = { id: string; name: string };

/**
 * The playlist list's owner filter: All, Mine, then each other profile by
 * name. Empty for a single-profile household, which never sees owners.
 */
export function ownerFilterOptions(
  users: readonly Profile[],
  currentId: string | null | undefined,
): Array<{ value: PlaylistOwnerFilter; label: string }> {
  if (users.length < 2) return [];
  return [
    { value: "all", label: "All" },
    ...(currentId ? [{ value: "mine", label: "Mine" }] : []),
    ...users.filter((u) => u.id !== currentId).map((u) => ({ value: u.id, label: u.name })),
  ];
}

export function filterPlaylistsByOwner<T extends Pick<Playlist, "owner_id">>(
  playlists: readonly T[],
  filter: PlaylistOwnerFilter,
  currentId: string | null | undefined,
): T[] {
  if (filter === "all") return [...playlists];
  const ownerId = filter === "mine" ? currentId : filter;
  return playlists.filter((p) => p.owner_id === ownerId);
}

/**
 * What a playlist's owner tag says, or null: someone else's household
 * playlist names its owner, and a private one (only ever the viewer's own)
 * says so. The viewer's own household playlists carry nothing, and neither
 * does anything in a single-profile household.
 */
export function playlistOwnerLabel(
  playlist: Pick<Playlist, "owner_id" | "owner_name" | "visibility">,
  currentId: string | null | undefined,
  profileCount: number,
): { kind: "owner" | "private"; label: string } | null {
  if (profileCount < 2) return null;
  if (playlist.visibility === "private") return { kind: "private", label: "Private" };
  if (playlist.owner_id && playlist.owner_id !== currentId && playlist.owner_name) {
    return { kind: "owner", label: playlist.owner_name };
  }
  return null;
}
