/** A spelling key, not an identity decision or collaboration splitter. */
export function normaliseArtistName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\(\d+\)/g, " ")
      // Discogs also inverts The mid-credit: "Heptones, The / Jackie Mittoo".
      .replace(/,\s*the\b/g, "")
      .replace(/^\s*the\s+/u, "")
      .replace(/&/g, " and ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
