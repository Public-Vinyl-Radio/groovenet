import { proxyPlayer } from "@/server/player/proxy";
export async function GET(request: Request) {
  return proxyPlayer(request, "players");
}
export async function POST(request: Request) {
  return proxyPlayer(request, "players", "create");
}
