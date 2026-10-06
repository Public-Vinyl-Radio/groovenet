export function buildTrackMetadataPrompt(
  args: {
    title?: string;
    artist?: string;
    album?: string;
    year?: string | number | null;
    duration?: string | null;
    duration_seconds?: number | null;
    isrc?: string | null;
    release_id?: string | null;
    discogs_url?: string | null;
    apple_music_url?: string | null;
    youtube_url?: string | null;
    soundcloud_url?: string | null;
  },
  basePrompt: string
): string {
  const title = args.title ?? "";
  const artist = args.artist ?? "";
  const album = args.album ?? "";
  const preamble = basePrompt || "";
  const rawYear =
    args.year === null || args.year === undefined ? "" : String(args.year).trim();
  const rawDuration = args.duration ? String(args.duration).trim() : "";
  const rawDurationSeconds =
    typeof args.duration_seconds === "number" && Number.isFinite(args.duration_seconds)
      ? String(Math.round(args.duration_seconds))
      : "";
  const versionMarkers = [title, album]
    .filter(Boolean)
    .join(" ")
    .match(/\(([^)]+)\)|\b(remix|mix|edit|version|live|instrumental|dub|radio)\b/gi);

  const metadataLines = [
    `Title: ${title}`,
    `Artist: ${artist}`,
    `Album: ${album}`,
    rawYear ? `Year: ${rawYear}` : "",
    rawDuration ? `Duration: ${rawDuration}` : "",
    rawDurationSeconds ? `Duration Seconds: ${rawDurationSeconds}` : "",
    args.isrc ? `ISRC: ${args.isrc}` : "",
    args.release_id ? `Discogs Release ID: ${args.release_id}` : "",
    args.discogs_url ? `Discogs URL: ${args.discogs_url}` : "",
    args.apple_music_url ? `Apple Music URL: ${args.apple_music_url}` : "",
    args.youtube_url ? `YouTube URL: ${args.youtube_url}` : "",
    args.soundcloud_url ? `SoundCloud URL: ${args.soundcloud_url}` : "",
    versionMarkers?.length
      ? `Version Markers: ${versionMarkers.join(", ")}`
      : "",
  ].filter(Boolean);

  return (
    `${preamble}\n` +
    `Return a JSON object with the fields: genres, descriptors, notes, needs_search, artist_match_confidence.\n` +
    `${metadataLines.join("\n")}`
  );
}

export function buildBulkTrackMetadataPrompt(
  tracks: Array<{
    track_id: string;
    title: string;
    artist: string;
    album?: string;
    url?: string | null | undefined;
  }>,
  basePrompt: string
): string {
  const preamble = basePrompt || "";
  const header =
    `${preamble}\n` +
    `For each track below, return a JSON object with the fields: track_id, local_tags (string), notes.\n` +
    `In local_tags, use the genre or style of the actual track (not the album).`;

  const body = tracks
    .map((t) => {
      const lines = [
        `Track ID: ${t.track_id}`,
        `Title: ${t.title}`,
        `Artist: ${t.artist}`,
        `Album: ${t.album ?? ""}`,
        t.url ? `Reference URL: ${t.url}` : undefined,
        `---`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");

  return `${header}\n Tracks:\n${body}`;
}
