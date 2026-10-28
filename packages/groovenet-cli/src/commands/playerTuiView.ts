/** The rows of a long list to show so the selected one is always on screen. */
export function visibleWindow(total: number, selected: number, size: number): { start: number; end: number } {
  if (total <= size) return { start: 0, end: total };
  const start = Math.min(Math.max(0, selected - size + 1), total - size);
  return { start, end: start + size };
}
