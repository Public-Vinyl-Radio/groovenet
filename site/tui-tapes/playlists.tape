# Playlists, filtered to one fixed playlist (FLOW STATE, 175), its preview open.
Output .out/playlists.mp4
Source config.tape
Hide
Type "bash player.sh playlists"
Enter
Wait+Screen@30s /in queue/
Type "l"
Wait+Screen@15s /FLOW STATE/
Type "/"
Sleep 300ms
Type "flow state"
Sleep 300ms
Enter
Wait+Screen@15s /59 tracks/
Sleep 2s
Show
Screenshot .out/playlists.png
Sleep 100ms
