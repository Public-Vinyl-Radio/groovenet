import { parseNowPlayingTarget, type GroovenetConfig } from "@groovenet/client";

export type NowPlayingTarget =
  { mode: "local"; socket?: string } | { mode: "remote"; playerId: string };

export const NOW_PLAYING_USAGE =
  "Usage: groovenet-now-playing [--socket PATH | --remote PLAYER_ID]";

/**
 * Flags win, then the `now_playing_target` config key, then `local`. A stored
 * value that is neither `local` nor a valid player ID is an error, not a fallback.
 */
export function resolveNowPlayingTarget(
  flags: string[],
  config: Pick<GroovenetConfig, "now_playing_target">,
): NowPlayingTarget {
  const [flag, value, ...extra] = flags;
  if (flag === "--remote" || flag === "--socket") {
    if (!value || extra.length > 0) throw new Error(NOW_PLAYING_USAGE);
    return flag === "--remote"
      ? { mode: "remote", playerId: value }
      : { mode: "local", socket: value };
  }
  if (flags.length > 0) throw new Error(NOW_PLAYING_USAGE);
  const stored = config.now_playing_target;
  if (stored === undefined) return { mode: "local" };
  const target = parseNowPlayingTarget(stored);
  if (target === undefined)
    throw new Error(
      `Invalid now_playing_target ${JSON.stringify(stored)} in the CLI config: use "local" or a player ID. Fix it with: groovenet config set now_playing_target local`,
    );
  return target === "local" ? { mode: "local" } : { mode: "remote", playerId: target };
}
