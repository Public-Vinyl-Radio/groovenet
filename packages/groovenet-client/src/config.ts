import { homedir } from "os";
import { join } from "path";
import { playerIdSchema } from "@groovenet/contracts";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";

export interface GroovenetConfig {
  api_base: string;
  api_key?: string;
  player_api_key?: string;
  default_friend_id: number;
  username?: string;
  /**
   * Path to a PEM CA bundle to trust for the API host (e.g. Caddy's local root
   * CA). `GROOVENET_CA_CERT` overrides it. Verification stays on.
   */
  ca_cert?: string;
  /** Let the local player's mpv open a window for embedded cover art. Default off. */
  player_artwork?: boolean;
  /** Log a digital spin when the local player has played a track long enough. Default off. */
  player_log_plays?: boolean;
  /** mpv remains the default. OwnTone requires a dedicated patched engine. */
  player_backend?: "mpv" | "owntone";
  owntone_url?: string;
  owntone_password?: string;
  /** Absolute library path as seen inside OwnTone, not the CLI filesystem. */
  owntone_library?: string;
  owntone_output?: string;
  /**
   * What `groovenet-now-playing` follows when started without a target flag: a
   * remote player ID, or `local` for the local daemon. Unset means `local`.
   */
  now_playing_target?: string;
  /**
   * Overrides for the player TUI's keys: action id to a list of keys, e.g.
   * `{ "transport.next": ["n", "ctrl+right"] }`. Validated by the CLI, which
   * reports bad entries rather than failing, so it is typed loosely here.
   */
  player_keymap?: Record<string, string[]>;
}

const CONFIG_DIR = join(homedir(), ".groovenet");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: GroovenetConfig = {
  api_base: "http://localhost:3000/api",
  default_friend_id: 1,
};

/** `local`, or a player ID by the same rule the server enforces; undefined when neither. */
export function parseNowPlayingTarget(value: unknown): string | undefined {
  if (value === "local") return value;
  const id = playerIdSchema.safeParse(value);
  return id.success ? id.data : undefined;
}

export const INSECURE_TLS_REMOVED =
  'The "insecure_tls" config option was removed because it disabled certificate verification. ' +
  'Trust your CA instead: run "groovenet config set ca_cert <path-to-ca.pem>", set GROOVENET_CA_CERT, ' +
  'or set NODE_EXTRA_CA_CERTS. Then remove "insecure_tls" from ~/.groovenet/config.json.';

function readStoredConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadConfig(): GroovenetConfig {
  const stored = readStoredConfig();
  if (stored.insecure_tls === true) throw new Error(INSECURE_TLS_REMOVED);
  const config = { ...DEFAULT_CONFIG, ...stored } as GroovenetConfig & { insecure_tls?: unknown };
  delete config.insecure_tls;
  const envCaCert = process.env.GROOVENET_CA_CERT?.trim();
  if (envCaCert) config.ca_cert = envCaCert;
  return config;
}

export function saveConfig(updates: Partial<GroovenetConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  // Read the file, not loadConfig(): the env override must not be written back,
  // and a leftover `insecure_tls` must not block the `config set` that fixes it.
  const current = readStoredConfig();
  delete current.insecure_tls;
  const merged = { ...DEFAULT_CONFIG, ...current, ...updates };
  if (existsSync(CONFIG_PATH)) chmodSync(CONFIG_PATH, 0o600);
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}
