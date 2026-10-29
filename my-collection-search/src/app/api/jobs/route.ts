import { NextResponse } from "next/server";
import { jobsApiService } from "@/server/services/jobsApiService";

export async function DELETE() {
  try {
    await jobsApiService.clearAllJobs();

    return NextResponse.json({
      success: true,
      message: "All queue data cleared successfully",
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error clearing queues:", err);
    return NextResponse.json({ error: err.message || "Failed to clear queues" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") || 100);
    const offsetParam = Number(searchParams.get("offset") || 0);
    const stateParam = (searchParams.get("state") || "all").toLowerCase();
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

    const state =
      stateParam === "waiting" ||
      stateParam === "active" ||
      stateParam === "completed" ||
      stateParam === "failed"
        ? stateParam
        : "all";

    const response = await jobsApiService.listJobs({
      limit,
      offset,
      state,
    });

    return NextResponse.json(response);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error fetching jobs:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch jobs" }, { status: 500 });
  }
}
