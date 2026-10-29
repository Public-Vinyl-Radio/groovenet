import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { DiscogsRelease } from "@/types/track";

const DISCOGS_EXPORTS_DIR = path.resolve(process.cwd(), "discogs_exports");

function sanitizeId(s: string) {
  return s.trim().replace(/[^A-Za-z0-9\-_]/g, "");
}

function findReleaseFile(releaseId: string, username?: string): string | null {
  const main = path.join(DISCOGS_EXPORTS_DIR, `release_${releaseId}.json`);
  if (fs.existsSync(main)) return main;

  if (username) {
    const alt = path.join(DISCOGS_EXPORTS_DIR, `${username}_release_${releaseId}.json`);
    if (fs.existsSync(alt)) return alt;
  }

  if (!fs.existsSync(DISCOGS_EXPORTS_DIR)) return null;
  const candidates = fs
    .readdirSync(DISCOGS_EXPORTS_DIR)
    .filter((f) => f.endsWith(`release_${releaseId}.json`));
  if (candidates.length) return path.join(DISCOGS_EXPORTS_DIR, candidates[0]);
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const trackIdParam = url.searchParams.get("track_id");
    const username = url.searchParams.get("username") || undefined;

    if (!trackIdParam) {
      return NextResponse.json(
        { error: "Missing required query param: track_id" },
        { status: 400 },
      );
    }

    const trackId = sanitizeId(trackIdParam);
    const dashIdx = trackId.indexOf("-");
    if (dashIdx <= 0) {
      return NextResponse.json(
        { error: "track_id format invalid. Expected '<releaseId>-<position>'" },
        { status: 400 },
      );
    }
    const releaseId = trackId.slice(0, dashIdx);

    if (!fs.existsSync(DISCOGS_EXPORTS_DIR)) {
      return NextResponse.json({ error: "discogs_exports directory not found" }, { status: 404 });
    }

    const filePath = findReleaseFile(releaseId, username);
    if (!filePath) {
      return NextResponse.json(
        { error: `Release JSON not found for id ${releaseId}` },
        { status: 404 },
      );
    }

    const release: DiscogsRelease = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const matchedTrack = (release.tracklist || []).find((tr) => {
      const composed = sanitizeId(`${release.id}-${tr.position}`);
      return composed === trackId;
    });

    return NextResponse.json({
      releaseId: String(releaseId),
      filePath,
      release,
      matchedTrack: matchedTrack || null,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
