#!/bin/sh
# Groovenet installer (#1072).
#
#   curl -fsSL https://groovenet.publicvinylradio.com/install.sh | sh
#   curl -fsSL https://groovenet.publicvinylradio.com/install.sh | sh -s -- --help
#
# Or download it, read it, and run it by hand. It installs, or upgrades, a
# self-hosted Groovenet from the published release images: no checkout, no
# build. See --help for the flags and https://groovenet.publicvinylradio.com/docs/
# for the guide.
#
# What it does, in order:
#   1. finds Docker with Compose v2 (installs Docker Engine on Ubuntu/Debian
#      when missing; on macOS it stops and points at Docker Desktop/OrbStack)
#   2. downloads the release's compose bundle and verifies its checksum
#   3. writes DIR/.env (mode 600, random database password) on a first run, or
#      leaves it alone on a rerun apart from the image tag
#   4. docker compose up -d (migrations run first), waits for /api/health
#   5. optionally runs the first Discogs import, then prints the URL
#
# Everything is inside main(), called on the last line, so a download cut short
# runs nothing.
set -eu

REPO="Public-Vinyl-Radio/groovenet"
REPO_URL="https://github.com/$REPO"
DEFAULT_PROJECT="groovenet"
MARKER_NAME=".groovenet-install"
# The only members a bundle may contain. Anything else is refused.
BUNDLE_FILES=".env.example bundle.env docker-compose.images.yml docker-compose.local.yml docker-compose.yml"
# Services pinned to amd64 on ARM hosts (the images are amd64 only).
GROOVENET_SERVICES="app migrate essentia ga-service fingerprint-service fingerprint-set-worker download-worker"

# --- Output --------------------------------------------------------------------

say() { printf '%s\n' "$*"; }
info() { printf '\n==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install or upgrade Groovenet from the published release images.

Usage: install.sh [options]

Where it goes
  --dir PATH              Install directory. Default: /srv/groovenet on Linux
                          with root or sudo, otherwise ~/groovenet.
  --version vX.Y.Z        Install this release. Default: the latest release.
                          Older than what is installed is refused: migrations
                          only go forward.
  --profile NAME          Also run an optional service group. Repeat or
                          comma-separate: downloads, analysis, optimize,
                          fingerprint, all. Default: none (app, db, redis).
  --audio-dir PATH        Keep audio in this existing directory (a mounted
                          disk, say) instead of a Docker volume.
  --port N                Port on 127.0.0.1 for the app. Default: 3000.

Credentials (all optional; leave out what you do not use)
  --discogs-username NAME   or env DISCOGS_USERNAME
  --discogs-token TOKEN     or env DISCOGS_USER_TOKEN
  --openai-key KEY          or env OPENAI_API_KEY
  --youtube-key KEY         or env YOUTUBE_API_KEY
  --apple-music-team-id ID  or env APPLE_MUSIC_TEAM_ID
  --apple-music-key-id ID   or env APPLE_MUSIC_KEY_ID
  --apple-music-key-file P  or env APPLE_MUSIC_PRIVATE_KEY (the .p8 contents)
  A flag shows up in `ps` while the installer runs; prefer the environment.
  Credentials fill empty settings only. To change one later, edit DIR/.env.

Running
  --import / --no-import  Run (or skip) the first Discogs import once the app is
                          up. Default: ask when a terminal is available, skip
                          otherwise.
  --yes                   Answer yes to confirmations, such as installing Docker.
  --non-interactive       Never prompt; use flags, environment and defaults.
                          Implies --yes. Without it, the script needs a terminal.
  -h, --help              This text.

Advanced and testing
  --project-name NAME     Compose project name. Default: groovenet. It refuses a
                          project whose volumes are not from this install.
  --bundle PATH           Use a local groovenet-compose-*.tar.gz instead of
                          downloading one (checked against PATH.sha256 if present).
  --image-tag TAG         Run these images (a sha-<short> candidate, say) instead
                          of the bundle's release tag.

Rerunning the installer upgrades to the latest release and keeps .env and all
data. With nothing new to install it changes nothing.
EOF
}

# --- Small helpers -------------------------------------------------------------

have() { command -v "$1" >/dev/null 2>&1; }

