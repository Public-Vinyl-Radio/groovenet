/**
 * A window's RMS level for display: `-23.4` → `-23 dB`, or a dash for rows
 * recorded before levels were. What a silence floor is tuned from (#282
 * follow-up), shown next to every detection.
 */
export function formatLevel(level: number | null | undefined): string {
  return level == null ? "—" : `${Math.round(level)} dB`;
}
