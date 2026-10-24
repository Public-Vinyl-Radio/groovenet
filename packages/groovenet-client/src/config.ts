import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";

export interface GroovenetConfig {
  api_base: string;
  api_key?: string;
  player_api_key?: string;
  default_friend_id: number;
  username?: string;
  /** Skip TLS certificate verification (e.g. internal CA / self-signed hosts). */
  insecure_tls?: boolean;
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
}

const CONFIG_DIR = join(homedir(), ".groovenet");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: GroovenetConfig = {
  api_base: "http://localhost:3000/api",
  default_friend_id: 1,
};

export function loadConfig(): GroovenetConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as GroovenetConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(updates: Partial<GroovenetConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  const current = loadConfig();
  const merged = { ...current, ...updates };
  if (existsSync(CONFIG_PATH)) chmodSync(CONFIG_PATH, 0o600);
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}
