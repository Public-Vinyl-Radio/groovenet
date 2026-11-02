#!/usr/bin/env bash
# Each tape's entry point: `bash player.sh <shot> [player options]` opens the
# player TUI against the run's isolated home, never ~/.groovenet. The
# site-tui-screenshots recipe exports TUI_HOME, TUI_OUT and GROOVENET_BIN.
set -euo pipefail
shot="$1"
shift
export HOME="$TUI_HOME" XDG_CONFIG_HOME="$TUI_HOME/.config"
# xterm.js has no Kitty graphics: keep the ART placeholder and report where it
# is, so the cover is composited in afterwards.
export GROOVENET_TUI_ART=off GROOVENET_TUI_ART_SLOTS="$TUI_OUT/$shot.slots.json"
clear
exec node "$GROOVENET_BIN" player "$@"
