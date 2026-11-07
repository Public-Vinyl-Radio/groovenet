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
