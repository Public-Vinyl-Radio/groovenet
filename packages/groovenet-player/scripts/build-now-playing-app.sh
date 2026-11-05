#!/bin/sh
# Build and ad-hoc sign "Groovenet Now Playing.app".
#
# The one place the bundle is assembled: `now-playing.sh --build` and the
# release workflow both call it, so a local build and the released asset match.
#
# Usage: build-now-playing-app.sh PACKAGE_PATH OUTPUT_DIR [--universal] [--version X.Y.Z]
#
# The app lands in OUTPUT_DIR/Groovenet Now Playing.app. --universal builds
# arm64 and x86_64 slices. The version defaults to the @groovenet/player
# package version and is written to the bundle's Info.plist.
set -eu

usage() {
    echo 'Usage: build-now-playing-app.sh PACKAGE_PATH OUTPUT_DIR [--universal] [--version X.Y.Z]' >&2
    exit 2
}

universal=0
version=
count=0
while [ "$#" -gt 0 ]; do
    case "$1" in
        --universal) universal=1; shift ;;
        --version)
            [ "$#" -ge 2 ] || usage
            version=$2
            shift 2
            ;;
        -*) usage ;;
        *)
            count=$((count + 1))
            case "$count" in
                1) package=$1 ;;
                2) output=$1 ;;
                *) usage ;;
            esac
            shift
            ;;
    esac
done
[ "$count" -eq 2 ] || usage

if [ -z "$version" ]; then
    version=$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$package/../package.json")
fi
if [ -z "$version" ]; then
    echo "Could not read the package version from $package/../package.json; pass --version." >&2
    exit 1
fi

set -- --package-path "$package" -c release
if [ "$universal" -eq 1 ]; then
    set -- "$@" --arch arm64 --arch x86_64
fi

xcrun swift build "$@"
binary=$(xcrun swift build "$@" --show-bin-path)

app="$output/Groovenet Now Playing.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp "$binary/groovenet-now-playing" "$app/Contents/MacOS/"
cp "$package/Info.plist" "$app/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$version" "$app/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$version" "$app/Contents/Info.plist"
codesign --force --sign - "$app"
