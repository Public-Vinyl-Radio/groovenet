import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  appleId,
  applePreviews,
  applyAnswer,
  audioOrigin,
  handler,
  mediaFor,
  sheetTracks,
} from "./review-web.mjs";

const t = (id, extra = {}) => ({ track_id: id, friend_id: 6, title: `T${id}`, ...extra });
const sheet = () => ({
  kind: "1196-side-by-side",
  questions: { mix: "Mix?", set: "Set?" },
  items: [
    {
      id: "s001",
      seed: t("seed"),
      a: [t("a"), t("both")],
      b: [t("both"), t("b")],
      mix: null,
      set: null,
      note: "",
    },
    { id: "s002", seed: t("seed"), a: [t("c")], b: [], mix: "a", set: "b", note: "" },
  ],
});

test("every shown track once, and a sheet without ids is refused", () => {
  assert.deepEqual(
    sheetTracks(sheet()).map((x) => x.track_id),
    ["seed", "a", "both", "b", "c"],
  );
  const old = sheet();
  delete old.items[0].a[0].track_id;
  assert.throws(() => sheetTracks(old), /--upgrade/);
});

test("Apple ids come from song and album-track URLs on apple.com only", () => {
  assert.equal(appleId("https://music.apple.com/us/album/x/123?i=456"), "456");
  assert.equal(appleId("https://music.apple.com/us/song/some-song/789"), "789");
  assert.equal(appleId("https://music.apple.com/us/song/789"), "789");
  assert.equal(appleId("https://music.apple.com/us/album/x/123"), null);
  assert.equal(appleId("https://evil.example.com/song/x/789"), null);
  assert.equal(appleId("https://music.apple.com/us/album/x/1?i=abc"), null);
  assert.equal(appleId("not a url"), null);
  assert.equal(appleId(null), null);
});

test("media: covers resolve against the app, audio against production, nothing else leaks", () => {
  const m = mediaFor(
    {
      album_thumbnail: "/uploads/album-covers/x.webp",
      local_audio_url: "8901800-A4 #1.m4a",
      apple_music_url: "https://music.apple.com/us/song/s/1",
      youtube_url: "https://youtu.be/x",
      notes: "private",
      star_rating: 5,
    },
    { appUrl: "http://127.0.0.1:34001", audioBase: "https://groovenet.home.arpa" },
  );
  assert.deepEqual(m, {
    cover: "http://127.0.0.1:34001/uploads/album-covers/x.webp",
    audio: "https://groovenet.home.arpa/api/audio?filename=8901800-A4%20%231.m4a",
    apple: true,
    links: { apple: "https://music.apple.com/us/song/s/1", youtube: "https://youtu.be/x" },
  });
  const art = mediaFor(
    { audio_file_album_art_url: " https://cdn.example/a.jpg ", album_thumbnail: "/b.jpg" },
    { appUrl: "http://127.0.0.1:1", audioBase: null },
  );
  assert.equal(art.cover, "https://cdn.example/a.jpg");
  assert.equal(art.audio, null);
  assert.deepEqual(mediaFor({}, { appUrl: "http://127.0.0.1:1" }), {
    cover: null,
    audio: null,
    apple: false,
    links: { apple: null, youtube: null },
  });
});

test("the audio base is https or loopback, reduced to its origin", () => {
  assert.equal(audioOrigin("https://groovenet.home.arpa/anything"), "https://groovenet.home.arpa");
  assert.equal(audioOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.throws(() => audioOrigin("http://192.168.2.151:3000"), /local/);
  assert.equal(audioOrigin(undefined), null);
});

test("answers are validated before they reach the sheet", () => {
  const s = sheet();
  assert.equal(
    applyAnswer(s, { id: "s001", mix: "a", set: "same", note: "  groove  " }).note,
    "groove",
  );
  assert.deepEqual([s.items[0].mix, s.items[0].set], ["a", "same"]);
  assert.throws(() => applyAnswer(s, { id: "s999", mix: "a", set: "a" }), /No item/);
  assert.throws(() => applyAnswer(s, { id: "s001", mix: "c", set: "a" }), /a, b or same/);
  assert.throws(() => applyAnswer(s, { id: "s001", mix: "a" }), /a, b or same/);
  assert.throws(() => applyAnswer(s, { id: "s001", mix: "a", set: "b", note: 5 }), /note/);
  assert.throws(
    () => applyAnswer(s, { id: "s001", mix: "a", set: "b", note: "x".repeat(2001) }),
    /note/,
  );
});

test("Apple previews are looked up once per track and cached", async () => {
  const calls = [];
  const tracks = new Map([
    ["6:a", { apple_music_url: "https://music.apple.com/us/song/s/42" }],
    ["6:b", { apple_music_url: null }],
    ["6:c", { apple_music_url: "https://music.apple.com/us/song/s/43" }],
  ]);
  const fake = async (url) => {
    calls.push(url);
    if (url.endsWith("43")) return { ok: false };
    return {
      ok: true,
      json: async () => ({ results: [{}, { previewUrl: "https://audio/p.m4a" }] }),
    };
  };
  const preview = applePreviews(tracks, fake);
  assert.equal(await preview("6:a"), "https://audio/p.m4a");
  assert.equal(await preview("6:a"), "https://audio/p.m4a");
  assert.equal(await preview("6:b"), null);
  assert.equal(await preview("6:c"), null);
  assert.deepEqual(calls, [
    "https://itunes.apple.com/lookup?id=42",
    "https://itunes.apple.com/lookup?id=43",
  ]);
});

async function serve(deps) {
  const server = createServer(handler(deps));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test("the server serves the page, the sheet and previews, and saves answers", async () => {
  const s = sheet();
  const saved = [];
  const { base, close } = await serve({
    sheet: s,
    file: "/tmp/sheet.json",
    media: { "6:a": { cover: null, audio: null, apple: true, links: {} } },
    preview: async (key) => `https://audio/${key}`,
    page: () => "<!doctype html><title>Suggestions review</title>",
    persist: (file, value) => saved.push([file, value.items[0].mix]),
  });
  try {
    const page = await fetch(base + "/");
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await page.text(), /Suggestions review/);
    const data = await (await fetch(base + "/api/sheet")).json();
    assert.equal(data.items.length, 2);
    assert.deepEqual(data.questions, { mix: "Mix?", set: "Set?" });
    assert.ok(!JSON.stringify(data).includes("beatmatcher"));
    assert.deepEqual(await (await fetch(base + "/api/preview?track=6:a")).json(), {
      url: "https://audio/6:a",
    });
    assert.equal((await fetch(base + "/api/preview?track=6:zzz")).status, 404);
    const post = (body) => fetch(base + "/api/answer", { method: "POST", body });
    const ok = await post(JSON.stringify({ id: "s001", mix: "b", set: "b" }));
    assert.deepEqual(await ok.json(), { id: "s001", answered: 2 });
    assert.deepEqual(saved, [["/tmp/sheet.json", "b"]]);
    const bad = await post(JSON.stringify({ id: "s001", mix: "x", set: "b" }));
    assert.equal(bad.status, 400);
    assert.equal((await post("{not json")).status, 400);
    assert.equal((await post("x".repeat(20_000))).status, 413);
    assert.equal(saved.length, 1, "nothing invalid is saved");
    assert.equal((await fetch(base + "/nope")).status, 404);
  } finally {
    await close();
  }
});
