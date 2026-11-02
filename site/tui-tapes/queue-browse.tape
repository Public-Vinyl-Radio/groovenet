# The optional GIF: the cursor walks down the queue and back, the paused track unchanged.
Output .out/queue-browse.mp4
Source config.tape
Hide
Type "bash player.sh queue-browse"
Enter
Wait+Screen@30s /in queue/
Wait+Screen@30s /BPM/
Sleep 500ms
Show
Sleep 800ms
Down 1
Sleep 400ms
Down 1
Sleep 400ms
Down 1
Sleep 400ms
Down 1
Sleep 400ms
Down 1
Sleep 800ms
Up 5
Sleep 1s
