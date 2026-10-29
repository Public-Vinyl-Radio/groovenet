#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeFileSync, renameSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Called under op run. Validate without logging or echoing resolved values. */
export function renderPlayerWebEnv(env) {
  const values = {};
  for (const [name, minimum] of [
    ["PLAYER_WEB_PASSPHRASE", 24],
    ["PLAYER_WEB_SESSION_SECRET", 32],
    ["PLAYER_API_KEY", 32],
  ]) {
    const value = env[name];
    if (typeof value !== "string" || value.length < minimum || /[\r\n\0]/.test(value))
      throw new Error(`${name} must have at least ${minimum} characters on one line.`);
    values[name] = value;
  }
  if (new Set(Object.values(values)).size !== 3)
    throw new Error("The web passphrase, session secret and worker key must be distinct.");
  const origin = env.PLAYER_WEB_ORIGIN;
  try {
    if (
      typeof origin !== "string" ||
      !origin.startsWith("https://") ||
      new URL(origin).origin !== origin
    )
      throw new Error();
  } catch {
    throw new Error(
      "PLAYER_WEB_ORIGIN must be an exact HTTPS origin without a path or trailing slash.",
    );
  }
  const days = env.PLAYER_WEB_SESSION_DAYS === undefined ? "365" : env.PLAYER_WEB_SESSION_DAYS;
  if (
    typeof days !== "string" ||
    !/^[1-9]\d*$/.test(days) ||
    !Number.isSafeInteger(Number(days)) ||
    Number(days) > 3650
  ) {
    throw new Error("PLAYER_WEB_SESSION_DAYS must be a positive integer of at most 3650.");
  }
  const output = {
    PLAYER_WEB_ORIGIN: origin,
    PLAYER_WEB_PASSPHRASE: values.PLAYER_WEB_PASSPHRASE,
    PLAYER_WEB_SESSION_SECRET: values.PLAYER_WEB_SESSION_SECRET,
    PLAYER_WEB_SESSION_DAYS: days,
  };
  // Match Compose's dotenv interpolation, including literal dollar signs.
  return Object.entries(output)
    .map(([name, value]) => `${name}=${JSON.stringify(value).replaceAll("$", () => "$$")}\n`)
    .join("");
}

export function writePlayerWebEnv(output, env) {
  if (!output) throw new Error("Usage: render-player-web-env.mjs <private-output-file>");
  const content = renderPlayerWebEnv(env);
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    writePlayerWebEnv(process.argv[2], process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
