import { proxyNamedPlayer, type PlayerRouteContext } from "@/server/player/proxy";
export async function GET(request: Request, context: PlayerRouteContext) { return proxyNamedPlayer(request, context, "/devices"); }
