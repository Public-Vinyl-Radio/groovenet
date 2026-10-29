import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ArtworkCache, artworkSource, blockRows, deleteImage, detectArtwork, passthrough, placeholderRows, transmit } from "./artwork.js";
import { displayWidth } from "./text.js";

const png = () => sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();

describe("artwork detection", () => {
  it.each([
    [{ TERM_PROGRAM: "ghostty" }, "kitty"],
    [{ TERM: "xterm-kitty" }, "kitty"],
    [{ GHOSTTY_RESOURCES_DIR: "/ghostty", TERM_PROGRAM: "tmux" }, "kitty"],
    [{ KITTY_WINDOW_ID: "1" }, "kitty"],
    [{ TERM_PROGRAM: "iTerm.app" }, "blocks"],
    [{ COLORTERM: "truecolor" }, "blocks"],
    [{ COLORTERM: "24bit", STY: "screen", TERM_PROGRAM: "ghostty" }, "blocks"],
    [{ COLORTERM: "truecolor", ZELLIJ: "1", TERM_PROGRAM: "ghostty" }, "blocks"],
    [{ TERM_PROGRAM: "ghostty", GROOVENET_TUI_ART: "blocks" }, "blocks"],
    [{ GROOVENET_TUI_ART: "kitty" }, "kitty"],
    [{ GROOVENET_TUI_ART: "blocks" }, "off"],
    [{ TERM_PROGRAM: "ghostty", GROOVENET_TUI_ART: "off" }, "off"],
    [{ TERM_PROGRAM: "ghostty", GROOVENET_TUI_ART: "invalid" }, "off"],
    [{ TERM_PROGRAM: "ghostty", NO_COLOR: "" }, "kitty"],
    [{ TERM_PROGRAM: "ghostty", NO_COLOR: "1" }, "off"],
    [{ TERM_PROGRAM: "ghostty", TERM: "dumb" }, "off"],
    [{ TERM: "xterm" }, "off"],
  ] as const)("%j -> %s", async (env, mode) => {
    expect((await detectArtwork({ env, tty: true })).mode).toBe(mode);
  });

  it("never emits graphics to redirected output", async () => {
    expect((await detectArtwork({ env: { TERM_PROGRAM: "ghostty" }, tty: false })).mode).toBe("off");
  });

  it("checks the current tmux pane, accepts on/all, and falls back on failure/off", async () => {
    const env = { TMUX: "session", TMUX_PANE: "%4", TERM_PROGRAM: "ghostty", COLORTERM: "truecolor" };
    const run = vi.fn().mockResolvedValue("on\n");
    expect(await detectArtwork({ env, tty: true, run })).toEqual({ mode: "kitty", tmux: true });
    expect(run).toHaveBeenCalledWith(["show-options", "-p", "-A", "-v", "-t", "%4", "allow-passthrough"]);
    run.mockResolvedValueOnce("all");
    expect((await detectArtwork({ env: { ...env, TMUX_PANE: undefined }, tty: true, run })).mode).toBe("kitty");
    run.mockResolvedValueOnce("off");
    expect((await detectArtwork({ env, tty: true, run })).mode).toBe("blocks");
    run.mockRejectedValueOnce(new Error("old tmux"));
    expect((await detectArtwork({ env, tty: true, run })).mode).toBe("blocks");
  });
});

