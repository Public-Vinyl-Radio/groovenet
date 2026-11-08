# Experimental ABI baseline measured by #1095, not an official Knulli SDK.
FROM debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN rm /etc/apt/sources.list.d/debian.sources && \
    printf '%s\n' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261107T000000Z bookworm main' 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261107T000000Z bookworm-security main' > /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake pkg-config libsdl2-dev libsdl2-ttf-dev \
    libcurl4-openssl-dev libjson-c-dev libpng-dev libjpeg-dev fonts-dejavu-core ca-certificates python3
WORKDIR /src
