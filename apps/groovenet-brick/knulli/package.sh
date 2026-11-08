#!/bin/sh
set -eu
umask 022
cmake -DCMAKE_TOOLCHAIN_FILE=/src/knulli/toolchain.cmake -S /src -B /tmp/brick-build -DBUILD_TESTING=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/brick-build --parallel 2
version=$(cat /out/version.txt)
archive="groovenet-brick-$version-knulli-scarab-arm64.tar.gz"
stage=/tmp/brick-package
rm -rf "$stage"
mkdir -p "$stage/groovenet-brick/assets"
cp /tmp/brick-build/groovenet-brick "$stage/groovenet-brick/"
cp /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf "$stage/groovenet-brick/assets/"
cp /usr/share/doc/fonts-dejavu-core/copyright "$stage/groovenet-brick/assets/FONT-LICENSE"
cp /src/knulli/Groovenet.sh "$stage/Groovenet.sh"
cp /project-license "$stage/groovenet-brick/LICENSE"
cp /src/knulli/config.example "$stage/groovenet-brick/"
cp /src/knulli/README.md "$stage/groovenet-brick/INSTALL.md"
{
  echo "Groovenet Brick $version: Knulli Scarab 2026/05/11; see qualification evidence."
  cat /out/source-version.txt
  aarch64-linux-gnu-g++ --version
  aarch64-linux-gnu-g++ -dumpmachine
  dpkg-query -W
  readelf -l -d "$stage/groovenet-brick/groovenet-brick"
} > "$stage/groovenet-brick/BUILD.txt"
cd "$stage"
sha256sum Groovenet.sh groovenet-brick/groovenet-brick groovenet-brick/assets/* groovenet-brick/LICENSE groovenet-brick/config.example groovenet-brick/INSTALL.md groovenet-brick/BUILD.txt > groovenet-brick/SHA256SUMS
# Allowlist packaging: no host environment, private config, certificates or logs.
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -czf /out/"$archive" Groovenet.sh groovenet-brick
cd /out
sha256sum "$archive" > "$archive.sha256"