# vX.Y.Z -> 1 when $1 < $2. Anything else (a sha- tag) compares as not-less.
version_lt() {
  case $1 in v[0-9]*.[0-9]*.[0-9]*) ;; *) return 1 ;; esac
  case $2 in v[0-9]*.[0-9]*.[0-9]*) ;; *) return 1 ;; esac
  _a=${1#v}
  _b=${2#v}
  _i=0
  while [ "$_i" -lt 3 ]; do
    _ai=$(printf '%s' "$_a" | cut -d. -f$((_i + 1)))
    _bi=$(printf '%s' "$_b" | cut -d. -f$((_i + 1)))
    [ "$_ai" -lt "$_bi" ] && return 0
    [ "$_ai" -gt "$_bi" ] && return 1
    _i=$((_i + 1))
  done
  return 1
}

# Read KEY's value from an env file, without surrounding quotes. Last one wins.
env_get() {
  _v=$(awk -v k="$2" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END { print v }' "$1")
  case $_v in
    \'*\') _v=${_v#\'}; _v=${_v%\'} ;;
    \"*\") _v=${_v#\"}; _v=${_v%\"} ;;
  esac
  printf '%s' "$_v"
}

# Quote a value for a Compose .env file. Plain values go as they are; anything
# else in single quotes, which Compose neither interpolates nor unescapes.
env_quote() {
  case $1 in
    *\'*) return 1 ;;
    *[!A-Za-z0-9._:/@+=,%-]*) printf "'%s'" "$1" ;;
    *) printf '%s' "$1" ;;
  esac
}

# Set KEY=VALUE in FILE: replace the assignment, or append one. The file keeps
# its mode (the temp file is created 600 next to it).
env_set() {
  _quoted=$(env_quote "$3") || die "the value for $2 contains a single quote; set it in $1 by hand"
  _tmp=$(mktemp "$1.XXXXXX")
  K=$2 V=$_quoted awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"] }
    index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$1" >"$_tmp"
  mv "$_tmp" "$1"
}

random_hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

sha256_of() {
  if have sha256sum; then
    sha256sum "$1" | cut -d' ' -f1
  elif have shasum; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= //'
  fi
}

# --- Terminal ------------------------------------------------------------------

# Prompts read /dev/tty, so they work under `curl | sh`, where stdin is the
# script itself.
have_tty() { (: </dev/tty) 2>/dev/null; }

# ask PROMPT: the answer is left in REPLY_VALUE.
ask() {
  printf '%s' "$1" >/dev/tty
  REPLY_VALUE=
  IFS= read -r REPLY_VALUE </dev/tty || true
}

ask_secret() {
  printf '%s' "$1" >/dev/tty
  REPLY_VALUE=
  stty -echo </dev/tty 2>/dev/null || true
  IFS= read -r REPLY_VALUE </dev/tty || true
  stty echo </dev/tty 2>/dev/null || true
  printf '\n' >/dev/tty
}

# confirm PROMPT DEFAULT(y|n): 0 for yes. --yes answers yes without asking.
confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  [ "$INTERACTIVE" = 1 ] || return 1
  if [ "$2" = y ]; then _hint="[Y/n]"; else _hint="[y/N]"; fi
  ask "$1 $_hint "
  case $REPLY_VALUE in
    [Yy]*) return 0 ;;
    [Nn]*) return 1 ;;
    *) [ "$2" = y ] ;;
  esac
}

# --- Arguments -----------------------------------------------------------------

OPT_VERSION=
OPT_DIR=
OPT_PROFILES=
OPT_AUDIO_DIR=
OPT_PORT=
OPT_PROJECT=
OPT_BUNDLE=
OPT_IMAGE_TAG=
OPT_IMPORT=ask
NONINTERACTIVE=0
ASSUME_YES=0
IN_DISCOGS_USERNAME=${DISCOGS_USERNAME:-}
IN_DISCOGS_TOKEN=${DISCOGS_USER_TOKEN:-}
IN_OPENAI_KEY=${OPENAI_API_KEY:-}
IN_YOUTUBE_KEY=${YOUTUBE_API_KEY:-}
IN_APPLE_TEAM_ID=${APPLE_MUSIC_TEAM_ID:-}
IN_APPLE_KEY_ID=${APPLE_MUSIC_KEY_ID:-}
IN_APPLE_KEY=${APPLE_MUSIC_PRIVATE_KEY:-}

