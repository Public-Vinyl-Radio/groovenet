import { NextResponse } from "next/server";
import {
  fingerprintUpsertBodySchema,
  fingerprintUpsertResponseSchema,
} from "@/api-contract/schemas";
import { fingerprintRepository } from "@/server/repositories/fingerprintRepository";

/**
 * Persist one reference fingerprint (#277).
 *
 * Called by `fingerprint-service` after it indexes a library track, in the same
 * direction as the download worker's callbacks: the Python side does the CPU
 * work, the app owns the database. The underlying write upserts on
 * (track_id, friend_id, fingerprint_type, fingerprint_version), so re-running an
 * index can never produce a duplicate row.
 */
export async function POST(req: Request) {
  try {
    const parsed = fingerprintUpsertBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid fingerprint", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const row = await fingerprintRepository.upsertFingerprint({
      track_id: body.track_id,
      friend_id: body.friend_id,
      fingerprint_type: body.fingerprint_type,
      fingerprint_version: body.fingerprint_version,
      fingerprint_data: body.fingerprint_data
        ? Buffer.from(body.fingerprint_data, "base64")
        : null,
      audio_sha256: body.audio_sha256,
      audio_duration_seconds: body.audio_duration_seconds ?? null,
    });

    return NextResponse.json(
      fingerprintUpsertResponseSchema.parse({
        track_id: row.track_id,
        friend_id: row.friend_id,
        fingerprint_type: row.fingerprint_type,
        fingerprint_version: row.fingerprint_version,
        audio_sha256: row.audio_sha256,
        audio_duration_seconds: row.audio_duration_seconds,
        updated_at: new Date(row.updated_at).toISOString(),
      })
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error storing fingerprint:", err);
    // A fingerprint for a track that no longer exists is a foreign key
    // violation, not a server fault — the track was deleted mid-run.
    const status = /foreign key|violates/i.test(err.message) ? 409 : 500;
    return NextResponse.json(
      { error: err.message || "Failed to store fingerprint" },
      { status }
    );
  }
}
