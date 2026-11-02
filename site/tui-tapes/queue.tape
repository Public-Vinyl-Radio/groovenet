# The queue, its cursor five entries below the paused track.
Output .out/queue.mp4
Source config.tape
Hide
Type "bash player.sh queue"
Enter
Wait+Screen@30s /in queue/
Wait+Screen@30s /BPM/
Down 5
Wait+Screen@10s /6\/40/
Sleep 1s
Show
Screenshot .out/queue.png
Sleep 100ms
