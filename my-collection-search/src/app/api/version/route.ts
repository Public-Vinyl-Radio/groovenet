import { execSync } from "node:child_process";
import { NextResponse } from "next/server";

import pkg from "../../../../package.json";

// In local dev there's no baked-in GIT_SHA, so read the current commit from git
// as a fallback. Never runs in production (no .git in the image).
function localGitSha(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  try {
    return (
      execSync("git rev-parse --short HEAD", {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

// Build/version metadata for the About page.
//
// Sources (all optional; sensible fallbacks for local dev):
//   - APP_VERSION / IMAGE_TAG : release tag, passed through at runtime by compose
//   - GIT_SHA                 : commit sha, baked in at image build time
//   - BUILD_TIME              : ISO timestamp, baked in at image build time
export async function GET() {
  const version = process.env.APP_VERSION || process.env.IMAGE_TAG || pkg.version || "unknown";

  return NextResponse.json({
    version,
    gitSha: process.env.GIT_SHA ?? localGitSha(),
    builtAt: process.env.BUILD_TIME ?? null,
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
}
