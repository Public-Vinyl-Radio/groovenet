#!/usr/bin/env bash
# Draws a one-cell inverse frame around the whole terminal and records its
# size, for `tui-screenshots.mjs calibrate` to measure. No app involved.
clear
tput civis
read -r rows columns < <(stty size)
echo "{\"columns\": $columns, \"rows\": $rows}" > "$TUI_OUT/calibrate.size.json"
bar() { printf '\033[%d;1H\033[7m%*s\033[0m' "$1" "$columns" ""; }
bar 1
bar "$rows"
for ((row = 2; row < rows; row++)); do
  printf '\033[%d;1H\033[7m \033[0m\033[%d;%dH\033[7m \033[0m' "$row" "$row" "$columns"
done
sleep 60
