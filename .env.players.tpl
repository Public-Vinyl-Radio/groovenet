# Optional server players. Only deployed to a host already opted in with .env.players.
# Contains references only; render with op run and my-collection-search/scripts/render-player-env.mjs.
PLAYER_API_KEY=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_API_KEY
PLAYER_ENGINE_A_PASSWORD=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_ENGINE_A_PASSWORD
PLAYER_ENGINE_B_PASSWORD=op://${GROOVENET_OP_VAULT:-Homelab}/${GROOVENET_OP_ITEM:-groovenet}/PLAYER_ENGINE_B_PASSWORD
PLAYER_LAN_INTERFACE=enp170s0
PLAYER_AUDIO_MOUNT=music_data
PLAYER_HA_ENTITIES_JSON={}
