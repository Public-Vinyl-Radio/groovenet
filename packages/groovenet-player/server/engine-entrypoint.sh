#!/bin/sh
set -eu
umask 077
: "${PLAYER_ENGINE_PASSWORD:?Set an engine admin password}"
: "${PLAYER_ENGINE_INTERFACE:?Set the Debian LAN interface}"
: "${PLAYER_ENGINE_NAME:?Set a distinct engine name}"
: "${PLAYER_ENGINE_PORT:?Set a distinct engine API port}"
: "${PLAYER_ENGINE_WS_PORT:?Set a distinct engine WebSocket port}"
# These values are written into a configuration file, never interpreted as code.
case "$PLAYER_ENGINE_PASSWORD" in *[!a-zA-Z0-9_-]*|'') echo 'Use a hex/base64url engine password' >&2; exit 1;; esac
case "$PLAYER_ENGINE_INTERFACE" in *[!a-zA-Z0-9_.:-]*|'') exit 1;; esac
case "$PLAYER_ENGINE_NAME" in *[!a-zA-Z0-9_-]*|'') exit 1;; esac
case "$PLAYER_ENGINE_PORT:$PLAYER_ENGINE_WS_PORT" in *[!0-9:]*|:*|*:) exit 1;; esac
if [ ! -r /dev/shm/airptp_shm ]; then
  echo "Shared airptpd memory is unavailable; start the clock and share its IPC namespace" >&2
  exit 1
fi
mkdir -p /var/cache/owntone /run/dbus
# The engine drops to nobody; it must traverse the system-bus directory.
chmod 0755 /run/dbus
chown nobody /var/cache/owntone
cat > /tmp/server-player.conf <<CONF
general {
 uid = "nobody"
 admin_password = "$PLAYER_ENGINE_PASSWORD"
 db_path = "/var/cache/owntone/library.db"
 cache_dir = "/var/cache/owntone"
 logfile = "/dev/stderr"
 loglevel = log
 trusted_networks = { "localhost" }
 websocket_port = $PLAYER_ENGINE_WS_PORT
 speaker_autoselect = no
}
library {
 name = "$PLAYER_ENGINE_NAME"
 port = $PLAYER_ENGINE_PORT
 directories = { "/srv/media" }
 clear_queue_on_stop_disable = true
 pipe_autostart = false
}
audio { type = "disabled" }
mpd { port = 0 }
CONF
cat > /etc/avahi/avahi-daemon.conf <<CONF
[server]
allow-interfaces=$PLAYER_ENGINE_INTERFACE
[publish]
disable-publishing=yes
CONF
rm -f /run/dbus/pid /run/dbus/dbus.pid /run/avahi-daemon/pid
dbus-uuidgen --ensure
dbus-daemon --system --fork
avahi-daemon --daemonize --no-drop-root
exec /usr/sbin/owntone -f -c /tmp/server-player.conf
