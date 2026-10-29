/** Terminal artwork uses text placements so Ink and tmux own its position and erasure. */
import { randomInt } from "node:crypto";
import sharp from "sharp";
import type { GroovenetClient } from "@groovenet/client";
import { runTmux, type TmuxRunner } from "../commands/playerTuiFullView.js";

export type ArtworkMode = "kitty" | "blocks" | "off";
export interface ArtworkSupport { mode: ArtworkMode; tmux: boolean }

export async function detectArtwork({ env = process.env, tty = process.stdout.isTTY, run = runTmux }: {
  env?: NodeJS.ProcessEnv; tty?: boolean; run?: TmuxRunner;
} = {}): Promise<ArtworkSupport> {
  const tmux = !!env.TMUX;
  const off: ArtworkSupport = { mode: "off", tmux };
  if (!tty || !!env.NO_COLOR || env.TERM === "dumb" || env.GROOVENET_TUI_ART === "off") return off;
  const trueColor = /^(truecolor|24bit)$/.test(env.COLORTERM ?? "") || /ghostty|kitty|wezterm|iterm/i.test(env.TERM_PROGRAM ?? "") || env.TERM === "xterm-kitty" || !!env.GHOSTTY_RESOURCES_DIR || !!env.KITTY_WINDOW_ID;
  const fallback: ArtworkSupport = { mode: trueColor ? "blocks" : "off", tmux };
  const requested = env.GROOVENET_TUI_ART;
  if (requested === "blocks") return fallback;
  if (requested && requested !== "auto" && requested !== "kitty") return off;
  if (env.STY || env.ZELLIJ) return fallback;
  const kitty = !!env.GHOSTTY_RESOURCES_DIR || !!env.KITTY_WINDOW_ID || requested === "kitty" || /^(ghostty|kitty)$/i.test(env.TERM_PROGRAM ?? "") || env.TERM === "xterm-kitty";
  if (!kitty) return fallback;
  if (tmux) {
    try {
      const pane = env.TMUX_PANE ? ["-t", env.TMUX_PANE] : [];
      // Include inherited window/global defaults, as well as per-pane overrides.
      const value = (await run(["show-options", "-p", "-A", "-v", ...pane, "allow-passthrough"])).trim();
      if (value !== "on" && value !== "all") return fallback;
    } catch { return fallback; }
  }
  return { mode: "kitty", tmux };
}

export function passthrough(sequence: string, tmux: boolean): string {
  return tmux ? `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\` : sequence;
}

function command(keys: string, data = ""): string { return `\x1b_G${keys}${data ? `;${data}` : ""}\x1b\\`; }

export function transmit(png: Buffer, id: number, width: number, height: number, tmux: boolean): string {
  const data = png.toString("base64");
  const chunks: string[] = [];
  for (let offset = 0; offset < data.length; offset += 4096) {
    const more = offset + 4096 < data.length ? 1 : 0;
    const keys = offset === 0 ? `a=T,f=100,t=d,U=1,q=2,i=${id},c=${width},r=${height},m=${more}` : `m=${more}`;
    chunks.push(passthrough(command(keys, data.slice(offset, offset + 4096)), tmux));
  }
  return chunks.join("");
}

export function deleteImage(id: number, tmux: boolean): string {
  return passthrough(command(`a=d,d=I,i=${id},q=2`), tmux);
}

// The protocol's first 32 row/column diacritics; slots are at most 18×8.
// https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders
const DIACRITICS = [0x305, 0x30d, 0x30e, 0x310, 0x312, 0x33d, 0x33e, 0x33f, 0x346, 0x34a, 0x34b, 0x34c, 0x350, 0x351, 0x352, 0x357, 0x35b, 0x363, 0x364, 0x365, 0x366, 0x367, 0x368, 0x369, 0x36a, 0x36b, 0x36c, 0x36d, 0x36e, 0x36f, 0x483, 0x484];
export function placeholderRows(id: number, width: number, height: number): string[] {
  return Array.from({ length: height }, (_, row) => `\x1b[38;2;${id >> 16 & 255};${id >> 8 & 255};${id & 255}m${Array.from({ length: width }, (_, column) => `\u{10eeee}${String.fromCodePoint(DIACRITICS[row], DIACRITICS[column])}`).join("")}\x1b[39m`);
}

export function blockRows(rgb: Buffer, width: number, height: number): string[] {
  const color = (offset: number) => `${rgb[offset]};${rgb[offset + 1]};${rgb[offset + 2]}`;
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => {
    const top = (row * 2 * width + column) * 3;
    return `\x1b[38;2;${color(top)}m\x1b[48;2;${color(top + width * 3)}m▀`;
  }).join("") + "\x1b[39;49m");
}

export interface PreparedArtwork { png: Buffer; rows: string[] }

/** Small session-only caches, including in-flight requests; failed loads can be retried. */
export class ArtworkCache {
  private sources = new Map<string, Promise<Buffer>>();
  private images = new Map<string, Promise<PreparedArtwork>>();
  constructor(private readonly api: Pick<GroovenetClient, "getArtwork">) {}

  private cached<T>(cache: Map<string, Promise<T>>, key: string, limit: number, load: () => Promise<T>): Promise<T> {
    const existing = cache.get(key);
    if (existing) { cache.delete(key); cache.set(key, existing); return existing; }
    const promise = load().catch(error => { if (cache.get(key) === promise) cache.delete(key); throw error; });
    cache.set(key, promise);
    if (cache.size > limit) cache.delete(cache.keys().next().value!);
    return promise;
  }

  get(url: string, width: number, height: number, mode: ArtworkMode): Promise<PreparedArtwork> {
    return this.cached(this.images, JSON.stringify([url, width, height, mode]), 32, async () => {
      const pending = this.cached(this.sources, url, 16, () => this.api.getArtwork(url));
      const source = await pending;
      try {
        // A cell is roughly twice as tall as it is wide. PNGs are bounded to slot resolution.
        const pixelWidth = mode === "kitty" ? width * 16 : width;
        const pixelHeight = mode === "kitty" ? height * 32 : height * 2;
        const image = sharp(source, { limitInputPixels: 16_000_000, animated: false }).rotate()
          .resize(pixelWidth, pixelHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toColourspace("srgb");
        if (mode === "kitty") return { png: await image.png().toBuffer(), rows: [] };
        const rgb = await image.flatten({ background: "black" }).removeAlpha().raw().toBuffer();
        return { png: Buffer.alloc(0), rows: blockRows(rgb, width, height) };
      } catch (error) {
        if (this.sources.get(url) === pending) this.sources.delete(url);
        throw error;
      }
    });
  }
}

export function artworkSource(value?: { audio_file_album_art_url?: string | null; album_thumbnail?: string | null } | null): string | undefined {
  return value?.audio_file_album_art_url || value?.album_thumbnail || undefined;
}

export const imageId = () => randomInt(1, 0x1000000);
