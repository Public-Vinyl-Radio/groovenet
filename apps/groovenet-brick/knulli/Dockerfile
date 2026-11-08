# Frozen Debian cross-toolchain; firmware ABI qualification remains mandatory.
FROM debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN rm /etc/apt/sources.list.d/debian.sources && \
    printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261107T000000Z bookworm main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261107T000000Z bookworm-security main' > /etc/apt/sources.list && \
    dpkg --add-architecture arm64 && apt-get update && apt-get install -y --no-install-recommends \
    crossbuild-essential-arm64 cmake pkg-config libsdl2-dev:arm64 libsdl2-ttf-dev:arm64 \
    libcurl4-openssl-dev:arm64 libjson-c-dev:arm64 libpng-dev:arm64 libjpeg-dev:arm64 fonts-dejavu-core ca-certificates python3
WORKDIR /src
