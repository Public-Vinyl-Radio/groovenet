# Shared by every tape (Source config.tape). The compositing script's cell
# metrics (scripts/tui-screenshots.mjs) are calibrated against exactly these
# numbers: change any of them and run `just site-tui-screenshots --calibrate`.
Set Shell bash
Set FontFamily "JetBrains Mono"
Set FontSize 30
Set LineHeight 1.0
Set LetterSpacing 0
Set Width 2260
Set Height 1672
Set Padding 30
Set TypingSpeed 0
Set CursorBlink false
# Mono dark from the site's palette: surface ground, white ink, the shadow grey
# for `gray` (the TUI's dim and shadow roles).
Set Theme { "name": "Groovenet Mono", "background": "#141414", "foreground": "#f2f2f2", "cursor": "#f2f2f2", "selection": "#404040", "black": "#141414", "red": "#e07a6e", "green": "#8fbf9a", "yellow": "#d9c27a", "blue": "#8fa8d9", "magenta": "#c49ad9", "cyan": "#8fc9c9", "white": "#bfbfbf", "brightBlack": "#6b6b6b", "brightRed": "#f09a8f", "brightGreen": "#a9d9b4", "brightYellow": "#ecd89a", "brightBlue": "#aac0ec", "brightMagenta": "#d9b4ec", "brightCyan": "#a9e0e0", "brightWhite": "#ffffff" }
