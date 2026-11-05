import { NextRequest, NextResponse } from "next/server";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import {
  backupPolicyGetResponseSchema,
  backupPolicyPutBodySchema,
  backupPolicyPutResponseSchema,
} from "@/api-contract/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const policy = backupPolicyService.getPolicy();
    return NextResponse.json(backupPolicyGetResponseSchema.parse({ policy }));
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

    const parsed = backupPolicyPutBodySchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message =
        first?.path[0] === "provider"
          ? "Invalid backup provider"
          : first?.path[0] === "retention_preset"
            ? "Invalid retention preset"
            : first?.path[0] === "schedule_cron"
              ? "schedule_cron cannot be empty"
              : "Invalid request body";
      return NextResponse.json(
        { error: "Failed to update backup policy", message },
        { status: 400 },
      );
    }
    const policy = backupPolicyService.updatePolicy(parsed.data);
    return NextResponse.json(
      backupPolicyPutResponseSchema.parse({
        success: true,
        message: "Backup policy updated successfully",
        policy,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("Invalid") || message.includes("cannot be empty") ? 400 : 500;

    return NextResponse.json({ error: "Failed to update backup policy", message }, { status });
  }
}