parse_args() {
  while [ $# -gt 0 ]; do
    _opt=$1
    _val=
    _inline=0
    case $_opt in
      --*=*)
        _val=${_opt#*=}
        _opt=${_opt%%=*}
        _inline=1
        ;;
    esac
    case $_opt in
      --version | --dir | --profile | --audio-dir | --port | --project-name | --bundle | --image-tag | \
        --discogs-username | --discogs-token | --openai-key | --youtube-key | \
        --apple-music-team-id | --apple-music-key-id | --apple-music-key-file)
        if [ "$_inline" = 0 ]; then
          [ $# -ge 2 ] || die "$_opt needs a value"
          _val=$2
          shift
        fi
        ;;
      *)
        [ "$_inline" = 0 ] || die "$_opt does not take a value"
        ;;
    esac
    case $_opt in
      --version) OPT_VERSION=$_val ;;
      --dir) OPT_DIR=$_val ;;
      --profile) OPT_PROFILES="$OPT_PROFILES $(printf '%s' "$_val" | tr ',' ' ')" ;;
      --audio-dir) OPT_AUDIO_DIR=$_val ;;
      --port) OPT_PORT=$_val ;;
      --project-name) OPT_PROJECT=$_val ;;
      --bundle) OPT_BUNDLE=$_val ;;
      --image-tag) OPT_IMAGE_TAG=$_val ;;
      --discogs-username) IN_DISCOGS_USERNAME=$_val ;;
      --discogs-token) IN_DISCOGS_TOKEN=$_val ;;
      --openai-key) IN_OPENAI_KEY=$_val ;;
      --youtube-key) IN_YOUTUBE_KEY=$_val ;;
      --apple-music-team-id) IN_APPLE_TEAM_ID=$_val ;;
      --apple-music-key-id) IN_APPLE_KEY_ID=$_val ;;
      --apple-music-key-file)
        [ -r "$_val" ] || die "cannot read $_val"
        IN_APPLE_KEY=$(cat "$_val")
        ;;
      --import) OPT_IMPORT=yes ;;
      --no-import) OPT_IMPORT=no ;;
      --yes | -y) ASSUME_YES=1 ;;
      --non-interactive) NONINTERACTIVE=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $_opt (see --help)" ;;
    esac
    shift
  done
}

