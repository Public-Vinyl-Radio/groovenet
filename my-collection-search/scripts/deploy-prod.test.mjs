import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function deployment({
  players = false,
  template = false,
  base = true,
  failBuild = false,
  profilesLine,
  shellProfiles,
  hostEnv,
  missingImage = false,
  shellEnv = {},
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "groovenet-prod-"));
  try {
    const scripts = join(root, "my-collection-search/scripts");
    const bin = join(root, "bin");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(bin);
    mkdirSync(join(root, "my-collection-search/migrations"));
    writeFileSync(join(root, "my-collection-search/migrations/123_players.js"), "");
    copyFileSync(new URL("./deploy-prod.sh", import.meta.url), join(scripts, "deploy-prod.sh"));
    const extra = profilesLine === undefined ? "" : `${profilesLine}\n`;
    if (base) writeFileSync(join(root, ".env"), `POSTGRES_PASSWORD=collection-secret\n${extra}`);
    if (hostEnv !== undefined) writeFileSync(join(root, ".env.host"), hostEnv);
    if (players)
      writeFileSync(join(root, ".env.players"), "PLAYER_API_KEY=player-secret\n", { mode: 0o600 });
    if (template) writeFileSync(join(root, ".env.tpl"), `POSTGRES_PASSWORD=op://example\n${extra}`);
    writeFileSync(join(bin, "git"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    // A fake op only removes its wrapper arguments, then runs fake Docker.
    writeFileSync(join(bin, "op"), '#!/bin/sh\nshift 4\nexec "$@"\n', { mode: 0o755 });
    writeFileSync(
      join(bin, "docker"),
      `#!/bin/sh
printf '%s [profiles=%s]\\n' "$*" "$COMPOSE_PROFILES" >> "$DEPLOY_TEST_LOG"
case "$*" in
  *"image inspect"*) exit "$DEPLOY_TEST_IMAGE_STATUS" ;;
  *"build player-clock player-worker"*) exit "$DEPLOY_TEST_BUILD_STATUS" ;;
  *"SELECT EXISTS"*) echo t ;;
esac
`,
      { mode: 0o755 },
    );
    const log = join(root, "calls");
    const result = spawnSync("bash", [join(scripts, "deploy-prod.sh"), "sha-1234567"], {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        MIN_FREE_GB: "0",
        DEPLOY_TEST_LOG: log,
        DEPLOY_TEST_BUILD_STATUS: failBuild ? "1" : "0",
        DEPLOY_TEST_IMAGE_STATUS: missingImage ? "1" : "0",
        ...shellEnv,
        ...(shellProfiles === undefined ? {} : { COMPOSE_PROFILES: shellProfiles }),
      },
      encoding: "utf8",
    });
    return { ...result, calls: readFileSync(log, "utf8").trim().split("\n"), root };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const template of [false, true]) {
  test(`retains ordinary deployment without players (template=${template})`, () => {
    const run = deployment({ template, base: !template });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.calls.some((call) => call.includes("up -d --remove-orphans")));
    for (const call of run.calls) {
      assert.ok(!call.includes(".env.players") && !call.includes("docker-compose.players.yml"));
      assert.ok(call.endsWith("[profiles=all]"), call);
      assert.ok(!call.includes("build player-clock player-worker"));
    }
  });
  test(`includes players throughout deployment (template=${template})`, () => {
    const run = deployment({ players: true, template, base: !template });
    assert.equal(run.status, 0, run.stderr);
    for (const call of run.calls) {
      assert.ok(call.includes(`--env-file ${run.root}/.env.players`));
      assert.ok(!call.includes("--profile"));
      assert.ok(call.endsWith("[profiles=all,players]"), call);
      assert.ok(call.includes("-p dj-playlist"));
      assert.ok(call.includes("-f docker-compose.players.yml"));
      assert.ok(!call.includes("player-secret") && !call.includes("collection-secret"));
    }
    const build = run.calls.findIndex((call) => call.includes("build player-clock player-worker"));
    const up = run.calls.findIndex((call) => call.includes("up -d db redis"));
    assert.ok(build >= 0 && build < up);
    assert.ok(run.calls.at(-1).includes("up -d --remove-orphans [profiles="));
    assert.ok(!run.calls.find((call) => call.includes(" pull ")).includes("player-worker"));
  });
}

