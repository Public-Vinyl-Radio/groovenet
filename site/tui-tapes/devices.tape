# Outputs: the local daemon's mpv devices. These are the capturing machine's own.
Output .out/devices.mp4
Source config.tape
Hide
Type "bash player.sh devices"
Enter
Wait+Screen@30s /in queue/
Type "d"
Wait+Screen@15s /Autoselect device/
Sleep 1s
Show
Screenshot .out/devices.png
Sleep 100ms
