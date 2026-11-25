#!/usr/bin/env bash
# Self-test for the installer's helpers and the bundle builder (#1072): plain
# assertions, no Docker, no network. The helpers run under `sh` (dash on Debian
# and Ubuntu, the shell `curl | sh` uses there) by sourcing install.sh with
# GROOVENET_INSTALL_SOURCE_ONLY set.
#   scripts/install/unit_test.sh
# shellcheck disable=SC2015,SC2016 # assertions chain on purpose; snippets expand in the inner sh
set -euo pipefail

# Only fake keys explicitly supplied by cases below may enter this test.
unset TS_AUTHKEY

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="$root/site/public/install.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0

pass() { echo "ok - $1"; }
fail() {
  echo "FAIL - $1"
  fails=$((fails + 1))
}
assert_eq() { [[ "$2" == "$3" ]] && pass "$1" || fail "$1: expected [$2], got [$3]"; }

# sh_run SNIPPET: run it in a POSIX sh that has install.sh's functions.
sh_run() {
  local shell="${TEST_SH:-sh}"
  GROOVENET_INSTALL_SOURCE_ONLY=1 "$shell" -c ". '$installer'; $1" 2>&1
}

# --- version_lt ------------------------------------------------------------
lt() { sh_run "version_lt $1 $2 && echo yes || echo no"; }
assert_eq "v0.3.9 < v0.3.10 (numeric, not lexical)" yes "$(lt v0.3.9 v0.3.10)"
assert_eq "v0.3.20 < v0.3.19 is no" no "$(lt v0.3.20 v0.3.19)"
assert_eq "equal is not less" no "$(lt v1.2.3 v1.2.3)"
assert_eq "v0.9.0 < v1.0.0" yes "$(lt v0.9.0 v1.0.0)"
assert_eq "a sha- tag never counts as older" no "$(lt v0.3.1 sha-abc1234)"
assert_eq "an empty current tag never counts" no "$(lt v0.3.1 "''")"

# --- env_set / env_get / env_quote -------------------------------------------
env="$tmp/.env"
(
  umask 077
  printf '# comment KEY=ignored\nKEY=old\nOTHER=keep\nEMPTY=\n' >"$env"
)
sh_run "env_set '$env' KEY new; env_set '$env' ADDED 'two words'; env_set '$env' EMPTY filled"
assert_eq "env_set replaces in place" new "$(sh_run "env_get '$env' KEY")"
assert_eq "env_set leaves others alone" keep "$(sh_run "env_get '$env' OTHER")"
assert_eq "env_set appends a missing key, quoted" "two words" "$(sh_run "env_get '$env' ADDED")"
assert_eq "env_set quotes values that need it" "ADDED='two words'" "$(grep '^ADDED=' "$env")"
assert_eq "commented assignments are not matched" 1 "$(grep -c '^# comment KEY=ignored$' "$env")"
assert_eq "env_set keeps mode 600" 600 "$(stat -c '%a' "$env" 2>/dev/null || stat -f '%Lp' "$env")"
sh_run "env_set '$env' DOLLAR 'a\$b#c\\d'"
assert_eq "\$, # and backslash are kept literally in single quotes" 'DOLLAR='"'"'a$b#c\d'"'" "$(grep '^DOLLAR=' "$env")"
assert_eq "plain tokens stay unquoted" "TOKEN=abcDEF123._-:/@+=" "$(sh_run "env_set '$env' TOKEN 'abcDEF123._-:/@+='; grep '^TOKEN=' '$env'")"
assert_eq "a single quote is refused" yes "$(sh_run "(env_set '$env' Q \"it's\") >/dev/null 2>&1 && echo no || echo yes")"
sh_run "env_fill '$env' KEY other; env_fill '$env' EMPTY2 ''; env_fill '$env' FRESH fresh"
assert_eq "env_fill does not overwrite a value" new "$(sh_run "env_get '$env' KEY")"
assert_eq "env_fill sets a missing key" fresh "$(sh_run "env_get '$env' FRESH")"
assert_eq "env_fill with no value adds nothing" 0 "$(grep -c '^EMPTY2=' "$env")"

