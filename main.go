package main

import (
	"encoding/binary"
	"flag"
	"fmt"
	"github.com/gordonklaus/portaudio"
	"github.com/rakyll/portmidi"
	"math"
	"os"
	"sync"
	"time"
)

const sampleRate = 44100
const polyphony = 64

var f *os.File
var mutex = &sync.Mutex{}
var pedal = false

func (oscs Oscs) noteOn(which int64, vel int64) {
	mutex.Lock()
	defer mutex.Unlock()

	for i, osc := range oscs {
		if osc == nil ||
			(osc.getParam("vol").(float64) < 0.001 &&
				!osc.getParam("on").(bool)) {
			oscs[i] = NewLowPass(&Sqr{amp: 0.05 / 127 * float64(vel)})
			osc = oscs[i]
			osc.setParam("on", true)
			osc.setParam("pitch", which)
			osc.setParam("vol", 0.0)
			return
		}
	}
	fmt.Printf("Can't allocate note\n")
}

func (oscs Oscs) noteOff(which int64) {
	mutex.Lock()
	defer mutex.Unlock()

	for _, osc := range oscs {
		if osc != nil && osc.getParam("pitch").(int64) == which {
			if osc.getParam("on").(bool) {
				osc.setParam("on", false)
				if pedal {
					osc.setParam("pedal_on", true)
				}
			}
		}
	}
}

func (oscs Oscs) pedalOn() {
	mutex.Lock()
	defer mutex.Unlock()
	pedal = true
}

func (oscs Oscs) pedalOff() {
	mutex.Lock()
	defer mutex.Unlock()

	pedal = false
	for _, osc := range oscs {
		if osc != nil {
			osc.setParam("pedal_on", false)
		}
	}
}

func listenMidi(in *portmidi.Stream, oscs Oscs) {
	ch := in.Listen()
	fmt.Printf("Listening...\n")
	for {
		select {
		case ev := <-ch:
			switch {
			case ev.Status >= 0x90 && ev.Status < 0xa0:
				if ev.Data2 != 0 {
					oscs.noteOn(ev.Data1, ev.Data2)
				} else {
					oscs.noteOff(ev.Data1)
				}
			case ev.Status >= 0x80 && ev.Status < 0x90:
				oscs.noteOff(ev.Data1)
			case ev.Status == 0xb0:
				if ev.Data2 == 0 {
					oscs.pedalOff()
				} else {
					oscs.pedalOn()
				}
			default:
				fmt.Printf("%+v\n", ev)
			}
		}
	}
}

type Oscs []Osc

func (oscs Oscs) processAudio(out [][]float32) {
	mutex.Lock()
	defer mutex.Unlock()

	for i := range out[0] {
		out[0][i] = 0
		out[1][i] = 0
		for _, osc := range oscs {
			if osc != nil {
				v := osc.signal()
				out[0][i] += float32(v)
				out[1][i] += float32(v)
			}
		}
	}
	if f != nil {
		chk(binary.Write(f, binary.BigEndian, out[0]))
	}
}

func main() {
	shouldRecord := flag.Bool("record", false, "whether to record")
	flag.Parse()

	portmidi.Initialize()
	defer portmidi.Terminate()

	in, err := portmidi.NewInputStream(portmidi.GetDefaultInputDeviceId(), 1024)
	chk(err)

	portaudio.Initialize()
	defer portaudio.Terminate()

	if *shouldRecord {
		f, err = os.Create("/tmp/recording.f32")
		// # to play:
		// $ play -x -r 44100 -c 1 /tmp/recording.f32
		// # to convert to wav:
		// $ sox -x -r 44100 -c 1 /tmp/recording.f32 recording.wav

		chk(err)
	}

	oscs := Oscs(make([]Osc, polyphony))
	s, err := portaudio.OpenDefaultStream(0, 2, float64(sampleRate), 0, oscs.processAudio)
	chk(err)
	defer s.Close()

	go listenMidi(in, oscs)

	chk(s.Start())
	time.Sleep(10000 * time.Second)
	chk(s.Stop())
}

type Osc interface {
	signal() float64
	setParam(string, interface{})
	getParam(string) interface{}
}

func (g *Sqr) signal() float64 {
	g.t++
	on := g.on || g.pedal_on
	if on {
		g.vol = g.amp*0.1 + g.vol*0.9
	} else {
		g.vol *= 0.9995
	}
	amp := g.vol
	//v := amp * math.Sin(2*math.Pi*g.phase)

	amp *= math.Exp(-0.00001 * float64(g.t))
	v := 1.0 * tern(g.phase < 0.5, -amp, amp)
	v += 0.5 * tern(g.phase2 < 0.5, -amp, amp)
	//v += amp * math.Sin(2*math.Pi*g.phase2)
	_, g.phase = math.Modf(g.phase + g.step)
	_, g.phase2 = math.Modf(g.phase2 + g.step2)
	return v
}

// Basic tone generator

type Sqr struct {
	t        int64
	step     float64
	phase    float64
	step2    float64
	phase2   float64
	amp      float64
	vol      float64
	on       bool
	pedal_on bool
	cur      int64
}

func (g *Sqr) setParam(name string, val interface{}) {
	switch name {
	case "on":
		g.on = val.(bool)
	case "pedal_on":
		g.pedal_on = val.(bool)
	case "pitch":
		pitch := val.(int64)
		g.cur = pitch
		freq := (440 * math.Pow(2, float64(pitch-69)/12))
		g.step = freq / sampleRate
		freq2 := (881 * math.Pow(2, float64(pitch-69)/12))
		g.step2 = (freq2 + 0.1) / sampleRate
	case "vol":
		g.vol = val.(float64)
	}
}

func (g *Sqr) getParam(name string) interface{} {
	switch name {
	case "pitch":
		return g.cur
	case "vol":
		return g.vol
	case "on":
		return g.on
	case "pedal_on":
		return g.pedal_on
	}
	return nil
}

// Simple low-pass

type LowPass struct {
	buf   float64
	input Osc
}

func NewLowPass(input Osc) *LowPass {
	return &LowPass{buf: 0, input: input}
}

func (g *LowPass) setParam(name string, val interface{}) {
	g.input.setParam(name, val)
}

func (g *LowPass) getParam(name string) interface{} {
	return g.input.getParam(name)
}

func (g *LowPass) signal() float64 {
	g.buf = 0.999*g.buf + 0.001*g.input.signal()
	return 100 * g.buf
}

// Utils
func tern(cond bool, x float64, y float64) float64 {
	if cond {
		return x
	} else {
		return y
	}
}

func chk(err error) {
	if err != nil {
		panic(err)
	}
}