validate_options() {
  if [ -n "$OPT_VERSION" ]; then
    case $OPT_VERSION in v[0-9]*) ;; [0-9]*) OPT_VERSION=v$OPT_VERSION ;; esac
    printf '%s' "$OPT_VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' \
      || die "--version must look like v0.3.19, got: $OPT_VERSION"
  fi
  if [ -n "$OPT_PORT" ]; then
    printf '%s' "$OPT_PORT" | grep -Eq '^[0-9]+$' && [ "$OPT_PORT" -ge 1 ] && [ "$OPT_PORT" -le 65535 ] \
      || die "--port must be a number from 1 to 65535, got: $OPT_PORT"
  fi
  if [ -n "$OPT_PROJECT" ]; then
    printf '%s' "$OPT_PROJECT" | grep -Eq '^[a-z0-9][a-z0-9_-]*$' \
      || die "--project-name may use lowercase letters, digits, - and _ only, got: $OPT_PROJECT"
  fi
  if [ -n "$OPT_IMAGE_TAG" ]; then
    printf '%s' "$OPT_IMAGE_TAG" | grep -Eq '^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$' \
      || die "--image-tag is not a valid image tag: $OPT_IMAGE_TAG"
  fi
  if [ -n "$OPT_AUDIO_DIR" ]; then
    case $OPT_AUDIO_DIR in /*) ;; *) die "--audio-dir must be an absolute path, got: $OPT_AUDIO_DIR" ;; esac
    [ -d "$OPT_AUDIO_DIR" ] || die "--audio-dir $OPT_AUDIO_DIR is not an existing directory (mount the disk first)"
    case $OPT_AUDIO_DIR in *[:\ ]*) die "--audio-dir cannot contain a colon or a space" ;; esac
  fi
  if [ -n "$OPT_BUNDLE" ]; then
    [ -f "$OPT_BUNDLE" ] || die "--bundle $OPT_BUNDLE does not exist"
  fi
  if [ "$NONINTERACTIVE" = 1 ]; then
    ASSUME_YES=1
    INTERACTIVE=0
  elif have_tty; then
    INTERACTIVE=1
  else
    die "there is no terminal to ask questions on. Rerun with --non-interactive, passing credentials as flags or environment variables (see --help)."
  fi
}

# Profiles: normalise to a sorted-by-first-use, de-duplicated, comma list.
normalise_profiles() {
  _out=
  for _p in $1; do
    printf '%s' "$_p" | grep -Eq '^[a-z][a-z0-9_-]*$' || die "invalid profile name: $_p"
    case ",$_out," in *",$_p,"*) ;; *) _out=${_out:+$_out,}$_p ;; esac
  done
  printf '%s' "$_out"
}

# --- Platform and Docker -------------------------------------------------------

OS=
ARCH=
USE_SUDO=0

detect_platform() {
  OS=$(uname -s)
  ARCH=$(uname -m)
  case $OS in
    Linux | Darwin) ;;
    *) die "$OS is not supported. Groovenet installs on Linux, or on macOS with Docker already running." ;;
  esac
}

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

can_be_root() {
  [ "$(id -u)" = 0 ] && return 0
  have sudo || return 1
  sudo -n true 2>/dev/null && return 0
  [ "$INTERACTIVE" = 1 ]
}

docker_() {
  if [ "$USE_SUDO" = 1 ]; then sudo docker "$@"; else docker "$@"; fi
}

# Docker Engine from Docker's own apt repository, the documented route for
# Ubuntu and Debian: https://docs.docker.com/engine/install/ubuntu/
install_docker_linux() {
  [ -r /etc/os-release ] || die "cannot tell which Linux this is. Install Docker Engine from https://docs.docker.com/engine/install/ and rerun."
  # shellcheck disable=SC1091
  . /etc/os-release
  _id=${ID:-}
  case $_id in
    ubuntu | debian) _codename=${VERSION_CODENAME:-} ;;
    *)
      case " ${ID_LIKE:-} " in
        *" ubuntu "*) _id=ubuntu _codename=${UBUNTU_CODENAME:-} ;;
        *" debian "*) _id=debian _codename=${DEBIAN_CODENAME:-${VERSION_CODENAME:-}} ;;
        *) die "automatic Docker install covers Ubuntu and Debian, not ${PRETTY_NAME:-this system}. Install Docker Engine from https://docs.docker.com/engine/install/ and rerun." ;;
      esac
      ;;
  esac
  [ -n "$_codename" ] || die "cannot tell the release codename from /etc/os-release"
  can_be_root || die "installing Docker needs root. Rerun as root, or with sudo available."
  info "Installing Docker Engine and the Compose plugin from Docker's apt repository"
  as_root apt-get update -qq
  as_root apt-get install -y -qq ca-certificates curl
  as_root install -m 0755 -d /etc/apt/keyrings
  as_root curl -fsSL "https://download.docker.com/linux/$_id/gpg" -o /etc/apt/keyrings/docker.asc
  as_root chmod a+r /etc/apt/keyrings/docker.asc
  _arch=$(dpkg --print-architecture)
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
    "$_arch" "$_id" "$_codename" | as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
  as_root apt-get update -qq
  as_root apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  if have systemctl; then as_root systemctl enable --now docker || true; fi
}

ensure_docker() {
  info "Checking Docker"
  if ! have docker || ! docker compose version >/dev/null 2>&1; then
    if [ "$OS" = Darwin ]; then
      die "Docker with Compose v2 was not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop/) or OrbStack (https://orbstack.dev), start it, and rerun. The installer never installs Docker on a Mac."
    fi
    if have docker; then
      say "Docker is installed but has no Compose v2 plugin."
    else
      say "Docker is not installed."
    fi
    confirm "Install Docker Engine and the Compose plugin now?" y \
      || die "Docker is required. Install it (https://docs.docker.com/engine/install/) or rerun with --yes to let this script do it."
    install_docker_linux
    docker compose version >/dev/null 2>&1 || die "Docker was installed but 'docker compose' still does not work"
  fi
  if ! docker info >/dev/null 2>&1; then
    if [ "$OS" = Linux ] && have sudo && sudo -n docker info >/dev/null 2>&1; then
      USE_SUDO=1
      say "Using sudo for docker (this user is not in the docker group)."
    elif [ "$OS" = Linux ] && [ "$(id -u)" != 0 ] && have sudo && [ "$INTERACTIVE" = 1 ] && sudo docker info >/dev/null 2>&1; then
      USE_SUDO=1
      say "Using sudo for docker (this user is not in the docker group)."
    elif [ "$OS" = Darwin ]; then
      die "The Docker daemon is not running. Start Docker Desktop or OrbStack and rerun."
    else
      die "cannot reach the Docker daemon. Start it (systemctl start docker) or add this user to the docker group."
    fi
  fi
  say "$(docker compose version)"
}

# --- Directory, project, marker ------------------------------------------------

DIR=
PROJECT=
MARKER=

default_dir() {
  if [ "$OS" = Linux ] && can_be_root; then
    printf '%s' /srv/groovenet
  else
    printf '%s' "${HOME:?HOME is not set}/groovenet"
  fi
}

marker_get() { sed -n "s/^$2=//p" "$1" | tail -n 1; }

project_has_resources() {
  [ -n "$(docker_ ps -a -q --filter "label=com.docker.compose.project=$1" 2>/dev/null)" ] && return 0
  [ -n "$(docker_ volume ls -q --filter "label=com.docker.compose.project=$1" 2>/dev/null)" ]
}

# Decide DIR and PROJECT, and refuse to touch anything that is not ours.
resolve_install_target() {
  DIR=${OPT_DIR:-$(default_dir)}
  case $DIR in /*) ;; *) DIR=$(pwd)/$DIR ;; esac
  MARKER=$DIR/$MARKER_NAME
  FRESH=1

  if [ -f "$DIR/.env" ]; then
    [ -f "$MARKER" ] || die "$DIR/.env exists but was not written by this installer, so it is not adopted. Use another --dir, or remove it if it is a stale copy."
    PROJECT=$(marker_get "$MARKER" project)
    [ -n "$PROJECT" ] || die "$MARKER is damaged (no project name)"
    [ -z "$OPT_PROJECT" ] || [ "$OPT_PROJECT" = "$PROJECT" ] \
      || die "this install in $DIR is the Compose project '$PROJECT'; --project-name $OPT_PROJECT would orphan its data"
    FRESH=0
    return 0
  fi

  PROJECT=${OPT_PROJECT:-$DEFAULT_PROJECT}
  if project_has_resources "$PROJECT"; then
    if [ -f "$MARKER" ] && [ "$(marker_get "$MARKER" project)" = "$PROJECT" ]; then
      die "the Docker data for '$PROJECT' exists but $DIR/.env is gone, so the database password is lost. Restore .env from a backup rather than starting over."
    fi
    die "a Docker Compose project named '$PROJECT' already exists on this machine and is not this install (no $MARKER_NAME in $DIR). Installing would reuse its volumes. Pick another --dir or --project-name, or remove it with 'docker compose -p $PROJECT down' if you are sure it is unwanted."
  fi
  if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ] && [ ! -f "$MARKER" ]; then
    die "$DIR is not empty and is not a Groovenet install; refusing to write into it. Use another --dir."
  fi
}

make_dir() {
  [ -d "$DIR" ] && [ -w "$DIR" ] && return 0
  if ! mkdir -p "$DIR" 2>/dev/null; then
    can_be_root || die "cannot create $DIR and have no root access. Use --dir under your home directory."
    as_root mkdir -p "$DIR"
    as_root chown "$(id -u):$(id -g)" "$DIR"
  fi
}

# --- Bundle --------------------------------------------------------------------

WORK=
RESOLVED_VERSION=
BUNDLE_DIR=

fetch() { curl -fsSL --retry 3 --connect-timeout 15 "$@"; }

# The newest app release (vX.Y.Z). GitHub's "latest release" is not used: the
# repository also tags the CLI, client and others (groovenet-cli-v3.15.0), and a
# release of one of those can take the "latest" badge. The release feed lists
# every release newest first, needs no API token and has no rate limit.
latest_version() {
  _feed=$(curl -fsSL --retry 3 --connect-timeout 15 "$REPO_URL/releases.atom") \
    || die "could not reach GitHub to find the latest release"
  _tag=$(printf '%s\n' "$_feed" | grep -Eo 'releases/tag/v[0-9]+\.[0-9]+\.[0-9]+"' | head -n 1 | sed 's|releases/tag/||; s|"||')
  [ -n "$_tag" ] || die "could not find an app release (vX.Y.Z) in the release feed. Pass --version vX.Y.Z."
  printf '%s' "$_tag"
}

verify_checksum() { # file expected-hash-file
  _want=$(cut -d' ' -f1 "$2" | head -n 1)
  printf '%s' "$_want" | grep -Eq '^[0-9a-f]{64}$' || die "the checksum file $2 is malformed"
  _got=$(sha256_of "$1")
  [ "$_want" = "$_got" ] || die "checksum mismatch for $(basename "$1"): expected $_want, got $_got. Nothing was installed."
}

# Refuse any archive member that is not one of the known bundle files.
check_bundle_members() {
  _members=$(tar -tzf "$1") || die "$1 is not a readable tar.gz"
  for _m in $_members; do
    case " $BUNDLE_FILES " in *" $_m "*) ;; *) die "the bundle contains an unexpected file ($_m); refusing to unpack it" ;; esac
  done
  for _f in $BUNDLE_FILES; do
    case " $(printf '%s' "$_members" | tr '\n' ' ') " in *" $_f "*) ;; *) die "the bundle is missing $_f" ;; esac
  done
}

get_bundle() {
  BUNDLE_DIR=$WORK/bundle
  mkdir -p "$BUNDLE_DIR"
  if [ -n "$OPT_BUNDLE" ]; then
    _tarball=$OPT_BUNDLE
    info "Using local bundle $OPT_BUNDLE"
    if [ -f "$OPT_BUNDLE.sha256" ]; then
      verify_checksum "$OPT_BUNDLE" "$OPT_BUNDLE.sha256"
      say "Checksum verified."
    else
      warn "no $OPT_BUNDLE.sha256 next to the bundle, so it was not verified"
    fi
  else
    have curl || die "curl is required"
    RESOLVED_VERSION=${OPT_VERSION:-$(latest_version)}
    _name=groovenet-compose-$RESOLVED_VERSION.tar.gz
    info "Downloading $_name"
    _tarball=$WORK/$_name
    _code=$(curl -sSL --retry 3 --connect-timeout 15 -o "$_tarball" -w '%{http_code}' \
      "$REPO_URL/releases/download/$RESOLVED_VERSION/$_name") || die "could not download $_name"
    case $_code in
      200) ;;
      404) die "release $RESOLVED_VERSION has no install bundle, so it cannot be installed with this script. Bundles are attached to releases made after the installer shipped; pick a newer release, or use the manual steps in the docs." ;;
      *) die "downloading $_name failed (HTTP $_code)" ;;
    esac
    fetch -o "$_tarball.sha256" "$REPO_URL/releases/download/$RESOLVED_VERSION/$_name.sha256" \
      || die "the release has no checksum file for $_name, so it will not be installed"
    verify_checksum "$_tarball" "$_tarball.sha256"
    say "Checksum verified."
  fi
  check_bundle_members "$_tarball"
  tar -xzf "$_tarball" -C "$BUNDLE_DIR"
  _bundled=$(env_get "$BUNDLE_DIR/bundle.env" GROOVENET_VERSION)
  [ -n "$_bundled" ] || die "the bundle does not say which version it is"
  if [ -n "$RESOLVED_VERSION" ] && [ "$_bundled" != "$RESOLVED_VERSION" ]; then
    die "asked for $RESOLVED_VERSION but the bundle is $_bundled"
  fi
  RESOLVED_VERSION=$_bundled
}

# --- .env ----------------------------------------------------------------------

# Every key .env.example sets: a stray environment variable of the same name
# must not override the file, because the shell environment beats .env.
isolate_environment() {
  for _k in $(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' "$BUNDLE_DIR/.env.example") \
    COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES IMAGE_TAG REGISTRY APP_PORT; do
    unset "$_k" 2>/dev/null || true
  done
}

# Set KEY only when the file has no value for it.
env_fill() {
  [ -n "$3" ] || return 0
  [ -z "$(env_get "$1" "$2")" ] || return 0
  env_set "$1" "$2" "$3"
}

compose_file_list() {
  _list=docker-compose.yml:docker-compose.images.yml:docker-compose.local.yml
  [ -f "$DIR/docker-compose.platform.yml" ] && _list=$_list:docker-compose.platform.yml
  printf '%s' "$_list"
}

# The images are amd64 only. An ARM host (Apple silicon, a Pi) runs them under
# emulation, which is slower but works when Docker has it set up.
write_platform_override() {
  case $ARCH in
    arm64 | aarch64)
      warn "this is an ARM machine and the Groovenet images are amd64 only; they will run under emulation (slower)."
      _all=$(env POSTGRES_PASSWORD=x docker compose --project-directory "$BUNDLE_DIR" --profile '*' config --services 2>/dev/null) || _all=
      {
        echo "# Written by the installer: the images are amd64 only."
        echo "services:"
        for _s in $GROOVENET_SERVICES; do
          case " $(printf '%s' "$_all" | tr '\n' ' ') " in *" $_s "*) printf '  %s:\n    platform: linux/amd64\n' "$_s" ;; esac
        done
      } >"$DIR/docker-compose.platform.yml"
      ;;
    *) rm -f "$DIR/docker-compose.platform.yml" ;;
  esac
}

# --- Install -------------------------------------------------------------------

CHANGED=0
PREVIOUS_TAG=
IMAGE_TAG_FINAL=
APP_PORT_FINAL=3000

check_profiles() {
  [ -n "$1" ] || return 0
  _known=$(env POSTGRES_PASSWORD=x docker compose --project-directory "$BUNDLE_DIR" -f "$BUNDLE_DIR/docker-compose.yml" config --profiles 2>/dev/null) \
    || die "could not read the profiles from the bundle's compose file"
  _oldifs=$IFS
  IFS=,
  for _p in $1; do
    IFS=$_oldifs
    case " $(printf '%s' "$_known" | tr '\n' ' ') " in
      *" $_p "*) ;;
      *) die "unknown profile '$_p'. This release has: $(printf '%s' "$_known" | tr '\n' ' ')" ;;
    esac
    IFS=,
  done
  IFS=$_oldifs
}

install_files() {
  [ -f "$DIR/.env" ] && _before=$(cksum <"$DIR/.env") || _before=
  _fbefore=$(cat "$DIR"/docker-compose*.yml 2>/dev/null | cksum)
  for _f in docker-compose.yml docker-compose.images.yml docker-compose.local.yml .env.example; do
    cp "$BUNDLE_DIR/$_f" "$DIR/$_f.new"
    mv "$DIR/$_f.new" "$DIR/$_f"
  done
  write_platform_override
  _fafter=$(cat "$DIR"/docker-compose*.yml 2>/dev/null | cksum)
  [ "$_fbefore" = "$_fafter" ] || CHANGED=1

  IMAGE_TAG_FINAL=${OPT_IMAGE_TAG:-$RESOLVED_VERSION}
  _profiles=$(normalise_profiles "$OPT_PROFILES")
  check_profiles "$_profiles"

  if [ "$FRESH" = 1 ]; then
    ( umask 077; cp "$BUNDLE_DIR/.env.example" "$DIR/.env" )
    chmod 600 "$DIR/.env"
    env_set "$DIR/.env" COMPOSE_PROJECT_NAME "$PROJECT"
    env_set "$DIR/.env" POSTGRES_PASSWORD "$(random_hex 24)"
    # Compose builds the app's DATABASE_URL itself; the template's copy is a
    # placeholder with a fake password.
    env_set "$DIR/.env" DATABASE_URL ""
    ( umask 077; printf 'project=%s\ncreated=%s\n' "$PROJECT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$MARKER" )
    PREVIOUS_TAG=
  else
    PREVIOUS_TAG=$(env_get "$DIR/.env" IMAGE_TAG)
  fi

  env_set "$DIR/.env" IMAGE_TAG "$IMAGE_TAG_FINAL"
  env_set "$DIR/.env" COMPOSE_FILE "$(compose_file_list)"
  [ -z "$_profiles" ] || env_set "$DIR/.env" COMPOSE_PROFILES "$_profiles"
  [ -z "$OPT_PORT" ] || env_set "$DIR/.env" APP_PORT "$OPT_PORT"
  if [ -n "$OPT_AUDIO_DIR" ]; then
    env_set "$DIR/.env" APP_AUDIO_MOUNT "$OPT_AUDIO_DIR:/app/audio"
    env_set "$DIR/.env" WORKER_AUDIO_MOUNT "$OPT_AUDIO_DIR:/app/audio"
  fi

  collect_credentials
  env_fill "$DIR/.env" DISCOGS_USERNAME "$IN_DISCOGS_USERNAME"
  env_fill "$DIR/.env" DISCOGS_USER_TOKEN "$IN_DISCOGS_TOKEN"
  env_fill "$DIR/.env" OPENAI_API_KEY "$IN_OPENAI_KEY"
  env_fill "$DIR/.env" YOUTUBE_API_KEY "$IN_YOUTUBE_KEY"
  env_fill "$DIR/.env" APPLE_MUSIC_TEAM_ID "$IN_APPLE_TEAM_ID"
  env_fill "$DIR/.env" APPLE_MUSIC_KEY_ID "$IN_APPLE_KEY_ID"
  # The .env convention for the .p8 key is newlines written as \n.
  [ -z "$IN_APPLE_KEY" ] || env_fill "$DIR/.env" APPLE_MUSIC_PRIVATE_KEY "$(printf '%s' "$IN_APPLE_KEY" | awk 'BEGIN { ORS = "" } { if (NR > 1) printf "\\n"; print }')"

  _port=$(env_get "$DIR/.env" APP_PORT)
  APP_PORT_FINAL=${_port:-3000}

  _after=$(cksum <"$DIR/.env")
  [ "$_before" = "$_after" ] || CHANGED=1
}

# Ask only for what is missing, and only when a person is there to answer.
collect_credentials() {
  [ "$INTERACTIVE" = 1 ] || return 0
  _have_user=$IN_DISCOGS_USERNAME
  [ -n "$_have_user" ] || _have_user=$(env_get "$DIR/.env" DISCOGS_USERNAME)
  _have_token=$IN_DISCOGS_TOKEN
  [ -n "$_have_token" ] || _have_token=$(env_get "$DIR/.env" DISCOGS_USER_TOKEN)
  if [ -z "$_have_user" ] || [ -z "$_have_token" ]; then
    say ""
    say "Discogs lets Groovenet import your collection. Create a personal access token at"
    say "https://www.discogs.com/settings/developers. Press Enter to skip; add them to"
    say "$DIR/.env later."
    if [ -z "$_have_user" ]; then
      ask "Discogs username: "
      IN_DISCOGS_USERNAME=$REPLY_VALUE
    fi
    if [ -z "$_have_token" ]; then
      ask_secret "Discogs token (hidden): "
      IN_DISCOGS_TOKEN=$REPLY_VALUE
    fi
  fi
  if [ -z "$IN_OPENAI_KEY$IN_YOUTUBE_KEY" ] && [ -z "$(env_get "$DIR/.env" OPENAI_API_KEY)" ] && [ "$FRESH" = 1 ]; then
    say "Suggestions work without a key using the bundled local model."
    say "OpenAI is an optional quality upgrade; YouTube enrichment needs a YouTube key (no local fallback)."
    if confirm "Add OpenAI (quality upgrade) or YouTube (enrichment) keys now?" n; then
      ask_secret "OpenAI API key (hidden, Enter to skip): "
      IN_OPENAI_KEY=$REPLY_VALUE
      ask_secret "YouTube API key (hidden, Enter to skip): "
      IN_YOUTUBE_KEY=$REPLY_VALUE
    fi
  fi
}

check_downgrade() {
  [ "$FRESH" = 0 ] || return 0
  _current=$(env_get "$DIR/.env" IMAGE_TAG)
  _target=${OPT_IMAGE_TAG:-$RESOLVED_VERSION}
  if version_lt "$_target" "$_current"; then
    die "$DIR is on $_current; $_target is older. Database migrations only go forward, so the older images may not read the data. To go back, restore a backup into a fresh --dir."
  fi
}

dc() { ( cd "$DIR" && docker_ compose "$@" ); }

wait_for_health() {
  _url=http://127.0.0.1:$APP_PORT_FINAL
  info "Waiting for $_url/api/health"
  _deadline=$(($(date +%s) + ${GROOVENET_HEALTH_TIMEOUT:-300}))
  until curl -fsS --max-time 5 "$_url/api/health" >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$_deadline" ]; then
      say "The app did not become healthy in time. Recent logs:" >&2
      dc logs --tail 40 migrate app >&2 || true
      die "the app is not healthy. Inspect with: cd $DIR && docker compose logs"
    fi
    sleep 3
  done
  say "The app is up."
}

run_import() {
  _user=$(env_get "$DIR/.env" DISCOGS_USERNAME)
  _token=$(env_get "$DIR/.env" DISCOGS_USER_TOKEN)
  if [ -z "$_user" ] || [ -z "$_token" ]; then
    [ "$OPT_IMPORT" != yes ] || die "--import needs a Discogs username and token"
    return 0
  fi
  case $OPT_IMPORT in
    no) return 0 ;;
    yes) ;;
    *)
      if [ "$INTERACTIVE" = 1 ]; then
        confirm "Import the Discogs collection of $_user now? Large libraries take a while." y || { say "Skipped. Import later from the app, or rerun with --import."; return 0; }
      else
        say "Credentials are set; run the first import from the app, or rerun with --import."
        return 0
      fi
      ;;
  esac
  info "Importing the Discogs collection of $_user"
  _out=$WORK/import.out
  curl -fsSN --max-time "${GROOVENET_IMPORT_TIMEOUT:-3600}" -G --data-urlencode "username=$_user" \
    "http://127.0.0.1:$APP_PORT_FINAL/api/discogs" >"$_out" \
    || die "the import request failed. Last output: $(tail -c 400 "$_out" 2>/dev/null)"
  grep -q "Sync complete for" "$_out" || die "the import did not report completion. Last output: $(tail -c 600 "$_out")"
  say "$(grep 'Sync complete for' "$_out" | tail -n 1)"
}

write_marker_version() {
  # Record the installed tag in the marker for humans; .env stays the source of truth.
  _tmp=$(mktemp "$MARKER.XXXXXX")
  grep -v '^version=' "$MARKER" >"$_tmp" || true
  printf 'version=%s\n' "$IMAGE_TAG_FINAL" >>"$_tmp"
  mv "$_tmp" "$MARKER"
}

print_summary() {
  _url=http://127.0.0.1:$APP_PORT_FINAL
  say ""
  if [ "$CHANGED" = 0 ]; then
    say "Groovenet $IMAGE_TAG_FINAL is already installed and running. Nothing changed."
  elif [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG_FINAL" ]; then
    say "Groovenet upgraded from $PREVIOUS_TAG to $IMAGE_TAG_FINAL."
  elif [ "$FRESH" = 1 ]; then
    say "Groovenet $IMAGE_TAG_FINAL is installed and running."
  else
    say "Groovenet $IMAGE_TAG_FINAL is running; your settings were updated."
  fi
  say ""
  say "  Open:      $_url"
  say "  Directory: $DIR   (settings in .env, mode 600)"
  say "  Settings:  $DIR/.env (mode 600)"
  if [ -z "$(env_get "$DIR/.env" OPENAI_API_KEY)" ]; then
    say "  Skipped:   OPENAI_API_KEY — suggestions use the bundled local model."
  fi
  if [ -z "$(env_get "$DIR/.env" YOUTUBE_API_KEY)" ]; then
    say "  Skipped:   YOUTUBE_API_KEY — YouTube enrichment needs a YouTube key; no local fallback."
  fi
  say "  Logs:      cd $DIR && docker compose logs -f"
  say "  Upgrade:   run this installer again"
  if [ -n "${SSH_CONNECTION:-}" ]; then
    _host=$(printf '%s' "$SSH_CONNECTION" | awk '{ print $3 }')
    say ""
    say "The app listens on 127.0.0.1 only. From your own machine:"
    say "  ssh -L $APP_PORT_FINAL:127.0.0.1:$APP_PORT_FINAL <user>@${_host:-<this-server>}   then open http://localhost:$APP_PORT_FINAL"
  fi
}

cleanup() {
  [ -z "$WORK" ] || rm -rf "$WORK"
}

main() {
  parse_args "$@"
  validate_options
  detect_platform
  WORK=$(mktemp -d)
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  ensure_docker
  get_bundle
  isolate_environment
  resolve_install_target
  check_downgrade
  info "Installing Groovenet $RESOLVED_VERSION into $DIR (project $PROJECT)"
  make_dir
  install_files
  write_marker_version
  info "Starting Groovenet (database migrations run first)"
  dc up -d --quiet-pull --remove-orphans || die "docker compose up failed. See: cd $DIR && docker compose logs"
  wait_for_health
  run_import
  print_summary
}

[ -n "${GROOVENET_INSTALL_SOURCE_ONLY:-}" ] || main "$@"