# --- profiles ----------------------------------------------------------------
assert_eq "profiles are de-duplicated, in order" "downloads,fingerprint" "$(sh_run "normalise_profiles ' downloads fingerprint downloads'")"
assert_eq "an invalid profile name is refused" yes "$(sh_run "(normalise_profiles 'Bad;rm') >/dev/null 2>&1 && echo no || echo yes")"

# --- argument parsing ----------------------------------------------------------
parse() { sh_run "parse_args $1; $2"; }
assert_eq "--flag value and --flag=value are equal" "v0.3.20 /a/b" "$(parse '--version v0.3.20 --dir=/a/b' 'echo "$OPT_VERSION $OPT_DIR"')"
assert_eq "--profile repeats and splits on commas" "downloads fingerprint all" "$(parse '--profile downloads,fingerprint --profile all' 'echo $OPT_PROFILES')"
assert_eq "--non-interactive is recorded" 1 "$(parse '--non-interactive' 'echo $NONINTERACTIVE')"
assert_eq "--import and --no-import" "yes no" "$(parse '--import' 'printf "%s " $OPT_IMPORT'; parse '--no-import' 'echo $OPT_IMPORT')"
assert_eq "credentials from flags" "dj tok" "$(parse '--discogs-username dj --discogs-token tok' 'echo "$IN_DISCOGS_USERNAME $IN_DISCOGS_TOKEN"')"
assert_eq "an unknown option is an error" yes "$(sh_run "(parse_args --nope) >/dev/null 2>&1 && echo no || echo yes")"
assert_eq "a missing value is an error" yes "$(sh_run "(parse_args --dir) >/dev/null 2>&1 && echo no || echo yes")"
assert_eq "a value on a switch is an error" yes "$(sh_run "(parse_args --yes=1) >/dev/null 2>&1 && echo no || echo yes")"
assert_eq "--help prints usage and exits 0" 0 "$(sh_run "(parse_args --help) >/dev/null 2>&1; echo \$?")"
assert_eq "environment credentials are read" "envtok" "$(DISCOGS_USER_TOKEN=envtok sh_run 'echo $IN_DISCOGS_TOKEN')"
assert_eq "a flag beats the environment" "flagtok" "$(DISCOGS_USER_TOKEN=envtok sh_run "parse_args --discogs-token flagtok; echo \$IN_DISCOGS_TOKEN")"

validate() { sh_run "NONINTERACTIVE=1; parse_args $1; (validate_options) >/dev/null 2>&1 && echo ok || echo bad"; }
assert_eq "--version vX.Y.Z accepted" ok "$(validate '--version v0.3.19')"
assert_eq "--version without v accepted" ok "$(validate '--version 0.3.19')"
assert_eq "--version latest refused" bad "$(validate '--version latest')"
assert_eq "--port out of range refused" bad "$(validate '--port 70000')"
assert_eq "--project-name with a slash refused" bad "$(validate '--project-name a/b')"
assert_eq "--audio-dir that does not exist refused" bad "$(validate '--audio-dir /nonexistent/zzz')"
assert_eq "--audio-dir relative refused" bad "$(validate '--audio-dir rel')"
assert_eq "--audio-dir existing accepted" ok "$(validate "--audio-dir $tmp")"
assert_eq "no terminal and no --non-interactive refuses" yes \
  "$(GROOVENET_INSTALL_SOURCE_ONLY=1 python3 -c 'import os,sys; os.setsid(); os.execvp("sh", ["sh","-c",sys.argv[1]])' \
    ". '$installer'; (validate_options) >/dev/null 2>&1 && echo no || echo yes" </dev/null 2>&1 | tail -n 1)"

