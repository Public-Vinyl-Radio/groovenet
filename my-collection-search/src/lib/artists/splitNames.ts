import { artistNames } from "./importCredits";

/** Suggest a split without changing imported credits. Keep '& The' band names together. */
export function splitArtistNames(value: string) {
  const parts = value.split(
    /(\b(?:featuring|feat\.?|ft\.?|with)\s+|\s+vs\.?\s+|\s+\/\s+|\s+x\s+|\s+&\s+(?!the\b)|,(?!\s*the\b))/i,
  );
  let featured = false;
  const result: {
    name: string;
    sort_name: string;
    credited_as: string;
    role: "primary" | "featured";
    position: number;
  }[] = [];
  for (const part of parts) {
    if (/^\s*(?:featuring|feat\.?|ft\.?|with)\s+$/i.test(part)) {
      featured = true;
      continue;
    }
    if (/^\s*(?:vs\.?|\/|x|&|,)\s*$/i.test(part)) continue;
    const credited_as = part.trim();
    if (!credited_as) continue;
    const names = artistNames(credited_as);
    const words = names.name.split(/\s+/);
    const sort_name =
      names.sort_name === names.name && words.length > 1
        ? `${words.at(-1)}, ${words.slice(0, -1).join(" ")}`
        : names.sort_name;
    result.push({
      ...names,
      sort_name,
      credited_as,
      role: featured ? "featured" : "primary",
      position: result.length,
    });
  }
  return result;
}
