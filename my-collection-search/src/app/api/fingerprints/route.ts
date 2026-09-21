import { NextResponse } from "next/server";
import {
  fingerprintListResponseSchema,
  fingerprintUpsertBodySchema,
  fingerprintUpsertResponseSchema,
} from "@/api-contract/schemas";
import { fingerprintRepository } from "@/server/repositories/fingerprintRepository";

/**
 * The stored reference fingerprints for one engine and version (#278).
 *
 * `fingerprint-service` calls this at startup and on a refresh interval to
 * rebuild its in-memory index. It holds no database connection by design
 * (#273), so the blobs travel as base64 — JSON has no bytes — and are paged,
 * because the whole library is tens of megabytes.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fingerprintType = url.searchParams.get("fingerprint_type");
    const fingerprintVersion = url.searchParams.get("fingerprint_version");

    if (!fingerprintType || !fingerprintVersion) {
      return NextResponse.json(
        { error: "fingerprint_type and fingerprint_version are required" },
        { status: 400 }
      );
    }

    const limitParam = Number(url.searchParams.get("limit") ?? 500);
    const offsetParam = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 1000)
      : 500;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

    const friendParam = url.searchParams.get("friend_id");
    const friendId = friendParam !== null ? Number(friendParam) : undefined;

    const rows = await fingerprintRepository.listFingerprintsForIndex({
      fingerprint_type: fingerprintType,
      fingerprint_version: fingerprintVersion,
      friend_id: Number.isFinite(friendId) ? friendId : undefined,
      limit,
      offset,
    });

    return NextResponse.json(
      fingerprintListResponseSchema.parse({
        fingerprints: rows.map((row) => ({
          track_id: row.track_id,
          friend_id: row.friend_id,
          fingerprint_type: row.fingerprint_type,
          fingerprint_version: row.fingerprint_version,
          fingerprint_data: row.fingerprint_data
            ? Buffer.from(row.fingerprint_data).toString("base64")
            : null,
          audio_sha256: row.audio_sha256,
          audio_duration_seconds: row.audio_duration_seconds,
        })),
        limit,
        offset,
      })
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error listing fingerprints:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list fingerprints" },
      { status: 500 }
    );
  }
}

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
