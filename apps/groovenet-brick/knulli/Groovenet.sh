#!/bin/sh
# Knulli Ports entry. No power daemon, network repair, or firmware configuration.
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
state="/userdata/system/configs/groovenet-brick"
mkdir -p "$state"
if [ ! -f "$state/config" ]; then
  printf '%s\n' 'Groovenet: provision configs/groovenet-brick/config; see INSTALL.md' >&2
  exit 1
fi
set -a
. "$state/config"
set +a
export XDG_CONFIG_HOME="$state" XDG_DATA_HOME="$state" XDG_CACHE_HOME="$state/cache"
export LD_LIBRARY_PATH="$here/groovenet-brick/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# Replace rather than accumulate logs; never print configuration or credentials.
cd "$here/groovenet-brick"
exec ./groovenet-brick --platform knulli --mode live --font "$here/groovenet-brick/assets/DejaVuSans.ttf" > "$state/preview.log" 2>&1