# --- random and checksums -------------------------------------------------------
assert_eq "random_hex 24 is 48 hex chars" 48 "$(sh_run 'random_hex 24' | tr -d '\n' | wc -c | tr -d ' ')"
pw1="$(sh_run 'random_hex 24')"
pw2="$(sh_run 'random_hex 24')"
[[ "$pw1" != "$pw2" ]] && pass "random_hex differs per call" || fail "random_hex repeated itself"

# --- bundle builder and the installer's bundle checks ------------------------------
bundle_dir="$tmp/bundle"
"$root/scripts/install/build-bundle.sh" v9.8.7 "$bundle_dir" >/dev/null
tarball="$bundle_dir/groovenet-compose-v9.8.7.tar.gz"
members="$(tar -tzf "$tarball" | sort | tr '\n' ' ')"
assert_eq "bundle holds exactly the five files" ".env.example bundle.env docker-compose.images.yml docker-compose.local.yml docker-compose.yml " "$members"
x="$tmp/x"
mkdir "$x"
tar -xzf "$tarball" -C "$x"
assert_eq "bundle.env names the version" "GROOVENET_VERSION=v9.8.7" "$(grep '^GROOVENET_VERSION=' "$x/bundle.env")"
assert_eq "images overlay is pinned" 7 "$(grep -c '\${IMAGE_TAG:-v9.8.7}' "$x/docker-compose.images.yml")"
assert_eq "no unpinned latest remains" 0 "$(grep -c 'IMAGE_TAG:-latest' "$x/docker-compose.images.yml")"
assert_eq "docker-compose.yml is the repo's own" "" "$(diff "$root/docker-compose.yml" "$x/docker-compose.yml")"
assert_eq ".env.example is the repo's own" "" "$(diff "$root/.env.example" "$x/.env.example")"
"$root/scripts/install/build-bundle.sh" v9.8.7 "$tmp/bundle2" >/dev/null
assert_eq "the archive is reproducible" "" "$(diff "$tarball" "$tmp/bundle2/groovenet-compose-v9.8.7.tar.gz")"
assert_eq "the .sha256 file matches the archive" "$(cut -d' ' -f1 "$tarball.sha256")" "$(sh_run "sha256_of '$tarball'")"
assert_eq "a good checksum verifies" ok "$(sh_run "(verify_checksum '$tarball' '$tarball.sha256') >/dev/null 2>&1 && echo ok || echo bad")"
printf '%064d  x\n' 0 >"$tmp/zero.sha256"
assert_eq "a wrong checksum is refused" bad "$(sh_run "(verify_checksum '$tarball' '$tmp/zero.sha256') >/dev/null 2>&1 && echo ok || echo bad")"
assert_eq "member check accepts the bundle" ok "$(sh_run "(check_bundle_members '$tarball') >/dev/null 2>&1 && echo ok || echo bad")"
mkdir "$tmp/evil"
cp "$x"/.env.example "$x"/bundle.env "$x"/docker-compose*.yml "$tmp/evil/"
echo x >"$tmp/evil/extra.sh"
tar -czf "$tmp/evil.tar.gz" -C "$tmp/evil" .env.example bundle.env docker-compose.images.yml docker-compose.local.yml docker-compose.yml extra.sh
assert_eq "an extra member is refused" bad "$(sh_run "(check_bundle_members '$tmp/evil.tar.gz') >/dev/null 2>&1 && echo ok || echo bad")"
tar -czf "$tmp/short.tar.gz" -C "$tmp/evil" bundle.env
assert_eq "a missing member is refused" bad "$(sh_run "(check_bundle_members '$tmp/short.tar.gz') >/dev/null 2>&1 && echo ok || echo bad")"
assert_eq "build-bundle rejects 'latest'" bad "$("$root/scripts/install/build-bundle.sh" latest "$tmp/n" >/dev/null 2>&1 && echo ok || echo bad)"
assert_eq "build-bundle accepts a sha- tag" ok "$("$root/scripts/install/build-bundle.sh" sha-5029ad7 "$tmp/n" >/dev/null 2>&1 && echo ok || echo bad)"

