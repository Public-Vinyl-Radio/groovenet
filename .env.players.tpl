# Optional server players. Only deployed to a host already opted in with .env.players.
# Contains references only; render with op run and my-collection-search/scripts/render-player-env.mjs.
PLAYER_API_KEY=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_API_KEY
PLAYER_LIBRARY_FRIEND_ID=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_LIBRARY_FRIEND_ID
PLAYER_ENGINE_A_PASSWORD=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_ENGINE_A_PASSWORD
PLAYER_ENGINE_B_PASSWORD=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_ENGINE_B_PASSWORD
PLAYER_LAN_INTERFACE=enp170s0
PLAYER_AUDIO_MOUNT=music_data
# Optional HA settings are inherited from the calling environment and rendered when set:
# PLAYER_HA_URL, PLAYER_HA_TOKEN, PLAYER_HA_ENTITIES_JSON, PLAYER_HA_SENDERS_JSON.
# Keep them in the deployment environment; unset values default to disabled/empty maps.
