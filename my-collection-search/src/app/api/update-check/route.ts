import { NextResponse } from "next/server";

import pkg from "../../../../package.json";

// Checks the latest published GitHub release against the running version and
// reports whether an update is available. Read-only, no privileges — just an
// outbound call to the public GitHub API (cached for an hour).

const REPO = process.env.GITHUB_REPO || "Public-Vinyl-Radio/groovenet";
const CACHE_SECONDS = 3600;

type Semver = [number, number, number];

function parseSemver(v: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(latest: Semver, current: Semver): boolean {
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== current[i]) return latest[i] > current[i];
  }
  return false;
}

function currentVersion(): string {
  return process.env.APP_VERSION || process.env.IMAGE_TAG || pkg.version || "unknown";
}

export async function GET() {
  const current = currentVersion();
  const currentSemver = parseSemver(current);

  const base = {
    current,
    // In dev/sha/"latest" builds the running version isn't a real release, so
    // we can't meaningfully compare.
    comparable: currentSemver !== null,
    latest: null as string | null,
    updateAvailable: false,
    releaseUrl: null as string | null,
    releaseName: null as string | null,
    publishedAt: null as string | null,
    error: null as string | null,
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "groovenet-update-check",
      },
      next: { revalidate: CACHE_SECONDS },
    });

    if (res.status === 404) {
      return NextResponse.json({ ...base, error: "No published releases yet" });
    }
    if (!res.ok) {
      return NextResponse.json({
        ...base,
        error: `GitHub API returned ${res.status}`,
      });
    }

    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
    };
    const latest = data.tag_name ?? null;
    const latestSemver = latest ? parseSemver(latest) : null;

    return NextResponse.json({
      ...base,
      latest,
      releaseUrl: data.html_url ?? null,
      releaseName: data.name ?? latest,
      publishedAt: data.published_at ?? null,
      updateAvailable:
        currentSemver !== null && latestSemver !== null && isNewer(latestSemver, currentSemver),
    });
  } catch (err) {
    return NextResponse.json({
      ...base,
      error: err instanceof Error ? err.message : "update check failed",
    });
  }
}