# --- final summary: identify skipped capabilities without exposing key values ---
summary_dir="$tmp/summary"
mkdir -p "$summary_dir"
printf 'OPENAI_API_KEY=\nYOUTUBE_API_KEY=\n' >"$summary_dir/.env"
summary() { sh_run "DIR='$summary_dir'; APP_PORT_FINAL=3000; IMAGE_TAG_FINAL=v1.0.0; CHANGED=1; FRESH=1; PREVIOUS_TAG=; print_summary"; }
summary_out=$(summary)
assert_eq "summary names the exact .env path" yes "$(printf '%s' "$summary_out" | grep -Fq "$summary_dir/.env" && echo yes || echo no)"
assert_eq "summary explains local suggestions" yes "$(printf '%s' "$summary_out" | grep -q 'Skipped:.*OPENAI_API_KEY.*local model' && echo yes || echo no)"
assert_eq "summary explains YouTube needs a key" yes "$(printf '%s' "$summary_out" | grep -q 'Skipped:.*YOUTUBE_API_KEY.*no local fallback' && echo yes || echo no)"
printf 'OPENAI_API_KEY=secret-openai\nYOUTUBE_API_KEY=secret-youtube\n' >"$summary_dir/.env"
summary_out=$(summary)
assert_eq "configured keys are not called skipped or printed" no "$(printf '%s' "$summary_out" | grep -Eq 'Skipped:|secret-' && echo yes || echo no)"
printf 'OPENAI_API_KEY=secret-openai\nYOUTUBE_API_KEY=\n' >"$summary_dir/.env"
assert_eq "only the missing key is listed" 1 "$(summary | grep -c 'Skipped:')"

# --- Tailscale: flags and full installer with fake host commands -----------------
assert_eq "Tailscale defaults" "groovenet 0" "$(sh_run 'echo "$OPT_TS_HOSTNAME $OPT_TS_SSH"')"
assert_eq "Tailscale flags" "fake-key decks 1" "$(parse '--tailscale-auth-key=fake-key --tailscale-hostname decks --tailscale-ssh' 'echo "$IN_TS_AUTHKEY $OPT_TS_HOSTNAME $OPT_TS_SSH"')"
assert_eq "TS_AUTHKEY is captured and removed from child environment" "env-key unset" "$(TS_AUTHKEY=env-key sh_run 'echo "$IN_TS_AUTHKEY ${TS_AUTHKEY-unset}"')"
assert_eq "Tailscale flag beats environment" flag-key "$(TS_AUTHKEY=env-key parse '--tailscale-auth-key flag-key' 'echo "$IN_TS_AUTHKEY"')"
assert_eq "missing Tailscale key value refused" yes "$(sh_run '(parse_args --tailscale-auth-key) >/dev/null 2>&1 && echo no || echo yes')"
assert_eq "bad Tailscale hostname refused" bad "$(validate '--tailscale-hostname bad/name')"
assert_eq "empty Tailscale hostname refused" bad "$(validate '--tailscale-hostname=')"
public_out=$(sh_run '(parse_args --public)' || true)
assert_eq "public refusal names both blockers" yes "$(printf '%s' "$public_out" | grep -q '#569.*#1074' && echo yes || echo no)"
assert_eq "bundle binds only to loopback" '      - "127.0.0.1:${APP_PORT:-3000}:3000"' "$(grep '3000.*3000' "$x/docker-compose.local.yml")"

