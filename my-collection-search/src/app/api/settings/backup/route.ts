import { NextRequest, NextResponse } from "next/server";
import { backupPolicyService } from "@/server/services/backupPolicyService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const policy = backupPolicyService.getPolicy();
    return NextResponse.json({ policy });
  } catch (error) {
    console.error("Failed to get backup policy:", error);
    return NextResponse.json({ error: "Failed to get backup policy" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const policy = backupPolicyService.updatePolicy(body);
    return NextResponse.json({
      success: true,
      message: "Backup policy updated successfully",
      policy,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("Invalid") || message.includes("cannot be empty") ? 400 : 500;

    return NextResponse.json({ error: "Failed to update backup policy", message }, { status });
  }
}
