# OwnTone is GPL-2.0; this image is built from the pinned upstream source plus
# terminal-v1.patch. Keep both available when distributing a derived image.
FROM alpine:3.22 AS build
RUN apk add --no-cache alsa-lib-dev autoconf automake avahi-dev bison confuse-dev \
    curl curl-dev flex g++ gawk gcc gettext-dev gnutls-dev gperf json-c-dev \
    libevent-dev libgcrypt-dev libplist-dev libsodium-dev libtool libunistring-dev \
    libwebsockets-dev libxml2-dev make protobuf-c-dev sqlite-dev ffmpeg-dev patch
WORKDIR /source
RUN curl -fsSL https://codeload.github.com/owntone/owntone-server/tar.gz/d6fb3edf5831de38134ebd92fcf09a730ddd37aa -o source.tar.gz \
    && echo 'b2c391e25295ea9d598dba70e23dcbe31635ae38f36ac570aa61f7c803d98f98  source.tar.gz' | sha256sum -c - \
    && tar -xzf source.tar.gz --strip-components=1 && rm source.tar.gz
COPY terminal-v1.patch /source/terminal-v1.patch
RUN patch -p1 < terminal-v1.patch \
    && autoreconf -fi -I /usr/share/gettext/m4 \
    && ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var \
       --disable-install_systemd --disable-install_user --disable-webinterface \
    && make -j2 && make DESTDIR=/output install \
    && (cd src/libairptp && ./configure --prefix=/usr --enable-daemon && make -j2 && make DESTDIR=/output install) \
    && rm -rf /output/var && make clean

FROM alpine:3.22
RUN apk add --no-cache alsa-lib avahi confuse curl dbus ffmpeg gnutls json-c \
    libevent libgcrypt libplist libsodium libunistring libuuid libwebsockets libxml2 protobuf-c sqlite-libs
COPY --from=build /output/ /
# Corresponding source and patch are included for reproducibility/distribution.
COPY --from=build /source/ /usr/src/owntone/
ENTRYPOINT ["/usr/sbin/owntone", "-f", "-c", "/etc/owntone.conf"]
