// Plain JS so the slug migration can share it with the app (#1079).

const TRANSLITERATIONS = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ð: "d", ł: "l", þ: "th" };

/** `The Strokes` -> `the-strokes`: lower-case ASCII, accents folded, punctuation dropped. Empty when nothing is left. */
export function slugifyArtistName(name) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßæœøđðłþ]/g, (c) => TRANSLITERATIONS[c])
    .replace(/\(\d+\)/g, " ")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/**
 * The first free slug for an artist, deterministically: the name, then the
 * name with the Discogs id, then the name with a counter. A name that slugs
 * to nothing starts from `artist`. `isTaken` may be async.
 */
export async function chooseArtistSlug(name, discogsId, isTaken) {
  const base = slugifyArtistName(name) || "artist";
  const candidates = [base];
  if (discogsId) candidates.push(`${base}-${discogsId}`);
  for (const candidate of candidates) if (!(await isTaken(candidate))) return candidate;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
}