const profileCases = [
  ["a .env line", { profilesLine: "COMPOSE_PROFILES=all,lossless" }, "all,lossless,players"],
  [
    "a quoted, exported line (last one wins)",
    { profilesLine: 'COMPOSE_PROFILES=old\nexport COMPOSE_PROFILES="all,lossless"' },
    "all,lossless,players",
  ],
  [
    "a shell override",
    { shellProfiles: "analysis", profilesLine: "COMPOSE_PROFILES=all" },
    "analysis,players",
  ],
  ["an empty shell override", { shellProfiles: "" }, "players"],
  ["players already listed", { profilesLine: "COMPOSE_PROFILES=players,all" }, "players,all"],
];
for (const template of [false, true])
  for (const [name, options, expected] of profileCases)
    test(`players join the profile list: ${name} (template=${template})`, () => {
      const run = deployment({ players: true, template, base: !template, ...options });
      assert.equal(run.status, 0, run.stderr);
      for (const call of run.calls) {
        assert.ok(!call.includes("--profile"), call);
        assert.ok(call.endsWith(`[profiles=${expected}]`), call);
      }
    });

// docker-compose.yml interpolates COMPOSE_PROFILES into download-worker, which
// enables the lossless wrapper URL from it; --profile flags leave it empty.
test("every compose call's environment carries the full list, including lossless", () => {
  for (const template of [false, true]) {
    const run = deployment({
      players: true,
      template,
      base: !template,
      profilesLine: "COMPOSE_PROFILES=all,lossless",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.calls.length > 0);
    for (const call of run.calls) assert.match(call, /\[profiles=all,lossless,players\]$/);
  }
});

test("players enabled with no profiles line defaults to all,players", () => {
  const run = deployment({ players: true });
  assert.ok(run.calls.every((call) => call.endsWith("[profiles=all,players]")));
});

test("without players, an env file line and a shell override are honoured unchanged", () => {
  const file = deployment({ profilesLine: "COMPOSE_PROFILES=all,lossless" });
  assert.ok(file.calls.every((call) => call.endsWith("[profiles=all,lossless]")));
  const shell = deployment({ shellProfiles: "analysis" });
  assert.ok(shell.calls.every((call) => call.endsWith("[profiles=analysis]")));
});

const hostCases = [
  [
    "host over .env",
    { hostEnv: "COMPOSE_PROFILES=all,lossless\n", profilesLine: "COMPOSE_PROFILES=analysis" },
    "all,lossless",
    ".env.host",
  ],
  [
    "shell over host",
    { hostEnv: "COMPOSE_PROFILES=all\n", shellProfiles: "analysis" },
    "analysis",
    "shell",
  ],
  ["empty shell over host", { hostEnv: "COMPOSE_PROFILES=all\n", shellProfiles: "" }, "", "shell"],
  [
    "host without a profiles line falls to .env",
    { hostEnv: "OTHER=1\n", profilesLine: "COMPOSE_PROFILES=analysis" },
    "analysis",
    ".env",
  ],
  ["no host file falls to the default", {}, "all", "default"],
  [
    "quoted host line with players",
    { hostEnv: "export COMPOSE_PROFILES='all,lossless'\n", players: true },
    "all,lossless,players",
    ".env.host",
  ],
];
for (const template of [false, true])
  for (const [name, options, expected, source] of hostCases)
    test(`.env.host profile precedence: ${name} (template=${template})`, () => {
      const run = deployment({ template, base: !template, ...options });
      assert.equal(run.status, 0, run.stderr);
      for (const call of run.calls) assert.ok(call.endsWith(`[profiles=${expected}]`), call);
      assert.match(
        run.stdout,
        new RegExp(
          `==> Compose profiles: ${expected || "<none>"} \\(from [^)]*${source.replace(".", "\\.")}[^)]*\\)`,
        ),
      );
    });

test(".env.host is passed to every compose call as an extra env file, after .env", () => {
  const run = deployment({ hostEnv: "COMPOSE_PROFILES=all\n", players: true });
  assert.equal(run.status, 0, run.stderr);
  for (const call of run.calls) {
    const base = call.indexOf(`--env-file ${run.root}/.env `);
    const host = call.indexOf(`--env-file ${run.root}/.env.host`);
    const players = call.indexOf(`--env-file ${run.root}/.env.players`);
    assert.ok(base >= 0 && base < host && host < players, call);
  }
});

test("without .env.host no extra env file is passed", () => {
  const run = deployment();
  assert.ok(run.calls.every((call) => !call.includes(".env.host")));
});

test(".env.host is read as data, never executed", () => {
  const run = deployment({ hostEnv: "COMPOSE_PROFILES=all\n$(touch pwned)\nFOO=`touch pwned`\n" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.stdout.includes("pwned"));
});

test("lossless with the wrapper image present deploys and checks the default image", () => {
  const run = deployment({ hostEnv: "COMPOSE_PROFILES=all,lossless\n" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(
    run.calls.some((call) => call.startsWith("image inspect wrapper-v2:1.0.0-local-amd64")),
  );
});

for (const [name, options, image] of [
  ["default", { hostEnv: "COMPOSE_PROFILES=all,lossless\n" }, "wrapper-v2:1.0.0-local-amd64"],
  [
    "from .env.host",
    { hostEnv: 'COMPOSE_PROFILES=lossless\nGAMDL_WRAPPER_IMAGE="w:host"\n' },
    "w:host",
  ],
  ["from .env", { profilesLine: "COMPOSE_PROFILES=lossless\nGAMDL_WRAPPER_IMAGE=w:env" }, "w:env"],
  [
    "from the shell",
    {
      hostEnv: "COMPOSE_PROFILES=lossless\nGAMDL_WRAPPER_IMAGE=w:host\n",
      shellEnv: { GAMDL_WRAPPER_IMAGE: "w:shell" },
    },
    "w:shell",
  ],
])
  test(`a missing wrapper image stops the deploy before pulling anything (${name})`, () => {
    const run = deployment({ ...options, missingImage: true });
    assert.equal(run.status, 1);
    assert.match(run.stdout, new RegExp(`wrapper image ${image} is not on this host`));
    assert.equal(run.calls.length, 1, run.calls.join("\n"));
    assert.ok(run.calls[0].startsWith(`image inspect ${image}`));
  });

test("a missing wrapper image does not matter without the lossless profile", () => {
  const run = deployment({ hostEnv: "COMPOSE_PROFILES=all\n", missingImage: true });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.every((call) => !call.startsWith("image inspect")));
});

test("an image build failure stops deployment before touching running services", () => {
  const run = deployment({ players: true, failBuild: true });
  assert.equal(run.status, 1);
  assert.ok(!run.calls.some((call) => call.includes(" up ") || call.includes(" run ")));
});

test("player-only settings can augment a deployment without a base env file", () => {
  const run = deployment({ players: true, base: false });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.every((call) => call.includes(".env.players")));
});

function remoteDeployment({
  optedIn = true,
  webOptedIn = false,
  validSecrets = true,
  validWebSecrets = true,
  setup = false,
  failCopy = false,
  sessionDays = "30",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "groovenet-op-deploy-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    const scripts = join(root, "my-collection-search/scripts");
    mkdirSync(scripts, { recursive: true });
    copyFileSync(
      new URL("./render-player-env.mjs", import.meta.url),
      join(scripts, "render-player-env.mjs"),
    );
    copyFileSync(
      new URL("../../.env.players.tpl", import.meta.url),
      join(root, ".env.players.tpl"),
    );
    copyFileSync(
      new URL("./render-player-web-env.mjs", import.meta.url),
      join(scripts, "render-player-web-env.mjs"),
    );
    copyFileSync(
      new URL("../../.env.player-web.tpl", import.meta.url),
      join(root, ".env.player-web.tpl"),
    );
    const justfile = readFileSync(new URL("../../justfile", import.meta.url), "utf8");
    const recipe = (
      setup
        ? justfile.split("player-web-setup:\n")[1].split("\ndeploy-prod-local:")[0]
        : justfile.split("deploy-prod-remote:\n")[1].split("\n# Pulls images")[0]
    )
      .replace(/^  /gm, "")
      .replaceAll("{{prod_host}}", "fixture-host")
      .replaceAll("{{prod_stack_dir}}", "/fixture")
      .replaceAll("{{tag}}", "sha-1234567")
      .replaceAll("{{mise_exec}}", "");
    const script = join(root, "deploy.sh");
    writeFileSync(script, recipe);
    const log = join(root, "calls");
    writeFileSync(
      join(bin, "ssh"),
      `#!/bin/sh
printf 'ssh %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
case "$*" in
  *"test -f /fixture/.env.player-web.op"*) exit "$DEPLOY_TEST_WEB_OPT_IN" ;;
  *"test -f "*) exit "$DEPLOY_TEST_OPT_IN" ;;
esac
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "op"),
      '#!/bin/sh\nprintf "op run\\n" >> "$DEPLOY_TEST_LOG"\nshift 4\nexec "$@"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "scp"),
      '#!/bin/sh\nprintf "scp\\n" >> "$DEPLOY_TEST_LOG"\n[ "$DEPLOY_TEST_COPY_FAIL" = "0" ] || exit 1\ncase "$2" in *".env.player-web") cp "$1" "$DEPLOY_TEST_WEB_CAPTURE" ;; *) cp "$1" "$DEPLOY_TEST_CAPTURE" ;; esac\n',
      { mode: 0o755 },
    );
    const capture = join(root, "captured.env");
    const webCapture = join(root, "captured-web.env");
    const result = spawnSync("bash", [script], {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        DEPLOY_TEST_LOG: log,
        DEPLOY_TEST_OPT_IN: optedIn ? "0" : "1",
        DEPLOY_TEST_WEB_OPT_IN: webOptedIn ? "0" : "1",
        DEPLOY_TEST_CAPTURE: capture,
        DEPLOY_TEST_WEB_CAPTURE: webCapture,
        DEPLOY_TEST_COPY_FAIL: failCopy ? "1" : "0",
        PLAYER_API_KEY: validSecrets ? "test-api-key-".repeat(5) : "short",
        PLAYER_LIBRARY_FRIEND_ID: "1",
        PLAYER_ENGINE_A_PASSWORD: "engine-a",
        PLAYER_ENGINE_B_PASSWORD: "engine-b",
        PLAYER_ENGINE_C_PASSWORD: "engine-c",
        PLAYER_WEB_ORIGIN: validWebSecrets ? "https://fixture.example" : "http://invalid",
        PLAYER_WEB_PASSPHRASE: "web-passphrase-".repeat(4),
        PLAYER_WEB_SESSION_SECRET: "web-signing-secret-".repeat(4),
        PLAYER_WEB_SESSION_DAYS: sessionDays,
      },
    });
    return {
      ...result,
      calls: readFileSync(log, "utf8"),
      rendered: !setup && optedIn && validSecrets && !failCopy ? readFileSync(capture, "utf8") : "",
      webRendered:
        result.status === 0 && (setup || webOptedIn) && validWebSecrets && validSecrets && !failCopy
          ? readFileSync(webCapture, "utf8")
          : "",
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("remote deployment refreshes opted-in player secrets from op before deploying", () => {
  const run = remoteDeployment();
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.includes("op run\nscp\nssh fixture-host chmod 600 /fixture/.env.players"));
  assert.ok(run.rendered.includes('PLAYER_API_KEY="test-api-key-'));
  assert.ok(run.rendered.includes('PLAYER_LIBRARY_FRIEND_ID="1"'));
  assert.ok(!run.calls.includes("test-api-key-"));
  assert.ok(run.calls.indexOf("scp") < run.calls.indexOf("git fetch"));
});

test("remote deployment leaves hosts without .env.players opted out", () => {
  const run = remoteDeployment({ optedIn: false });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.calls.includes("op run") && !run.calls.includes("scp"));
  assert.ok(run.calls.includes("git fetch"));
});

test("invalid op credentials stop remote deployment before copying or restarting anything", () => {
  const run = remoteDeployment({ validSecrets: false });
  assert.equal(run.status, 1);
  assert.ok(!run.calls.includes("scp") && !run.calls.includes("git fetch"));
  assert.match(run.stderr, /at least 32 characters/);
});

test("opted-in web settings refresh from op during normal deployment without leaking the worker key", () => {
  const run = remoteDeployment({ webOptedIn: true });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.webRendered.includes('PLAYER_WEB_ORIGIN="https://fixture.example"'));
  assert.ok(run.webRendered.includes('PLAYER_WEB_SESSION_DAYS="30"'));
  assert.ok(
    !run.webRendered.includes("PLAYER_API_KEY") && !run.webRendered.includes("test-api-key-"),
  );
  assert.ok(run.calls.includes("ssh fixture-host chmod 600 /fixture/.env.player-web"));
  assert.equal(run.calls.split("op run").length - 1, 2);
  for (const secret of ["web-passphrase-", "web-signing-secret-", "test-api-key-"])
    assert.ok(!run.calls.includes(secret) && !run.stdout.includes(secret));
});

test("invalid web settings preserve the remote file and stop deployment", () => {
  const run = remoteDeployment({ webOptedIn: true, validWebSecrets: false });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /exact HTTPS origin/);
  assert.ok(
    !run.calls.includes("chmod 600 /fixture/.env.player-web") && !run.calls.includes("git fetch"),
  );
});

test("invalid session days stop deployment before copying web settings", () => {
  const run = remoteDeployment({ webOptedIn: true, sessionDays: "3651" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /PLAYER_WEB_SESSION_DAYS/);
  assert.ok(
    !run.calls.includes("chmod 600 /fixture/.env.player-web") && !run.calls.includes("git fetch"),
  );
});

test("one-time web setup uploads settings privately without deploying or restarting audio services", () => {
  const run = remoteDeployment({ setup: true });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.webRendered.includes("PLAYER_WEB_PASSPHRASE="));
  assert.equal(
    run.calls,
    "op run\nscp\nssh fixture-host chmod 600 /fixture/.env.player-web && touch /fixture/.env.player-web.op\n",
  );
  assert.match(run.stdout, /normal deployment/);
});

for (const changes of [{ validWebSecrets: false }, { failCopy: true }])
  test("failed web setup does not proceed to deployment or restart", () => {
    const run = remoteDeployment({ setup: true, ...changes });
    assert.equal(run.status, 1);
    assert.ok(!run.calls.includes("chmod 600") && !run.calls.includes("git fetch"));
  });

test("deploy preserves manual web settings without the explicit op marker", () => {
  const run = remoteDeployment();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.calls.split("op run").length - 1, 1);
  assert.ok(run.calls.includes("test -f /fixture/.env.player-web.op"));
  assert.ok(!run.calls.includes("chmod 600 /fixture/.env.player-web"));
  assert.equal(run.webRendered, "");
});

test("adds the local backup mount only when .env.host sets LOCAL_BACKUP_PATH", () => {
  const withDisk = deployment({ hostEnv: "LOCAL_BACKUP_PATH=/mnt/example\n" });
  assert.equal(withDisk.status, 0, withDisk.stderr);
  for (const call of withDisk.calls.filter((c) => c.includes("-f docker-compose.yml"))) {
    assert.ok(call.includes("-f docker-compose.local-backup.yml"), call);
  }

  for (const hostEnv of [undefined, "COMPOSE_PROFILES=all\n", "LOCAL_BACKUP_PATH=\n"]) {
    const without = deployment({ hostEnv });
    assert.equal(without.status, 0, without.stderr);
    assert.ok(!without.calls.some((call) => call.includes("docker-compose.local-backup.yml")));
  }
});