fake="$tmp/fake"
mkdir -p "$fake/bin" "$fake/state"
export FAKE_STATE="$fake/state"
cat >"$fake/tailscale" <<'STUB'
#!/bin/sh
set -eu
case "$*" in
  'status --json')
    if [ -f "$FAKE_STATE/joined" ]; then
      printf '{"BackendState":"Running","Self":{"DNSName":"decks.example.ts.net."}}\n'
    else
      echo '{"BackendState":"NeedsLogin"}'
      exit 1
    fi ;;
  'serve status --json') cat "$FAKE_STATE/serve.json" ;;
  up*)
    echo up >>"$FAKE_STATE/mutations"
    printf '%s\n' "$@" >"$FAKE_STATE/up-args"
    for arg in "$@"; do
      case $arg in file:*)
        keyfile=${arg#file:}
        [ "$(cat "$keyfile")" = fake-secret-sentinel ]
        stat -c '%a' "$keyfile" 2>/dev/null >"$FAKE_STATE/key-mode" || stat -f '%Lp' "$keyfile" >"$FAKE_STATE/key-mode"
        echo fake-secret-sentinel >&2 # malicious/noisy CLI must not leak it
        ;; esac
    done
    [ ! -f "$FAKE_STATE/fail-join" ] || exit 1
    touch "$FAKE_STATE/joined" ;;
  'serve --bg --https=443 --yes http://127.0.0.1:3123')
    echo serve >>"$FAKE_STATE/mutations"
    [ ! -f "$FAKE_STATE/fail-serve" ] || exit 1
    echo '{"TCP":{"443":{"HTTPS":true}},"Web":{"decks.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3123"}}}}}' >"$FAKE_STATE/serve.json" ;;
  'set --ssh=true') echo ssh >>"$FAKE_STATE/mutations" ;;
  *) echo 'unexpected Tailscale invocation' >&2; exit 1 ;;
esac
STUB
cat >"$fake/bin/docker" <<'STUB'
#!/bin/sh
case "$*" in
  'compose version') echo 'Docker Compose fake' ;;
  *'config --profiles') printf 'downloads\nanalysis\noptimize\nfingerprint\nall\n' ;;
  *'up -d'*) echo up >>"$FAKE_STATE/docker-up" ;;
