import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const composeAvailable = spawnSync("docker", ["compose", "version"]).status === 0;
const fixture = mkdtempSync(join(tmpdir(), "groovenet-storybook-compose-"));
after(() => rmSync(fixture, { recursive: true, force: true }));
for (const file of [
  "docker-compose.yml",
  "docker-compose.prod.yml",
  "docker-compose.local.yml",
  "docker-compose.dev.yml",
  "docker-compose.worktree.yml",
  "docker-compose.mac.yml",
]) {
  copyFileSync(join(root, file), join(fixture, file));
}
// Compose 2.x still checks service env_file existence with --no-env-resolution.
// Provide an empty fixture instead of requiring or reading the checkout's .env.
writeFileSync(join(fixture, ".env"), "");

function compose(overrides, environment = {}) {
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        "/dev/null",
        "-f",
        "docker-compose.yml",
        ...overrides.flatMap((file) => ["-f", file]),
        "config",
        "--no-env-resolution",
        "--format",
        "json",
      ],
      {
        cwd: fixture,
        // Use fixture configuration, never the caller's credentials or .env.
        // docker-compose.prod.yml's volumes require these (groovenet#538); the
        // value is irrelevant here, only that interpolation has something to use.
        env: {
          PATH: process.env.PATH,
          POSTGRES_PASSWORD: "storybook-test",
          PROD_DB_DATA_VOLUME: "storybook-test",
          PROD_MUSIC_DATA_VOLUME: "storybook-test",
          PROD_DB_DUMPS_VOLUME: "storybook-test",
          PROD_DISCOGS_EXPORTS_VOLUME: "storybook-test",
          PROD_REDIS_DATA_VOLUME: "storybook-test",
          PROD_COOKIE_DATA_VOLUME: "storybook-test",
          PROD_ALBUM_COVERS_VOLUME: "storybook-test",
          PROD_ESSENTIA_DATA_VOLUME: "storybook-test",
          ...environment,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  ).services.app;
}

for (const overrides of [
  [],
  ["docker-compose.prod.yml"],
  ["docker-compose.local.yml"],
  ["docker-compose.prod.yml", "docker-compose.worktree.yml"],
]) {
  test(
    `packaged Storybook is visible with ${overrides.join(", ") || "base Compose"}`,
    { skip: !composeAvailable },
    () => {
      const app = compose(overrides, { STORYBOOK_STATIC_DIR: "/tmp/stale-storybook" });
      assert.equal(app.build.target, "runner");
      assert.equal(app.environment.STORYBOOK_URL, "/storybook/index.html");
      for (const volume of app.volumes) {
        assert.ok(
          !"/app/public/storybook".startsWith(`${volume.target}/`) &&
            volume.target !== "/app/public/storybook",
          `Mount at ${volume.target} hides the packaged Storybook bundle`,
        );
      }
    },
  );
}

for (const overrides of [
  [],
  ["docker-compose.prod.yml"],
  ["docker-compose.dev.yml", "docker-compose.worktree.yml"],
]) {
  test(
    `preserves the runtime URL override with ${overrides.join(", ") || "base Compose"}`,
    { skip: !composeAvailable },
    () => {
      assert.equal(
        compose(overrides, { STORYBOOK_URL: "https://ui.example.com/components/" }).environment
          .STORYBOOK_URL,
        "https://ui.example.com/components/",
      );
    },
  );
}

test(
  "an explicitly empty URL still hides the card in production",
  { skip: !composeAvailable },
  () => {
    assert.equal(
      compose(["docker-compose.prod.yml"], { STORYBOOK_URL: "" }).environment.STORYBOOK_URL,
      "",
    );
  },
);

test(
  "an explicitly empty URL still hides the card in development",
  { skip: !composeAvailable },
  () => {
    assert.equal(
      compose(["docker-compose.dev.yml"], { STORYBOOK_URL: "" }).environment.STORYBOOK_URL,
      "",
    );
  },
);

test(
  "development uses the separate server without a stale Storybook mount",
  { skip: !composeAvailable },
  () => {
    const app = compose([
      "docker-compose.dev.yml",
      "docker-compose.worktree.yml",
      "docker-compose.mac.yml",
    ]);
    assert.equal(app.build.target, "dev");
    assert.match(app.command.join(" "), /node scripts\/ensure-dev-deps\.mjs/);
    // Contracts and client are host-built and mounted read-only (#747): the
    // container must never rewrite their node_modules on the host.
    assert.doesNotMatch(app.command.join(" "), /rm -rf|ln -sfn/);
    assert.match(app.command.join(" "), /build\/index\.js/);
    for (const pkg of ["groovenet-contracts", "groovenet-client"]) {
      const mount = app.volumes.find((volume) => volume.target === `/packages/${pkg}`);
      assert.equal(mount?.type, "bind");
      assert.equal(mount?.read_only, true);
    }
    const packageDeps = app.volumes.find((volume) => volume.target === "/packages/node_modules");
    assert.equal(packageDeps?.type, "volume");
    assert.equal(packageDeps?.read_only, true);
    assert.equal(app.environment.STORYBOOK_URL, "http://localhost:6006");
    assert.ok(app.volumes.some((volume) => volume.target === "/app" && volume.type === "bind"));
    assert.ok(!app.volumes.some((volume) => volume.target === "/app/public/storybook"));
  },
);
