// How a server player's error reads in every client (#1241). The worker writes
// the whole story into `message`, so this only adds what a client can say
// better locally: which speaker, and when, in the reader's own time zone.

import type { ServerPlayerErrorState } from "@groovenet/contracts";

export type PlayerErrorView = {
  /** The worker's sentence: what happened and what to do. */
  headline: string;
  /** Speaker, times and the engine's last word; null for errors that aren't about a speaker. */
  detail: string | null;
  /** The lost speaker is listed again: a recovery hint, not a failure. */
  back: boolean;
  /** The speaker's ID when it is lost and still not back, for a "choose a speaker" action. */
  lostOutputId: string | null;
};

export type PlayerErrorFormat = { locale?: string; timeZone?: string };

function time(iso: string, format: PlayerErrorFormat): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(format.locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(format.timeZone ? { timeZone: format.timeZone } : {}),
  });
}

export function describePlayerError(
  error: ServerPlayerErrorState | null | undefined,
  format: PlayerErrorFormat = {},
): PlayerErrorView | null {
  if (!error) return null;
  const output = error.output;
  if (!output) return { headline: error.message, detail: null, back: false, lostOutputId: null };
  const lost = time(output.lost_at, format);
  const back = output.back_at ? time(output.back_at, format) : null;
  const parts = [
    output.name ?? output.id,
    lost ? `lost ${lost}` : null,
    back ? `back ${back}` : null,
    output.back_at ? null : output.detail,
    output.retried ? "retried once" : null,
  ].filter((part): part is string => Boolean(part));
  return {
    headline: error.message,
    detail: parts.join(" · "),
    back: Boolean(output.back_at),
    lostOutputId: output.back_at ? null : output.id,
  };
}
