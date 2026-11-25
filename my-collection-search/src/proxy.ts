import { NextRequest, NextResponse } from "next/server";
import { enforceApiAuth } from "@/server/auth/enforce";

/** Next 16 proxy runs in Node, so token checks use the same Postgres repository as routes. */
export async function proxy(req: NextRequest) {
  return (await enforceApiAuth(req)) ?? NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