describe("artwork encoding", () => {
  it("chunks PNGs at 4096 base64 bytes, quiet and cursor independent", () => {
    const bytes = Buffer.alloc(4000, 1);
    const result = transmit(bytes, 42, 18, 8, false);
    expect(result).toContain("a=T,f=100,t=d,U=1,q=2,i=42,c=18,r=8,m=1;");
    expect(result).toContain("\x1b_Gm=0;");
    const payload = [...result.matchAll(/\x1b_G[^;]+;([^\x1b]+)\x1b\\/g)].map(match => match[1]);
    expect(payload.map(value => value.length)).toEqual([4096, 1240]);
    expect(Buffer.from(payload.join(""), "base64")).toEqual(bytes);
    expect(transmit(Buffer.from("x"), 1, 2, 2, true)).toBe(passthrough("\x1b_Ga=T,f=100,t=d,U=1,q=2,i=1,c=2,r=2,m=0;eA==\x1b\\", true));
    expect(deleteImage(42, true)).toBe("\x1bPtmux;\x1b\x1b_Ga=d,d=I,i=42,q=2\x1b\x1b\\\x1b\\");
  });

  it("encodes every placeholder cell explicitly so tmux can clip or move it", () => {
    const rows = placeholderRows(0x123456, 18, 8);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toContain("\x1b[38;2;18;52;86m\u{10eeee}\u0305\u0305");
    expect(rows[1]).toContain("\u{10eeee}\u030d\u0305");
    expect(rows.every(row => displayWidth(row) === 18)).toBe(true);
  });

  it("encodes upper/lower RGB pixels in the foreground/background", () => {
    expect(blockRows(Buffer.from([255, 0, 0, 0, 0, 255]), 1, 1)).toEqual(["\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀\x1b[39;49m"]);
    expect(artworkSource({ audio_file_album_art_url: "/local", album_thumbnail: "/remote" })).toBe("/local");
    expect(artworkSource({ album_thumbnail: "/remote" })).toBe("/remote");
    expect(artworkSource(null)).toBeUndefined();
  });
});

describe("artwork cache", () => {
  it("deduplicates loads, reuses source bytes on resize and bounds PNG dimensions", async () => {
    const api = { getArtwork: vi.fn().mockResolvedValue(await png()) };
    const cache = new ArtworkCache(api);
    const first = cache.get("/red", 18, 8, "kitty");
    expect(cache.get("/red", 18, 8, "kitty")).toBe(first);
    const image = await first;
    expect(await sharp(image.png).metadata()).toMatchObject({ width: 288, height: 256, hasAlpha: true });
    const { data, info } = await sharp(image.png).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0); // Padding blends into the terminal instead of forming black borders.
    const center = (128 * 288 + 144) * 4;
    expect([...data.subarray(center, center + 4)]).toEqual([255, 0, 0, 255]);
    const blocks = await cache.get("/red", 12, 6, "blocks");
    expect(blocks.rows).toHaveLength(6);
    expect(blocks.rows.every(row => displayWidth(row) === 12)).toBe(true);
    expect(blocks.rows.join("")).toContain("255;0;0");
    expect(api.getArtwork).toHaveBeenCalledTimes(1);
  });

  it("retries failed fetches and decoding without caching rejections", async () => {
    const api = { getArtwork: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Buffer.from("invalid")).mockResolvedValue(await png()) };
    const cache = new ArtworkCache(api);
    await expect(cache.get("/a", 2, 2, "kitty")).rejects.toThrow("offline");
    await expect(cache.get("/a", 2, 2, "kitty")).rejects.toThrow();
    await expect(cache.get("/a", 2, 2, "kitty")).resolves.toHaveProperty("png");
  });

  it("evicts old sources and prepared images", async () => {
    const api = { getArtwork: vi.fn().mockResolvedValue(await png()) };
    const cache = new ArtworkCache(api);
    for (let n = 0; n < 34; n++) await cache.get(`/${n}`, 1, 1, "blocks");
    await cache.get("/33", 2, 1, "blocks");
    expect(api.getArtwork).toHaveBeenCalledTimes(34);
    await cache.get("/0", 1, 1, "blocks");
    expect(api.getArtwork).toHaveBeenCalledTimes(35);
  });
});

it.each(["fetch", "decode"])("a late %s failure cannot evict a newer cached cover", async failure => {
  let resolveOld!: (value: Buffer) => void;
  let rejectOld!: (error: Error) => void;
  const pending = new Promise<Buffer>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
  const api = { getArtwork: vi.fn().mockReturnValueOnce(pending).mockResolvedValue(await png()) };
  const cache = new ArtworkCache(api);
  const old = cache.get("/a", 1, 1, "kitty");
  const rejected = expect(old).rejects.toThrow();
  // A fast scroll evicts a request that is still loading.
  for (let i = 0; i < 34; i++) await cache.get(`/${i}`, 1, 1, "kitty");
  const fresh = cache.get("/a", 1, 1, "kitty");
  await fresh;
  if (failure === "fetch") rejectOld(new Error("late network failure"));
  else resolveOld(Buffer.from("invalid image"));
  await rejected;
  expect(cache.get("/a", 1, 1, "kitty")).toBe(fresh);
  await cache.get("/a", 2, 1, "kitty");
  expect(api.getArtwork).toHaveBeenCalledTimes(36);
});
