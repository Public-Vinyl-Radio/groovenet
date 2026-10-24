import { proxyPlayer } from "@/server/player/proxy";
export async function GET(request: Request) { return proxyPlayer(request, "engines"); }
