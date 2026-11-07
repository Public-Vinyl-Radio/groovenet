import { NextResponse } from "next/server";
import { startOrphanScan } from "@/server/services/storageOrphanService";

export const dynamic = "force-dynamic";

/** Starts an orphan scan in the background (#1052); a running scan is left alone. */
export async function POST() {
  try {
    const result = startOrphanScan();
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error("[storage] POST orphans/scan error:", error);
    return NextResponse.json({ error: "Failed to start the orphan scan" }, { status: 500 });
  }
}
