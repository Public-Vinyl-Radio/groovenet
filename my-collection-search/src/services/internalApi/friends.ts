import { z } from "zod";
import {
  friendMutationResponseSchema,
  friendsListQuerySchema,
  friendsListResponseSchema,
} from "@/api-contract/schemas";
import type { Friend } from "@/types/track";
import { http, streamLines } from "../http";

export type FriendsListQuery = z.input<typeof friendsListQuerySchema>;
export type FriendsListResponse = z.infer<typeof friendsListResponseSchema>;
export type FriendMutationResponse = z.infer<typeof friendMutationResponseSchema>;
export type RemoveFriendResponse = {
  lines: string[];
  message: string;
};

export async function removeFriendStream(username: string, onLine: (line: string) => void) {
  const url = `/api/friends?username=${encodeURIComponent(username)}`;
  await streamLines(url, { method: "DELETE" }, onLine);
}

export async function addFriendApi(username: string): Promise<FriendMutationResponse> {
  return await http<FriendMutationResponse>("/api/friends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export async function removeFriendApi(username: string): Promise<RemoveFriendResponse> {
  const lines: string[] = [];
  await removeFriendStream(username, (line) => {
    lines.push(line);
  });
  return { lines, message: lines.join("\n") };
}

export async function fetchFriends(
  showCurrentUser?: FriendsListQuery["showCurrentUser"],
): Promise<Friend[]> {
  const params = new URLSearchParams();
  if (typeof showCurrentUser !== "undefined") {
    params.set(
      "showCurrentUser",
      typeof showCurrentUser === "boolean" ? String(showCurrentUser) : showCurrentUser,
    );
  }
  const query = params.toString();
  const path = query ? `/api/friends?${query}` : "/api/friends";
  const response = await http<FriendsListResponse>(path, {
    method: "GET",
    cache: "no-store",
  });
  return response.results ?? [];
}
