import { loadConfig } from "@groovenet/client";

/** Which friend's tracks a command covers. */
export interface FriendScopeOptions {
  friendId?: number;
  allFriends?: boolean;
}

/**
 * `--friend-id`, else the configured `default_friend_id`, else everyone.
 * `--all-friends` always means everyone; giving both is an error.
 */
export function resolveFriendId(
  opts: FriendScopeOptions,
  defaultFriendId: number | undefined = loadConfig().default_friend_id,
): number | undefined {
  if (opts.allFriends && opts.friendId !== undefined) {
    throw new Error("Choose --friend-id or --all-friends, not both");
  }
  if (opts.allFriends) return undefined;
  return opts.friendId ?? defaultFriendId;
}