esac
STUB
cat >"$fake/bin/curl" <<'STUB'
#!/bin/sh
# Only health is expected: bundle is local, no import or network allowed.
case "$*" in *'/api/health') exit 0 ;; *) echo 'unexpected network request' >&2; exit 1 ;; esac
STUB
cat >"$fake/bin/ufw" <<'STUB'
#!/bin/sh
[ "$*" = status ] || exit 1
cat "$FAKE_STATE/ufw"
STUB
chmod +x "$fake/tailscale" "$fake/bin/"*
printf '{}\n' >"$FAKE_STATE/serve.json"
printf 'Status: active\n3123/tcp ALLOW Anywhere\n3123/tcp (v6) ALLOW Anywhere (v6)\n' >"$FAKE_STATE/ufw"
ts_dir="$tmp/tailnet-install"
ts_run() {
  PATH="$fake/bin:$PATH" TS_AUTHKEY=fake-secret-sentinel sh_run "
    detect_platform() { OS=Linux; ARCH=x86_64; }
    can_be_root() { return 0; }
    have() { if [ \"\$1\" = tailscale ]; then [ -x '$fake/bin/tailscale' ]; else command -v \"\$1\" >/dev/null 2>&1; fi; }
    as_root() { \"\$@\"; }
    install_tailscale_linux() { echo package >>\"\$FAKE_STATE/mutations\"; cp '$fake/tailscale' '$fake/bin/tailscale'; }
    main --non-interactive --bundle '$tarball' --dir '$ts_dir' --port 3123 --tailscale-hostname decks $1
  "
}
first_out=$(ts_run '--tailscale-ssh')
assert_eq "first run joins and serves HTTPS" yes "$(printf '%s' "$first_out" | grep -q 'Open:.*https://decks.example.ts.net' && echo yes || echo no)"
assert_eq "firewall public rules produce warning" yes "$(printf '%s' "$first_out" | grep -q 'UFW has allow/limit rules' && echo yes || echo no)"
assert_eq "package, join and serve each happen once" "package up serve " "$(tr '\n' ' ' <"$FAKE_STATE/mutations")"
assert_eq "SSH is explicitly opted in" yes "$(grep -qx -- '--ssh' "$FAKE_STATE/up-args" && echo yes || echo no)"
assert_eq "auth key file has mode 600" 600 "$(cat "$FAKE_STATE/key-mode")"
keypath=$(sed -n 's/^file://p' "$FAKE_STATE/up-args")
assert_eq "temporary key removed" no "$([[ -e "$keypath" ]] && echo yes || echo no)"
assert_eq "key never appears in output or installed files" no "$( { printf '%s' "$first_out"; cat "$ts_dir"/.* "$ts_dir"/*.yml 2>/dev/null; } | grep -q fake-secret-sentinel && echo yes || echo no)"
before_env=$(cksum <"$ts_dir/.env")
second_out=$(ts_run '--tailscale-ssh')
assert_eq "rerun reports no changes" yes "$(printf '%s' "$second_out" | grep -q 'Nothing changed' && echo yes || echo no)"
assert_eq "rerun preserves env" "$before_env" "$(cksum <"$ts_dir/.env")"
assert_eq "rerun does not install, join, enable SSH or serve again" "package up serve " "$(tr '\n' ' ' <"$FAKE_STATE/mutations")"
# Existing marker retains tailnet mode without supplying the expired/one-use key.
third_out=$(ts_run '--tailscale-auth-key=')
assert_eq "upgrade without key keeps tailnet URL" yes "$(printf '%s' "$third_out" | grep -q 'https://decks.example.ts.net' && echo yes || echo no)"
# A separate fresh install must not opt in to SSH by default.
original_ts_dir=$ts_dir
ts_dir="$tmp/tailnet-no-ssh"
rm "$FAKE_STATE/joined"
ts_run '' >"$tmp/no-ssh.out"
assert_eq "fresh install leaves Tailscale SSH off" no "$(grep -qx -- '--ssh' "$FAKE_STATE/up-args" && echo yes || echo no)"
assert_eq "separate fresh install has no key in env" no "$(grep -q fake-secret-sentinel "$ts_dir/.env" && echo yes || echo no)"
ts_dir=$original_ts_dir
# Join failure must suppress even a CLI that echoes the key on stderr.
rm "$FAKE_STATE/joined"
touch "$FAKE_STATE/fail-join"
failed_out=$(ts_run '' || true)
assert_eq "join error is actionable" yes "$(printf '%s' "$failed_out" | grep -q 'Tailscale join failed' && echo yes || echo no)"
assert_eq "join error does not leak the key" no "$(printf '%s' "$failed_out" | grep -q fake-secret-sentinel && echo yes || echo no)"
rm "$FAKE_STATE/fail-join"
touch "$FAKE_STATE/joined"
echo '{"AllowFunnel":{"decks.example.ts.net:443":true}}' >"$FAKE_STATE/serve.json"
funnel_out=$(ts_run '' || true)
assert_eq "public Funnel is refused" yes "$(printf '%s' "$funnel_out" | grep -q 'Funnel is enabled' && echo yes || echo no)"
echo '{}' >"$FAKE_STATE/serve.json"
touch "$FAKE_STATE/fail-serve"
serve_out=$(ts_run '' || true)
assert_eq "Serve failure does not wait for a prompt" yes "$(printf '%s' "$serve_out" | grep -q 'Tailscale Serve failed' && echo yes || echo no)"
assert_eq "inactive UFW is warned about" yes "$(printf 'Status: inactive\n' >"$FAKE_STATE/ufw"; PATH="$fake/bin:$PATH" sh_run 'as_root() { "$@"; }; check_host_firewall' | grep -q 'UFW is inactive' && echo yes || echo no)"
assert_eq "no Tailscale prints tunnel even without SSH_CONNECTION" yes "$(SSH_CONNECTION='' summary | grep -q 'ssh -L 3000:localhost:3000 user@host' && echo yes || echo no)"

echo
if ((fails > 0)); then
  echo "$fails failure(s)"
  exit 1
fi
echo "all passed"
