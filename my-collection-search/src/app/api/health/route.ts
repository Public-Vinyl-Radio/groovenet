import { NextResponse } from "next/server";
import type { HealthResponse } from "@groovenet/contracts";

// Lightweight liveness probe for container HEALTHCHECK / monitoring (beszel).
// Intentionally does no DB/Redis work so it stays fast and reflects only that
// the Next.js server is up and serving.
export async function GET() {
  const body: HealthResponse = { status: "ok" };
  return NextResponse.json(body);
}
