#!/usr/bin/env node
/**
 * Summarise every track's lyrics with a local Ollama model (#1170). Resumable:
 * results are cached by prompt version, model digest and lyrics, so a re-run
 * only does the tracks still missing. Lyrics never leave this machine: the
 * host must be a loopback address.
 *
 *   node evaluations/1170/summarize.mjs --snapshot eval-data/1170-friend-6.json \
 *     --output-dir eval-data/1170-summaries [--model qwen3.5:9b-q4_K_M] [--limit N] [--cpu]
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_LYRICS_CHARS,
  MODEL_OPTIONS,
  OUTPUT_SCHEMA,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  cacheKey,
  chatRequest,
  promptLyrics,
  sha256,
  validateSummary,
} from "./summary.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function assertLocalHost(host) {
  const url = new URL(host);
  if (!LOOPBACK.has(url.hostname))
    throw new Error("Refusing a non-local model host: lyrics stay on this machine");
  return url.origin;
}

/** Digest and quantisation of the installed model, from Ollama itself. */
export async function modelInfo(host, model, fetchFn = fetch) {
  const tags = await (await fetchFn(`${host}/api/tags`)).json();
  const name = model.includes(":") ? model : `${model}:latest`;
  const entry = tags.models?.find((m) => m.name === name || m.model === name);
  if (!entry) throw new Error(`Model ${name} is not installed`);
  const res = await fetchFn(`${host}/api/show`, {
    method: "POST",
    body: JSON.stringify({ model: name }),
  });
  const show = await res.json();
  if (!res.ok || show.error)
    throw new Error(`Ollama cannot load ${name}: ${show.error ?? res.status}`);
  return {
    model: name,
    digest: entry.digest,
    quantization: show.details?.quantization_level ?? null,
    parameter_size: show.details?.parameter_size ?? null,
    family: show.details?.family ?? null,
  };
}

/** One summary. Errors are returned, not thrown, so one bad track never stops a batch. */
export async function summariseOne(host, model, lyrics, options, fetchFn = fetch) {
  const body = chatRequest(model, lyrics);
  body.options = { ...body.options, ...options };
  const started = performance.now();
  const res = await fetchFn(`${host}/api/chat`, { method: "POST", body: JSON.stringify(body) });
  const ms = Math.round(performance.now() - started);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Ollama error: ${data.error ?? res.status}`);
  const timing = {
    ms,
    prompt_tokens: data.prompt_eval_count ?? null,
    output_tokens: data.eval_count ?? null,
  };
  try {
    return { summary: validateSummary(data.message?.content), error: null, ...timing };
  } catch (error) {
    return { summary: null, error: error.message, ...timing };
  }
}

export function lyricTracks(snapshot) {
  if (snapshot.schema_version !== 1 || !snapshot.lyrics_included)
    throw new Error("Snapshot has no lyrics; export it with --lyrics");
  return snapshot.tracks.filter((t) => typeof t.lyrics === "string" && t.lyrics.trim());
}

export function readCache(file) {
  const done = new Map();
  if (!existsSync(file)) return done;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (!row.key) throw new Error("Corrupt summary cache");
    done.set(row.key, row);
  }
  return done;
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** Aggregates only: safe to print and to copy into the write-up. */
export function timingReport(rows) {
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const total = ms.reduce((s, x) => s + x, 0);
  const out = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
  return {
    summarised: rows.length,
    failed: rows.filter((r) => !r.summary).length,
    truncated: rows.filter((r) => r.truncated).length,
    total_seconds: total / 1000,
    mean_ms: rows.length ? total / rows.length : null,
    median_ms: rows.length ? quantile(ms, 0.5) : null,
    p90_ms: rows.length ? quantile(ms, 0.9) : null,
    output_tokens_per_second: total ? out / (total / 1000) : null,
  };
}

export async function run({
  snapshotFile,
  outputDir,
  model = "qwen3.5:9b-q4_K_M",
  host = "http://127.0.0.1:11434",
  limit = Infinity,
  cpu = false,
  fetchFn = fetch,
  log = (m) => console.error(m),
}) {
  const origin = assertLocalHost(host);
  const bytes = readFileSync(snapshotFile);
  const snapshot_sha256 = createHash("sha256").update(bytes).digest("hex");
  const tracks = lyricTracks(JSON.parse(bytes));
  const info = await modelInfo(origin, model, fetchFn);
  const options = cpu ? { num_gpu: 0 } : {};
  const manifest = {
    snapshot_sha256,
    ...info,
    prompt_version: PROMPT_VERSION,
    prompt_sha256: sha256(`${SYSTEM_PROMPT}\n${JSON.stringify(OUTPUT_SCHEMA)}`),
    options: { ...MODEL_OPTIONS, ...options, think: false },
    max_lyrics_chars: MAX_LYRICS_CHARS,
  };
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const manifestFile = join(outputDir, "manifest.json");
  if (existsSync(manifestFile)) {
    const prior = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (JSON.stringify(prior) !== JSON.stringify(manifest))
      throw new Error("Output dir was made with another snapshot, model, prompt or options");
  } else {
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  const cacheFile = join(outputDir, "summaries.ndjson");
  const done = readCache(cacheFile);
  const todo = new Map();
  for (const t of tracks) {
    const key = cacheKey(info.digest, t.lyrics);
    if (!done.has(key) && !todo.has(key)) todo.set(key, { key, track: t });
  }
  const batch = [...todo.values()].slice(0, limit);
  log(`${tracks.length} tracks with lyrics; ${done.size} cached; summarising ${batch.length}`);
  const fresh = [];
  for (const [i, { key, track }] of batch.entries()) {
    const { truncated } = promptLyrics(track.lyrics);
    const result = await summariseOne(origin, info.model, track.lyrics, options, fetchFn);
    const row = { key, lyrics_sha256: sha256(track.lyrics), truncated, ...result };
    appendFileSync(cacheFile, JSON.stringify(row) + "\n", { mode: 0o600 });
    fresh.push(row);
    if ((i + 1) % 25 === 0 || i + 1 === batch.length) log(`${i + 1}/${batch.length}`);
  }
  return {
    output_dir: outputDir,
    manifest,
    this_run: timingReport(fresh),
    all_cached: timingReport([...readCache(cacheFile).values()]),
    remaining: todo.size - batch.length,
  };
}

/** `track_id` → summary (or null), for the variant builders. */
export function summariesByTrack(snapshot, outputDir) {
  const manifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
  const cache = readCache(join(outputDir, "summaries.ndjson"));
  const out = new Map();
  for (const t of lyricTracks(snapshot)) {
    const row = cache.get(cacheKey(manifest.digest, t.lyrics));
    if (!row) throw new Error(`No summary for ${t.track_id}; finish summarize.mjs first`);
    out.set(t.track_id, row.summary);
  }
  return { manifest, summaries: out };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  try {
    if (!option("--snapshot") || !option("--output-dir"))
      throw new Error(
        "Usage: node evaluations/1170/summarize.mjs --snapshot S --output-dir DIR [--model qwen3.5:9b-q4_K_M] [--host http://127.0.0.1:11434] [--limit N] [--cpu]",
      );
    const limit = option("--limit") ? Number(option("--limit")) : Infinity;
    if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1))
      throw new Error("--limit must be a positive integer");
    const report = await run({
      snapshotFile: option("--snapshot"),
      outputDir: option("--output-dir"),
      model: option("--model"),
      host: option("--host"),
      limit,
      cpu: args.includes("--cpu"),
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
