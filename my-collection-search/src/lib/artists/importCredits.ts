import type { DiscogsRelease } from "@groovenet/contracts";

export type ArtistRef = NonNullable<DiscogsRelease["artists"]>[number];
export type ImportArtistCredit = {
  name: string;
  sort_name: string;
  discogs_artist_id: string | null;
  is_placeholder: boolean;
  credited_as: string;
  role: "primary" | "featured";
  position: number;
  // Legacy is the review flag: no structured identity was available. Never split it.
  source: "discogs" | "legacy";
};

export function artistNames(raw: string): { name: string; sort_name: string } {
  const sort_name = raw
    .replace(/\(\d+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Each segment may be inverted, including in an unsplit legacy collaboration.
  const name = sort_name.replace(/(^|\s*\/\s*)([^/]+?),\s*The\b/g, "$1The $2");
  return { name, sort_name };
}

export function importArtistCredits(
  artists: ArtistRef[] | undefined,
  fallback: string,
): ImportArtistCredit[] {
  const refs = artists?.length ? artists : [{ name: fallback }];
  return refs.map((ref, position) => {
    const names = artistNames(ref.name || "Unknown Artist");
    const placeholder = /^(various(?: artists)?|unknown artist)$/i.test(names.name);
    return {
      ...names,
      ...(placeholder ? { name: /^various/i.test(names.name) ? "Various" : "Unknown Artist" } : {}),
      discogs_artist_id: placeholder || ref.id == null ? null : String(ref.id),
      is_placeholder: placeholder,
      credited_as: ref.name,
      role:
        position > 0 && /feat(?:uring|\.)?/i.test(refs[position - 1].join ?? "")
          ? "featured"
          : "primary",
      position,
      source: ref.id == null ? "legacy" : "discogs",
    };
  });
}
