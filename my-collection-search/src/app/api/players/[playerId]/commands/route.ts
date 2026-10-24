import { proxyNamedPlayer, type PlayerRouteContext } from "@/server/player/proxy";
export async function POST(request: Request, context: PlayerRouteContext) { return proxyNamedPlayer(request, context, "/commands", "command"); }
