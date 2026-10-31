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
    xcrun swift build --package-path "$package" -c release
    binary=$(xcrun swift build --package-path "$package" -c release --show-bin-path)
    mkdir -p "$app/Contents/MacOS"
    cp "$binary/groovenet-now-playing" "$app/Contents/MacOS/"
    cp "$package/Info.plist" "$app/Contents/Info.plist"
    codesign --force --sign - "$app"
    echo "Built $app. Run groovenet-now-playing to connect to the daemon."
    exit 0
fi

if [ ! -x "$app/Contents/MacOS/groovenet-now-playing" ]; then
    echo 'Build the optional macOS companion first: groovenet-now-playing --build' >&2
    exit 1
fi

if [ "${1:-}" = --remote ]; then
    if [ "$#" -ne 2 ] || [ -z "$2" ]; then
        echo 'Usage: groovenet-now-playing --remote PLAYER_ID' >&2
        exit 1
    fi
    remote="$package/../build/nowPlayingRemoteBin.js"
    if [ ! -f "$remote" ]; then
        echo 'Build the Node player package first: npm run build --workspace @groovenet/player' >&2
        exit 1
    fi
    exec node "$remote" --remote "$2" --helper "$app/Contents/MacOS/groovenet-now-playing"
fi
exec "$app/Contents/MacOS/groovenet-now-playing" "$@"
