// Builds the landing page's roadmap from GitHub issue labels, falling back to
// the committed src/data/roadmap.yml. Never throws: a GitHub outage must not
// fail a deploy. See "Roadmap" in site/CLAUDE.md.

export const REPO = "Public-Vinyl-Radio/groovenet";
export const TIMEOUT_MS = 5000;

export const COLUMNS = [
  { id: "now", label: "Now" },
  { id: "next", label: "Next" },
  { id: "later", label: "Later" },
];

/** Reads `key: value` lines from the issue's `<!-- roadmap ... -->` block, or null. */
export function parseMarker(body) {
  const block = /<!--\s*roadmap\b([\s\S]*?)-->/.exec(body ?? "");
  if (!block) return null;
  const fields = {};
  for (const line of block[1].split("\n")) {
    const m = /^\s*([a-z][\w-]*)\s*:\s*(.*?)\s*$/i.exec(line);
    if (m) fields[m[1].toLowerCase()] = m[2];
  }
  return fields.title ? fields : null;
}

/** One issue -> a roadmap item, warning when the marker is missing or unusable. */
export function toItem(issue, warn = console.warn) {
  const fields = parseMarker(issue.body);
  if (!fields) {
    warn(`[roadmap] #${issue.number} has no usable <!-- roadmap --> marker (needs a title:); skipping`);
    return null;
  }
  return {
    title: fields.title,
    note: fields.note ?? "",
    url: issue.html_url,
  };
}

// Milestone first (due date, then number), then oldest first.
function compareIssues(a, b) {
  const ma = a.milestone;
  const mb = b.milestone;
  if (ma || mb) {
    if (!ma) return 1;
    if (!mb) return -1;
    const da = ma.due_on ? Date.parse(ma.due_on) : Infinity;
    const db = mb.due_on ? Date.parse(mb.due_on) : Infinity;
    if (da !== db) return da < db ? -1 : 1;
    if (ma.number !== mb.number) return ma.number - mb.number;
  }
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

async function fetchColumn(id, { fetch, token, signal }) {
  const url = `https://api.github.com/repos/${REPO}/issues?labels=roadmap:${id}&state=open&per_page=100`;
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for roadmap:${id}`);
  const issues = await res.json();
  if (!Array.isArray(issues)) throw new Error(`unexpected response for roadmap:${id}`);
  return issues;
}

/**
 * Columns from GitHub, in Now/Next/Later order, empty columns dropped.
 * Throws on any failure; an empty result is returned as [].
 */
export async function fetchRoadmap({
  fetch = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  timeoutMs = TIMEOUT_MS,
  warn = console.warn,
} = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const lists = await Promise.all(COLUMNS.map((c) => fetchColumn(c.id, { fetch, token, signal })));
  return COLUMNS.map((c, i) => ({
    ...c,
    items: lists[i]
      .filter((issue) => !issue.pull_request)
      .sort(compareIssues)
      .map((issue) => toItem(issue, warn))
      .filter(Boolean),
  })).filter((c) => c.items.length > 0);
}

/** Reasons are logged, so a timeout reads as one rather than "aborted". */
function describe(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "request timed out";
  return err instanceof Error ? err.message : String(err);
}

/** GitHub's roadmap, or `fallback()` (logging why) when it fails or is empty. */
export async function loadRoadmap(fallback, options = {}) {
  const log = options.log ?? console.log;
  try {
    const columns = await fetchRoadmap(options);
    if (columns.length > 0) {
      log(`[roadmap] ${columns.reduce((n, c) => n + c.items.length, 0)} items from GitHub labels`);
      return columns;
    }
    log("[roadmap] no usable roadmap items found; using src/data/roadmap.yml");
  } catch (err) {
    log(`[roadmap] GitHub fetch failed (${describe(err)}); using src/data/roadmap.yml`);
  }
  return fallback();
}
