import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_LYRICS_CHARS,
  cacheKey,
  chatRequest,
  contextLyricsSentence,
  identityLyricsLine,
  promptLyrics,
  validateSummary,
} from "./summary.mjs";
import {
  assertLocalHost,
  lyricTracks,
  modelInfo,
  run,
  summariesByTrack,
  summariseOne,
  timingReport,
} from "./summarize.mjs";

const good = {
  themes: ["  Late-Night Longing. ", "party", "party", ""],
  mood: ["Yearning"],
  languages: ["Spanish"],
  vocal_presence: "full lyrics",
};

test("validateSummary normalises phrases and rejects a broken shape", () => {
  assert.deepEqual(validateSummary(JSON.stringify(good)), {
    themes: ["late-night longing", "party"],
    mood: ["yearning"],
    languages: ["spanish"],
    vocal_presence: "full lyrics",
  });
  assert.deepEqual(validateSummary({ ...good, themes: ["a", "b", "c", "d", "e"] }).themes, [
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.throws(() => validateSummary("null"), /not an object/);
  assert.throws(() => validateSummary("{nope"), SyntaxError);
  assert.throws(() => validateSummary({ ...good, themes: "party" }), /Expected a list/);
  assert.throws(() => validateSummary({ ...good, mood: [3] }), /Expected strings/);
  assert.throws(
    () => validateSummary({ ...good, themes: ["one two three four five"] }),
    /too long/,
  );
  assert.throws(() => validateSummary({ ...good, vocal_presence: "lots" }), /vocal_presence/);
  assert.throws(() => validateSummary({ ...good, mood: [" "] }), /Missing mood/);
  assert.throws(() => validateSummary({ ...good, languages: [] }), /Missing languages/);
});

test("renderings with and without themes", () => {
  const s = validateSummary(good);
  assert.equal(
    identityLyricsLine(s),
    "Lyrics: late-night longing, party; mood yearning; language spanish; vocals full lyrics",
  );
  const hook = { ...s, themes: [], vocal_presence: "hook-only" };
  assert.match(identityLyricsLine(hook), /^Lyrics: no clear theme; /);
  assert.equal(
    contextLyricsSentence(hook),
    "Lyrics with no clear theme; yearning mood; sung in spanish; hook-only.",
  );
});

test("the prompt carries only the lyrics, truncated and deterministic", () => {
  const req = chatRequest("qwen3.5:latest", "line\r\none");
  assert.equal(req.options.temperature, 0);
  assert.equal(req.think, false);
  assert.equal(req.messages[1].content, "Lyrics:\nline\none");
  const long = "x".repeat(MAX_LYRICS_CHARS + 5);
  assert.deepEqual(promptLyrics(long), { text: "x".repeat(MAX_LYRICS_CHARS), truncated: true });
  assert.deepEqual(promptLyrics(null), { text: "", truncated: false });
  assert.equal(cacheKey("d1", "a"), cacheKey("d1", " a\n"));
  assert.notEqual(cacheKey("d1", "a"), cacheKey("d2", "a"));
});

test("only loopback hosts are accepted", () => {
  assert.equal(assertLocalHost("http://127.0.0.1:11434/"), "http://127.0.0.1:11434");
  assert.equal(assertLocalHost("http://localhost:11434"), "http://localhost:11434");
  assert.equal(assertLocalHost("http://[::1]:11434"), "http://[::1]:11434");
  assert.throws(() => assertLocalHost("https://api.example.com"), /non-local/);
  assert.throws(() => assertLocalHost("http://192.168.1.5:11434"), /non-local/);
});

/** A fake Ollama: `/api/tags`, `/api/show`, `/api/chat`. */
function ollama({ installed = true, loadable = true, reply = good, chatError = null } = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    const json = (data, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data });
    if (path === "/api/tags")
      return json({
        models: installed
          ? [
              { name: "qwen3.5:latest", digest: "abc" },
              { name: "qwen3.5:9b-q4_K_M", digest: "abc" },
            ]
          : [],
      });
    if (path === "/api/show")
      return loadable
        ? json({ details: { quantization_level: "Q4_K_M", parameter_size: "9B", family: "qwen" } })
        : json({ error: "model 'qwen3.5:latest' not found" }, false);
    if (chatError) return json({ error: chatError }, false);
    return json({
      message: { content: typeof reply === "string" ? reply : JSON.stringify(reply) },
      prompt_eval_count: 40,
      eval_count: 20,
    });
  };
  return { fetchFn, calls };
}

