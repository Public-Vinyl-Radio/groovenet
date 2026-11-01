import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRoadmap, loadRoadmap, parseMarker, stripPrefix, toItem } from "./roadmap.mjs";

const issue = (n, over = {}) => ({
  number: n,
  title: `feat(x): thing ${n}`,
  body: "",
  html_url: `https://github.com/o/r/issues/${n}`,
  created_at: `2026-01-0${n}T00:00:00Z`,
  milestone: null,
  ...over,
});

const mockFetch = (byLabel, calls = []) => async (url, init) => {
  calls.push({ url: String(url), init });
  const id = /labels=roadmap:(\w+)/.exec(url)[1];
  const v = byLabel[id] ?? [];
  if (v instanceof Error) throw v;
  if (typeof v === "number") return { ok: false, status: v, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => v };
};
const quiet = { warn: () => {}, log: () => {} };

test("marker: present", () => {
  assert.deepEqual(parseMarker("hi\n<!-- roadmap\ntitle: A title\nnote: A note.\n-->\nmore"), {
    title: "A title",
    note: "A note.",
  });
});

test("marker: missing", () => {
  assert.equal(parseMarker("just text <!-- other -->"), null);
  assert.equal(parseMarker(null), null);
});

test("marker: malformed (no title, unclosed, garbage)", () => {
  assert.equal(parseMarker("<!-- roadmap\nnote: only a note\n-->"), null);
  assert.equal(parseMarker("<!-- roadmap\ntitle: never closed"), null);
  assert.equal(parseMarker("<!-- roadmap\nnot key value\n-->"), null);
  assert.equal(parseMarker("<!-- roadmap\ntitle:\n-->"), null);
});

test("marker: extra fields are ignored", () => {
  const f = parseMarker("<!-- roadmap\ntitle: T\nowner: me\nnote: N: with colon\n-->");
  assert.equal(f.title, "T");
  assert.equal(f.note, "N: with colon");
});

test("stripPrefix", () => {
  assert.equal(stripPrefix("feat(spins): dusty crates"), "dusty crates");
  assert.equal(stripPrefix("fix!: bang"), "bang");
  assert.equal(stripPrefix("epic: marketing site"), "marketing site");
  assert.equal(stripPrefix("No prefix here"), "No prefix here");
  assert.equal(stripPrefix("feat: "), "feat:");
});

test("toItem uses the marker, or the stripped title with a warning", () => {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const a = toItem(issue(1, { body: "<!-- roadmap\ntitle: Site title\nnote: N\n-->" }), warn);
  assert.deepEqual(a, { title: "Site title", note: "N", url: "https://github.com/o/r/issues/1" });
  assert.equal(warnings.length, 0);
  const b = toItem(issue(2), warn);
  assert.equal(b.title, "thing 2");
  assert.equal(b.note, "");
  assert.match(warnings[0], /#2/);
});

test("columns are ordered, empty ones dropped, PRs skipped", async () => {
  const cols = await fetchRoadmap({
    fetch: mockFetch({ now: [issue(1), { ...issue(2), pull_request: {} }], later: [issue(3)] }),
    ...quiet,
  });
  assert.deepEqual(cols.map((c) => [c.id, c.label, c.items.length]), [["now", "Now", 1], ["later", "Later", 1]]);
});

test("ordering: oldest first, milestones before none, by due date", async () => {
  const m = (number, due_on) => ({ number, due_on });
  const cols = await fetchRoadmap({
    fetch: mockFetch({
      next: [
        issue(4),
        issue(3, { milestone: m(2, null) }),
        issue(2, { milestone: m(1, "2026-03-01T00:00:00Z") }),
        issue(1),
        issue(5, { milestone: m(3, "2026-02-01T00:00:00Z") }),
      ],
    }),
    ...quiet,
  });
  assert.deepEqual(cols[0].items.map((i) => i.title), ["thing 5", "thing 2", "thing 3", "thing 1", "thing 4"]);
});

test("same milestone falls back to oldest first", async () => {
  const ms = { number: 1, due_on: null };
  const cols = await fetchRoadmap({
    fetch: mockFetch({ now: [issue(2, { milestone: ms }), issue(1, { milestone: ms })] }),
    ...quiet,
  });
  assert.deepEqual(cols[0].items.map((i) => i.title), ["thing 1", "thing 2"]);
});

test("sends the token only when set", async () => {
  const calls = [];
  await fetchRoadmap({ fetch: mockFetch({}, calls), token: "tok", ...quiet });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.match(calls[0].url, /state=open/);
  const bare = [];
  await fetchRoadmap({ fetch: mockFetch({}, bare), token: "", ...quiet });
  assert.equal(bare[0].init.headers.Authorization, undefined);
});

const fallback = async () => "FALLBACK";

test("loadRoadmap: uses GitHub when labelled issues exist", async () => {
  const logs = [];
  const cols = await loadRoadmap(fallback, { fetch: mockFetch({ now: [issue(1)] }), log: (m) => logs.push(m), warn() {} });
  assert.equal(cols[0].items[0].title, "thing 1");
  assert.match(logs[0], /1 items/);
});

test("loadRoadmap: falls back on HTTP error, with the reason", async () => {
  const logs = [];
  const out = await loadRoadmap(fallback, { fetch: mockFetch({ next: 403 }), log: (m) => logs.push(m), warn() {} });
  assert.equal(out, "FALLBACK");
  assert.match(logs[0], /403/);
});

test("loadRoadmap: falls back on network error and bad payload", async () => {
  const logs = [];
  const log = (m) => logs.push(m);
  assert.equal(await loadRoadmap(fallback, { fetch: mockFetch({ now: new Error("ENOTFOUND") }), log, warn() {} }), "FALLBACK");
  assert.match(logs[0], /ENOTFOUND/);
  const bad = async () => ({ ok: true, status: 200, json: async () => ({ message: "nope" }) });
  assert.equal(await loadRoadmap(fallback, { fetch: bad, log, warn() {} }), "FALLBACK");
  assert.match(logs[1], /unexpected response/);
});

test("loadRoadmap: falls back on timeout", async () => {
  const logs = [];
  const hang = (_url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const out = await loadRoadmap(fallback, { fetch: hang, timeoutMs: 20, log: (m) => logs.push(m), warn() {} });
  assert.equal(out, "FALLBACK");
  assert.match(logs[0], /timed out/);
});

test("loadRoadmap: falls back on an empty response", async () => {
  const logs = [];
  const out = await loadRoadmap(fallback, { fetch: mockFetch({}), log: (m) => logs.push(m), warn() {} });
  assert.equal(out, "FALLBACK");
  assert.match(logs[0], /no issues carry/);
});
