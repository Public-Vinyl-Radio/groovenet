import { Command } from "commander";
import { loadConfig, saveConfig } from "@groovenet/client";
import { printJson, printSuccess, printError } from "../output.js";

type ConfigKey =
  | "api_base"
  | "player_api_key"
  | "api_key"
  | "default_friend_id"
  | "username"
  | "insecure_tls"
  | "player_artwork"
  | "player_log_plays"
  | "player_backend"
  | "owntone_url"
  | "owntone_password"
  | "owntone_library"
  | "owntone_output";

const VALID_KEYS: ConfigKey[] = [
  "api_base",
  "api_key",
  "player_api_key",
  "default_friend_id",
  "username",
  "insecure_tls",
  "player_artwork",
  "player_log_plays",
  "player_backend",
  "owntone_url",
  "owntone_password",
  "owntone_library",
  "owntone_output",
];

export function addConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage CLI configuration");

  config
    .command("set <key> <value>")
    .description(`Set a config value. Keys: ${VALID_KEYS.join(", ")}`)
    .action((key: string, value: string) => {
      if (!VALID_KEYS.includes(key as ConfigKey)) {
        printError(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
        process.exit(2);
      }
      const update: Record<string, string | number | boolean> = {};
      if (key === "default_friend_id") {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          printError(`default_friend_id must be a number`);
          process.exit(2);
        }
        update[key] = num;
      } else if (key === "insecure_tls" || key === "player_artwork" || key === "player_log_plays") {
        const truthy = ["true", "1", "yes", "on"];
        const falsy = ["false", "0", "no", "off"];
        const v = value.toLowerCase();
        if (!truthy.includes(v) && !falsy.includes(v)) {
          printError(`${key} must be true or false`);
          process.exit(2);
        }
        update[key] = truthy.includes(v);
      } else {
        if (key === "player_backend" && value !== "mpv" && value !== "owntone") {
          printError("player_backend must be mpv or owntone");
          process.exit(2);
        }
        update[key] = value;
      }
      saveConfig(update);
      printSuccess(
        `✓ Set ${key} = ${["api_key", "player_api_key", "owntone_password"].includes(key) ? "***" : value}`,
      );
    });

  config
    .command("show")
    .description("Show current configuration")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const cfg = { ...loadConfig() };
      for (const key of ["api_key", "player_api_key", "owntone_password"] as const) {
        if (cfg[key]) cfg[key] = "***";
      }
      if (opts.json) {
        printJson(cfg);
      } else {
        console.log("Current configuration:");
        for (const [k, v] of Object.entries(cfg)) {
          const display =
            (k === "api_key" || k === "owntone_password") && v
              ? "***"
              : typeof v === "object"
                ? JSON.stringify(v)
                : v;
          console.log(`  ${k}: ${display}`);
        }
      }
    });
}
