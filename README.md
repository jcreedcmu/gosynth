# gosynth

As expressive as they are, things like overtone, supercollider, ChucK, pd, etc. always feel
like a big teetering stack of dependencies that I don't really understand. So I eternally find
myself trying to make a nice minimal simple synth I can drive from a MIDI keyboard.

To run:
```shell
export GOPATH=~/go # or something similar, wherever you want it
go get github.com/gordonklaus/portaudio
go get github.com/rakyll/portmidi
go run main.go
```

Sounds like:
https://soundcloud.com/jcreed/himenepit
https://soundcloud.com/jcreed/tell-me-some-time
