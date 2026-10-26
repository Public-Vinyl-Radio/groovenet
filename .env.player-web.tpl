# Optional web playback. Render with `just player-web-env` or upload with
# `just player-web-setup`; ordinary player-only installs do not read these fields.
PLAYER_WEB_ORIGIN=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_WEB_ORIGIN
PLAYER_WEB_PASSPHRASE=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_WEB_PASSPHRASE
PLAYER_WEB_SESSION_SECRET=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_WEB_SESSION_SECRET
# Set this 1Password field to 365 unless a different duration is wanted.
PLAYER_WEB_SESSION_DAYS=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_WEB_SESSION_DAYS
# Validation only: the worker key is never written to .env.player-web.
PLAYER_API_KEY=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_API_KEY
