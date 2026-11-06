import type { JobLogsResponse } from "@groovenet/contracts";
import { NextResponse } from "next/server";
import { redisJobService } from "@/server/services/redisJobService";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }
    const logs = await redisJobService.getJobLogs(jobId);
    const body: JobLogsResponse = { logs };
    return NextResponse.json(body);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
