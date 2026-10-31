import type { HomeQuery, HomeResponse } from "@groovenet/contracts";
import { http } from "@/services/http";
export type { HomeQuery, HomeResponse };
export async function getHome(params: HomeQuery): Promise<HomeResponse> {
  const query = new URLSearchParams({ friend_id: String(params.friend_id) });
  return http<HomeResponse>(`/api/home?${query}`, { method: "GET", cache: "no-store" });
}
