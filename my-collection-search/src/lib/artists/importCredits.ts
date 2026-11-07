import type { DiscogsRelease } from "@groovenet/contracts";

export type ArtistRef = NonNullable<DiscogsRelease["artists"]>[number];
export type ImportArtistCredit = {
  name: string;
  sort_name: string;
  discogs_artist_id: string | null;
  is_placeholder: boolean;
  credited_as: string;
  // Discogs `join` after this artist: `&`, `,`, `Featuring`.
  joiner: string | null;
  role: "primary" | "featured";
  position: number;
  // Legacy is the review flag: no structured identity was available. Never split it.
  source: "discogs" | "legacy";
};

/** `The Strokes` files under S: `Strokes, The`. Anything else is its own sort name. */
export function invertedSortName(name: string): string {
  // A collaboration keeps its written order; only one artist inverts cleanly.
  const match = name.includes("/") ? null : /^the\s+(\S.*)$/i.exec(name);
  return match ? `${match[1]}, ${name.slice(0, 3)}` : name;
}

export function artistNames(raw: string): { name: string; sort_name: string } {
  const cleaned = raw
    .replace(/\(\d+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Discogs `artists[].name` is the plain `The Strokes`; only the release's
  // `artists_sort` and old artist strings arrive inverted.
  const sort_name = invertedSortName(cleaned);
  // Each segment may be inverted, including in an unsplit legacy collaboration.
  const name = cleaned.replace(/(^|\s*\/\s*)([^/]+?),\s*The\b/g, "$1The $2");
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
      joiner: ref.join?.trim() || null,
      role:
        position > 0 && /feat(?:uring|\.)?/i.test(refs[position - 1].join ?? "")
          ? "featured"
          : "primary",
      position,
      source: ref.id == null ? "legacy" : "discogs",
    };
  });
}