test("modelInfo records digest and quantisation, and fails on a missing model or blob", async () => {
  const host = "http://127.0.0.1:11434";
  assert.deepEqual(await modelInfo(host, "qwen3.5", ollama().fetchFn), {
    model: "qwen3.5:latest",
    digest: "abc",
    quantization: "Q4_K_M",
    parameter_size: "9B",
    family: "qwen",
  });
  await assert.rejects(
    modelInfo(host, "qwen3.5", ollama({ installed: false }).fetchFn),
    /not installed/,
  );
  await assert.rejects(
    modelInfo(host, "qwen3.5:latest", ollama({ loadable: false }).fetchFn),
    /cannot load/,
  );
});

test("summariseOne records invalid output as an error and throws on a server error", async () => {
  const host = "http://127.0.0.1:11434";
  const bad = await summariseOne(host, "m", "la", {}, ollama({ reply: "{}" }).fetchFn);
  assert.equal(bad.summary, null);
  assert.match(bad.error, /Expected a list/);
  assert.equal(bad.output_tokens, 20);
  const { fetchFn, calls } = ollama();
  const ok = await summariseOne(host, "m", "la", { num_gpu: 0 }, fetchFn);
  assert.equal(ok.error, null);
  assert.equal(calls[0].body.options.num_gpu, 0);
  await assert.rejects(
    summariseOne(host, "m", "la", {}, ollama({ chatError: "boom" }).fetchFn),
    /boom/,
  );
});

test("lyricTracks needs a lyrics snapshot", () => {
  assert.throws(() => lyricTracks({ schema_version: 1, tracks: [] }), /--lyrics/);
  assert.deepEqual(
    lyricTracks({
      schema_version: 1,
      lyrics_included: true,
      tracks: [
        { track_id: "a", lyrics: "x" },
        { track_id: "b", lyrics: " " },
        { track_id: "c", lyrics: null },
      ],
    }).map((t) => t.track_id),
    ["a"],
  );
});

test("timingReport handles an empty run", () => {
  assert.deepEqual(timingReport([]), {
    summarised: 0,
    failed: 0,
    truncated: 0,
    total_seconds: 0,
    mean_ms: null,
    median_ms: null,
    p90_ms: null,
    output_tokens_per_second: null,
  });
});

test("run summarises, caches, resumes and refuses a changed manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "1170-summ-"));
  try {
    const snapshotFile = join(dir, "snap.json");
    writeFileSync(
      snapshotFile,
      JSON.stringify({
        schema_version: 1,
        lyrics_included: true,
        tracks: [
          { track_id: "a", lyrics: "synthetic one" },
          { track_id: "b", lyrics: "synthetic one" },
          { track_id: "c", lyrics: "synthetic two" },
          { track_id: "d", lyrics: null },
        ],
      }),
    );
    const outputDir = join(dir, "out");
    const log = () => {};
    const first = await run({ snapshotFile, outputDir, limit: 1, fetchFn: ollama().fetchFn, log });
    assert.equal(first.this_run.summarised, 1);
    assert.equal(first.remaining, 1, "a and b share lyrics, so two unique texts");
    assert.equal(first.manifest.quantization, "Q4_K_M");
    const { fetchFn, calls } = ollama();
    const second = await run({ snapshotFile, outputDir, fetchFn, log });
    assert.equal(second.this_run.summarised, 1);
    assert.equal(second.all_cached.summarised, 2);
    assert.equal(calls.filter((c) => c.path === "/api/chat").length, 1);
    assert.equal(statSync(join(outputDir, "summaries.ndjson")).mode & 0o777, 0o600);
    await assert.rejects(
      run({ snapshotFile, outputDir, cpu: true, fetchFn: ollama().fetchFn, log }),
      /another snapshot, model, prompt or options/,
    );
    await assert.rejects(
      run({ snapshotFile, outputDir, host: "http://10.0.0.2:11434", fetchFn: ollama().fetchFn }),
      /non-local/,
    );
    const snapshot = JSON.parse(readFileSync(snapshotFile, "utf8"));
    const { summaries } = summariesByTrack(snapshot, outputDir);
    assert.deepEqual([...summaries.keys()], ["a", "b", "c"]);
    assert.equal(summaries.get("a").vocal_presence, "full lyrics");
    snapshot.tracks.push({ track_id: "e", lyrics: "synthetic three" });
    assert.throws(() => summariesByTrack(snapshot, outputDir), /No summary for e/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
