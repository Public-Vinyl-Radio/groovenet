// A one-line reading of the Discogs sync stream (`GET /api/discogs`) for the
// row being synced: "Reading collection · 240 found", "Fetching 12 of 340".
// The stream is plain progress text; these are the lines it always writes.

const FOUND = /^Found release ID: /;
const TO_FETCH = /^New IDs to fetch: (\d+)/;
const FETCHED = /^(Saved release ID:|Error for release ID )/;
const INGESTING = /^--- Starting Auto-Ingest ---/;

export function librarySyncProgress(lines: string[], error: string | null): string {
  if (error) return "Sync failed";
  let found = 0;
  let toFetch: number | null = null;
  let fetched = 0;
  let ingesting = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (FOUND.test(line)) found += 1;
    else if (FETCHED.test(line)) fetched += 1;
    else if (INGESTING.test(line)) ingesting = true;
    else {
      const match = TO_FETCH.exec(line);
      if (match) toFetch = Number(match[1]);
    }
  }
  if (ingesting) return "Saving to library";
  if (toFetch !== null && toFetch > 0)
    return `Fetching ${Math.min(fetched, toFetch)} of ${toFetch}`;
  if (found > 0) return `Reading collection · ${found.toLocaleString()} found`;
  return "Starting sync";
}
