# Album search: one fixed album, its tracklist previewed beside the results.
Output .out/search.mp4
Source config.tape
Hide
Type "bash player.sh search"
Enter
Wait+Screen@30s /in queue/
Type "/"
Sleep 300ms
Type "mezzanine"
Sleep 300ms
Tab
Wait+Screen@15s /ALBUMS · 1\b/
Enter
Wait+Screen@15s /Inertia Creeps/
Sleep 1s
Show
Screenshot .out/search.png
Sleep 100ms
