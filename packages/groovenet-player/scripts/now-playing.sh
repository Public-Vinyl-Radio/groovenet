#!/bin/sh
set -eu

if [ "$(uname -s)" != Darwin ]; then
    echo 'Groovenet Now Playing requires macOS; daemon playback remains independent.' >&2
    exit 1
fi

version=$(sw_vers -productVersion)
if [ "${version%%.*}" -lt 13 ]; then
    echo 'Groovenet Now Playing requires macOS 13 or later; daemon playback remains independent.' >&2
    exit 1
fi

case "${1:-}" in
    --help|-h)
        echo 'Usage: groovenet-now-playing [--socket PATH | --remote PLAYER_ID]'
        echo '       groovenet-now-playing --build'
        echo
        echo 'With no flag, follows the now_playing_target CLI config key: a remote'
        echo 'player ID, or local (the default). Set it once with:'
        echo '       groovenet config set now_playing_target PLAYER_ID'
        exit 0
        ;;
esac

# Resolve the npm bin symlink before locating the bundled Swift sources.
script="$0"
while [ -L "$script" ]; do
    parent=$(cd -P "$(dirname "$script")" && pwd)
    link=$(readlink "$script")
    case "$link" in /*) script="$link" ;; *) script="$parent/$link" ;; esac
done
package=$(cd "$(dirname "$script")/../macos" && pwd)
app="$package/.build/Groovenet Now Playing.app"

if [ "${1:-}" = --build ]; then
    if ! xcrun --find swift >/dev/null 2>&1; then
        echo 'Install Xcode Command Line Tools (xcode-select --install), then retry --build.' >&2
        exit 1
    fi
    "$(dirname "$script")/build-now-playing-app.sh" "$package" "$package/.build"
    echo "Built $app. Run groovenet-now-playing to connect to the daemon."
    exit 0
fi

if [ ! -x "$app/Contents/MacOS/groovenet-now-playing" ]; then
    echo 'Build the optional macOS companion first: groovenet-now-playing --build' >&2
    exit 1
fi

# Target resolution (flags, then the now_playing_target config key, then local)
# lives in Node so this script never parses the config file.
entry="$package/../build/nowPlayingBin.js"
if [ ! -f "$entry" ]; then
    echo 'Build the Node player package first: npm run build --workspace @groovenet/player' >&2
    exit 1
fi
exec node "$entry" "$@" --helper "$app/Contents/MacOS/groovenet-now-playing"
