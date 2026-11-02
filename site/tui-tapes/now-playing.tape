# The hero: Now playing over the queue, as the player opens.
Output .out/now-playing.mp4
Source config.tape
Hide
Type "bash player.sh now-playing"
Enter
Wait+Screen@30s /in queue/
Wait+Screen@30s /BPM/
Sleep 1s
Show
Screenshot .out/now-playing.png
Sleep 100ms
