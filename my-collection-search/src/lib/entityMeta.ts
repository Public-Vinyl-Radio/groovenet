import { formatSeconds } from "@/lib/trackUtils";

const join = (parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(" · ") || undefined;

/** The album page's header meta: "LP-322 · 11 tracks · 1:03:43". */
export function albumMeta({
  identifier,
  trackCount,
  totalSeconds,
}: {
  identifier?: string | null;
  trackCount: number;
  totalSeconds: number;
}): string | undefined {
  return join([
    identifier,
    trackCount > 0 && `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`,
    totalSeconds > 0 && formatSeconds(totalSeconds),
  ]);
}
