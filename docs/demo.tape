# vhs script for portharbour demo.
# Run: vhs docs/demo.tape
# Produces: docs/demo.gif

Output docs/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 1280
Set Height 760
Set Padding 12
Set Theme "Synthwave 84"
Set TypingSpeed 60ms
Set PlaybackSpeed 1.0

Hide
Type "./target/release/portharbour --interval 600" Enter
Sleep 1500ms
Show

Sleep 3500ms

# cycle sort key a couple of times
Type "s" Sleep 1200ms
Type "s" Sleep 1200ms
Type "S" Sleep 1200ms

# filter to something common, then clear
Type "/"
Sleep 400ms
Type "node" Sleep 2000ms
Escape Sleep 1000ms

# toggle scope LISTEN -> ALL
Type "a" Sleep 2500ms
Type "a" Sleep 1500ms

# crank refresh rate
Type "+" Sleep 600ms
Type "+" Sleep 600ms
Type "+" Sleep 1500ms

# show help, dismiss
Type "?" Sleep 2500ms
Escape Sleep 500ms

# quit
Type "q"
