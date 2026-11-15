#!/usr/bin/env node
/**
 * Browser reviewer for the #1196 side-by-side sheet: covers, and audio to
 * listen to each pick, beside the same two questions as `review.mjs`. Local
 * only: it listens on 127.0.0.1 and saves to the same sheet file after every
 * answer. Like the terminal reviewer, it never reads the key.
 *
 * - Metadata and covers come from this worktree's app (prod-seeded).
 * - Audio streams in the browser from `--audio-base` (production's
 *   `/api/audio`, read-only), because the worktree has no audio files.
 * - A track with no file gets Apple's 30-second preview, looked up here
 *   (`itunes.apple.com/lookup`, by its Apple Music catalogue id) only when
 *   you press play on it.
 *
 *   node evaluations/1196/review-web.mjs --file eval-data/1196/review.json \
 *     --audio-base https://groovenet.home.arpa [--port 8196] [--no-apple]
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KIND, save } from "./side-by-side.mjs";
import { trackKey } from "./metrics.mjs";
import { api, assertLocalUrl, worktreeEnv } from "./stack.mjs";

const ANSWERS = new Set(["a", "b", "same"]);
const PAGE = new URL("./review-web.html", import.meta.url);

/** Every track a sheet shows, seeds included, once each. */
export function sheetTracks(sheet) {
  const out = new Map();
  for (const item of sheet.items)
    for (const t of [item.seed, ...item.a, ...item.b]) {
      if (!t.track_id)
        throw new Error("This sheet has no track ids; run `side-by-side.mjs --upgrade` first");
      out.set(trackKey(t), { track_id: t.track_id, friend_id: t.friend_id });
    }
  return [...out.values()];
}

/** The Apple Music catalogue id in a song or album-track URL, or null. */
export function appleId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)apple\.com$/.test(u.hostname)) return null;
    const i = u.searchParams.get("i");
    if (i && /^\d+$/.test(i)) return i;
    const m = /\/song\/(?:[^/]+\/)?(\d+)$/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * What the page needs for one track: a cover, a production audio URL when
 * the track has a file, and whether an Apple preview can stand in. Only
 * these fields: nothing that scores or names a profile.
 */
export function mediaFor(track, { appUrl, audioBase }) {
  const cover = track.audio_file_album_art_url?.trim() || track.album_thumbnail || null;
  return {
    cover: cover ? new URL(cover, appUrl).href : null,
    audio:
      track.local_audio_url && audioBase
        ? `${audioBase}/api/audio?filename=${encodeURIComponent(track.local_audio_url)}`
        : null,
    apple: appleId(track.apple_music_url) !== null,
    links: {
      apple: track.apple_music_url || null,
      youtube: track.youtube_url || null,
    },
  };
}

/** Validate one answer and apply it; throws on anything the sheet can't hold. */
export function applyAnswer(sheet, { id, mix, set, note = "" }) {
  const item = sheet.items.find((i) => i.id === id);
  if (!item) throw new Error(`No item ${id}`);
  if (!ANSWERS.has(mix) || !ANSWERS.has(set))
    throw new Error("mix and set must each be a, b or same");
  if (typeof note !== "string" || note.length > 2000)
    throw new Error("note must be text under 2000 characters");
  Object.assign(item, { mix, set, note: note.trim() });
  return item;
}

/** The audio base must be https, or a loopback host, never a path into somewhere else. */
export function audioOrigin(value) {
  if (!value) return null;
  const u = new URL(value);
  if (u.protocol !== "https:") assertLocalUrl(value);
  return u.origin;
}

/** The HTTP handler, with its effects injected so tests can drive it. */
export function handler({ sheet, file, media, preview, page, persist = save }) {
  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  return async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(page());
      }
      if (req.method === "GET" && url.pathname === "/api/sheet")
        return json(res, 200, { questions: sheet.questions, items: sheet.items, media });
      if (req.method === "GET" && url.pathname === "/api/preview") {
        const key = url.searchParams.get("track") ?? "";
        if (!Object.hasOwn(media, key)) return json(res, 404, { error: "Unknown track" });
        return json(res, 200, { url: await preview(key) });
      }
      if (req.method === "POST" && url.pathname === "/api/answer") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 10_000) return json(res, 413, { error: "Too large" });
        }
        const item = applyAnswer(sheet, JSON.parse(body));
        persist(file, sheet);
        return json(res, 200, {
          id: item.id,
          answered: sheet.items.filter((i) => i.mix && i.set).length,
        });
      }
      return json(res, 404, { error: "Not found" });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  };
}

/** Apple's 30-second preview for a track, cached; null when there is none. */
export function applePreviews(tracks, fetchImpl = fetch) {
  const cache = new Map();
  return async (key) => {
    if (cache.has(key)) return cache.get(key);
    const id = appleId(tracks.get(key)?.apple_music_url);
    let url = null;
    if (id) {
      const res = await fetchImpl(`https://itunes.apple.com/lookup?id=${id}`);
      if (res.ok) url = (await res.json()).results?.find((r) => r.previewUrl)?.previewUrl ?? null;
    }
    cache.set(key, url);
    return url;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const file = opt("--file", "eval-data/1196/review.json");
  const sheet = JSON.parse(readFileSync(file, "utf8"));
  if (sheet?.kind !== KIND) throw new Error("Not a #1196 side-by-side sheet");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const appUrl = assertLocalUrl(opt("--app", worktreeEnv(root).appUrl));
  const audioBase = audioOrigin(opt("--audio-base"));
  const full = await api(appUrl, "/api/tracks/batch", { tracks: sheetTracks(sheet) });
  const tracks = new Map(full.map((t) => [trackKey(t), t]));
  const media = Object.fromEntries(
    [...tracks].map(([k, t]) => [k, mediaFor(t, { appUrl, audioBase })]),
  );
  if (args.includes("--no-apple")) for (const m of Object.values(media)) m.apple = false;
  const preview = args.includes("--no-apple") ? async () => null : applePreviews(tracks);
  const server = createServer(
    handler({ sheet, file, media, preview, page: () => readFileSync(PAGE, "utf8") }),
  );
  const port = Number(opt("--port", "8196"));
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use: is the reviewer already running? Open http://127.0.0.1:${port}/, or pass --port N.`
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    const { port } = server.address();
    const withAudio = Object.values(media).filter((m) => m.audio).length;
    console.log(`#1196 review: http://127.0.0.1:${port}/`);
    console.log(
      `${sheet.items.length} seeds, ${tracks.size} tracks, ${withAudio} with audio from ${audioBase ?? "nowhere (pass --audio-base)"}`,
    );
    console.log("Ctrl-C to stop; every answer is already saved.");
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
