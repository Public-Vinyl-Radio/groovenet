import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const home = vi.hoisted(() => ({ path: "" }));
vi.mock("os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home.path,
}));
afterEach(() => {
  if (home.path) rmSync(home.path, { recursive: true, force: true });
});
it("stores player credentials privately while preserving collection credentials", async () => {
  home.path = mkdtempSync(join(tmpdir(), "groovenet-config-"));
  vi.resetModules();
  const { loadConfig, saveConfig } = await import("./config.js");
  expect(loadConfig().default_friend_id).toBe(1);
  saveConfig({ api_key: "collection", player_api_key: "household" });
  const path = join(home.path, ".groovenet/config.json");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(statSync(join(home.path, ".groovenet")).mode & 0o777).toBe(0o700);
  saveConfig({ player_api_key: "rotated" });
  expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
    api_key: "collection",
    player_api_key: "rotated",
  });
});
it("tightens existing file permissions and tolerates malformed config", async () => {
  home.path = mkdtempSync(join(tmpdir(), "groovenet-config-"));
  mkdirSync(join(home.path, ".groovenet"));
  const path = join(home.path, ".groovenet/config.json");
  writeFileSync(path, "invalid", { mode: 0o644 });
  vi.resetModules();
  const { loadConfig, saveConfig } = await import("./config.js");
  expect(loadConfig().api_key).toBeUndefined();
  saveConfig({ player_api_key: "private" });
  expect(statSync(path).mode & 0o777).toBe(0o600);
});
it("accepts local or a valid player ID as a Now Playing target", async () => {
  const { parseNowPlayingTarget } = await import("./config.js");
  expect(parseNowPlayingTarget("local")).toBe("local");
  expect(parseNowPlayingTarget("lounge-2")).toBe("lounge-2");
  for (const bad of ["../bad", "", "Lounge", "-x", 7, undefined])
    expect(parseNowPlayingTarget(bad)).toBeUndefined();
});

it("fails with a migration message when the config still has insecure_tls: true", async () => {
  home.path = mkdtempSync(join(tmpdir(), "groovenet-config-"));
  mkdirSync(join(home.path, ".groovenet"));
  writeFileSync(join(home.path, ".groovenet/config.json"), '{"insecure_tls": true}');
  vi.resetModules();
  const { loadConfig } = await import("./config.js");
  expect(() => loadConfig()).toThrow(/"insecure_tls" config option was removed/);
  expect(() => loadConfig()).toThrow(/ca_cert.*GROOVENET_CA_CERT.*NODE_EXTRA_CA_CERTS/s);
});

it("ignores insecure_tls: false and lets saveConfig clear a stale insecure_tls: true", async () => {
  home.path = mkdtempSync(join(tmpdir(), "groovenet-config-"));
  mkdirSync(join(home.path, ".groovenet"));
  const path = join(home.path, ".groovenet/config.json");
  writeFileSync(path, '{"insecure_tls": false, "api_key": "k"}');
  vi.resetModules();
  const { loadConfig, saveConfig } = await import("./config.js");
  expect(loadConfig()).not.toHaveProperty("insecure_tls");
  writeFileSync(path, '{"insecure_tls": true, "api_key": "k"}');
  saveConfig({ ca_cert: "/etc/ca.pem" });
  const saved = JSON.parse(readFileSync(path, "utf8"));
  expect(saved).toMatchObject({ api_key: "k", ca_cert: "/etc/ca.pem" });
  expect(saved).not.toHaveProperty("insecure_tls");
  expect(loadConfig().ca_cert).toBe("/etc/ca.pem");
});

it("lets GROOVENET_CA_CERT override ca_cert without persisting it", async () => {
  home.path = mkdtempSync(join(tmpdir(), "groovenet-config-"));
  mkdirSync(join(home.path, ".groovenet"));
  const path = join(home.path, ".groovenet/config.json");
  writeFileSync(path, '{"ca_cert": "/from/config.pem"}');
  vi.resetModules();
  const { loadConfig, saveConfig } = await import("./config.js");
  vi.stubEnv("GROOVENET_CA_CERT", "/from/env.pem");
  try {
    expect(loadConfig().ca_cert).toBe("/from/env.pem");
    saveConfig({ username: "dj" });
    expect(JSON.parse(readFileSync(path, "utf8")).ca_cert).toBe("/from/config.pem");
    vi.stubEnv("GROOVENET_CA_CERT", "  ");
    expect(loadConfig().ca_cert).toBe("/from/config.pem");
  } finally {
    vi.unstubAllEnvs();
  }
});

it("treats a non-object config file as empty", async () => {
  home.path = mkdtempSync(join(tmpdir(), "groovenet-config-"));
  mkdirSync(join(home.path, ".groovenet"));
  writeFileSync(join(home.path, ".groovenet/config.json"), "null");
  vi.resetModules();
  const { loadConfig } = await import("./config.js");
  expect(loadConfig().default_friend_id).toBe(1);
});
