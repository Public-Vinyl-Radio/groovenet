/** The A to Z index (#709): every letter, then `#` for sort names that start with anything else. */
export const INDEX_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

/** "1,517 artists", "1 artist". */
export function artistCountLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "artist" : "artists"}`;
}

/** A URL letter the index knows, upper-cased; anything else means "all". */
export function indexLetterFromParam(value: string | null): string | undefined {
  const letter = value?.trim().toUpperCase();
  return letter && INDEX_LETTERS.includes(letter) ? letter : undefined;
}

const ACCENTS_FROM = "ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇçÝý";
const ACCENTS_TO = "AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCcYy";

/**
 * The index letter a sort name files under (#1116): the same rule as the API's
 * `?letter=` (leading space trimmed, the common Latin accents folded, anything
 * else under `#`), so the grouped list agrees with the letter counts.
 */
export function indexLetterOf(sortName: string): string {
  const first = sortName.trimStart().charAt(0);
  if (!first) return "#";
  const at = ACCENTS_FROM.indexOf(first);
  const folded = (at === -1 ? first : ACCENTS_TO.charAt(at)).toUpperCase();
  return /^[A-Z]$/.test(folded) ? folded : "#";
}

/** Group items by the index letter of their sort name; letters in index order, `#` last. */
export function groupByIndexLetter<T extends { sort_name: string }>(
  items: T[],
): { letter: string; items: T[] }[] {
  const byLetter = new Map<string, T[]>();
  for (const item of items) {
    const letter = indexLetterOf(item.sort_name);
    const bucket = byLetter.get(letter);
    if (bucket) bucket.push(item);
    else byLetter.set(letter, [item]);
  }
  return INDEX_LETTERS.filter((letter) => byLetter.has(letter)).map((letter) => ({
    letter,
    items: byLetter.get(letter)!,
  }));
}

/** The letter in a URL hash (`#B`, `#%23`), or undefined when it isn't an index letter. */
export function indexLetterFromHash(hash: string): string | undefined {
  let value = hash.replace(/^#/, "");
  try {
    value = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  return indexLetterFromParam(value);
}
