package main

import (
	"github.com/jcreedcmu/gosynth/service"

	"encoding/binary"
	"flag"
	"fmt"
	"github.com/gordonklaus/portaudio"
	"github.com/rakyll/portmidi"
	"log"
	"math"
	"math/rand"
	"os"
	"sync"
	"time"
)

type Unit struct{}
type Osc interface {
	signal() (float64, bool)
	setParam(string, interface{})
	getParam(string) interface{}
	Start()
	Stop()
	Restart()
	getEnv() (float64, bool)
}
type Oscs map[int]Osc

type Envelope struct {
	Attack  int64
	Decay   int64
	Sustain float64
	Release int64
	lastEnv float64
	Falloff float64
	t       int64
	gate    bool
}

type Bus []float64
type Filter func(bus Bus)

const sampleRate = 44100

const BQ = 5.7

var lobuf1 float64 = 0.0
var lobuf2 float64 = 0.0

const reverbLen = 441000

var reverbIx = 0
var reverbBuf [reverbLen]float64
var master_vol = 1.0
var post_amp = 0.3
var resFreq = 546.2

var bus Bus = make([]float64, 4)
var filters []Filter

func (e *Envelope) getEnv() (float64, bool) {
	t := e.t
	e.t++
	if e.gate {
		if t < e.Attack {
			phase := float64(t) / float64(e.Attack)
			return (1.0-phase)*e.lastEnv + phase, false
		}
		pat := float64(t - e.Attack)
		if pat < float64(e.Decay) {
			phase := pat / float64(e.Decay)
			return (1.0 - phase) + phase*e.Sustain, false
		}
		if e.Sustain > 0.0 {
			return e.Sustain * math.Exp(-e.Falloff*float64(t-e.Attack-e.Decay)), false
		}
	} else {
		phase := float64(t) / float64(e.Release)
		if phase < 1 {
			return (1.0-phase)*e.lastEnv + phase*0.0, false
		}
	}
	return 0.0, true
}

func (e *Envelope) Start() {
	e.lastEnv = 0
	e.gate = true
	e.t = 0
}

func (e *Envelope) Restart() {
	e.lastEnv, _ = e.getEnv()
	e.gate = true
	e.t = 0
}

func (e *Envelope) Stop() {
	e.lastEnv, _ = e.getEnv()
	e.gate = false
	e.t = 0
}

var f *os.File
var mutex = &sync.Mutex{}
var pedal = false

func (oscs Oscs) noteOn(which int, vel int64) {
	mutex.Lock()
	defer mutex.Unlock()

	osc, ok := oscs[which]
	if ok {
		// reuse old note
		osc.Restart()
	} else {
		// alloc new note
		osc = &Sqr{
			Envelope: Envelope{
				Attack:  500,
				Decay:   500,
				Sustain: 0.5,
				Release: 1000,
				Falloff: 0.000015,
			},
		}
		osc.setParam("pitch", which)
		osc.Start()
		oscs[which] = osc
	}
	osc.setParam("pedal_hold", false)
	osc.setParam("amp", 0.5/127*float64(vel))
}

func (oscs Oscs) noteOff(which int) {
	mutex.Lock()
	defer mutex.Unlock()

	osc, ok := oscs[which]
	if ok {
		if pedal {
			osc.setParam("pedal_hold", true)
		} else {
			fmt.Printf("STOPPING %d\n", which)
			osc.Stop()
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
		if osc != nil && osc.getParam("pedal_hold").(bool) {
			osc.setParam("pedal_hold", false)
			osc.Stop()
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
					oscs.noteOn(int(ev.Data1), ev.Data2)
				} else {
					oscs.noteOff(int(ev.Data1))
				}
			case ev.Status >= 0x80 && ev.Status < 0x90:
				oscs.noteOff(int(ev.Data1))
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

var oscs Oscs
var inner time.Duration
var innerCount int64

var percOdom int
var percs Oscs = Oscs(make(map[int]Osc))

var drumBuf []float64

func playDrum(freq int, amp float64) {
	percOdom++
	drum := &Drum{
		freq: freq,
		buf:  drumBuf,
		amp:  0.3 * amp,
		Envelope: Envelope{
			Attack:  1000,
			Decay:   10000,
			Sustain: 0.0,
		},
	}
	drum.Start()
	percs[percOdom] = drum
}

func processAudio(out [][]float32) {
	mutex.Lock()
	defer mutex.Unlock()

	start := time.Now()

	for i := range out[0] {

		for i := range bus {
			bus[i] = 0.0
		}

		for i, osc := range oscs {
			s, kill := osc.signal()
			bus[0] += s
			if kill {
				delete(oscs, i)
				continue
			}
		}
		for i, osc := range percs {
			s, kill := osc.signal()
			bus[0] += s
			if kill {
				delete(percs, i)
				continue
			}
		}

		for _, filter := range filters {
			filter(bus)
		}
		out[0][i] = float32(bus[0])
		out[1][i] = float32(bus[1])
	}
	if f != nil {
		chk(binary.Write(f, binary.BigEndian, out[0]))
	}
	inner = inner + time.Now().Sub(start)
	innerCount++
}

func wrapReverb(a int) float64 {
	return reverbBuf[(reverbIx+a)%reverbLen]
}

func openStream(cbk interface{}) (*portaudio.Stream, error) {
	outDev, err := portaudio.DefaultOutputDevice()
	if err != nil {
		return nil, err
	}

	p := portaudio.LowLatencyParameters(nil, outDev)

	p.Input.Channels = 0
	p.Output.Channels = 2
	p.SampleRate = sampleRate
	p.FramesPerBuffer = 0
	return portaudio.OpenStream(p, cbk)
}

func cmdHandle(cmd service.WsCmd) {
	mutex.Lock()
	defer mutex.Unlock()

	fmt.Printf("HERE %+v\n", cmd)

	switch {
	case cmd.Action == "master_vol":
		log.Printf("setting master_vol to %f\n", cmd.Fparam0)
		master_vol = cmd.Fparam0
	case cmd.Action == "res_freq":
		log.Printf("setting res_freq to %f\n", cmd.Fparam0)
		resFreq = cmd.Fparam0
		filters = []Filter{lopass(resFreq, BQ), spread}
	case cmd.Action == "no_reverb":
		filters = []Filter{lopass(resFreq, BQ), spread}
	case cmd.Action == "reverb":
		filters = []Filter{lopass(resFreq, BQ), reverb, spread}
	}
}

func main() {
	shouldRecord := flag.Bool("record", false, "whether to record")
	addr := flag.String("addr", "localhost:8080", "http service address")
	flag.Parse()

	drumBuf = make([]float64, 40000)
	for i := range drumBuf {
		if i%30 == 0 {
			drumBuf[i] = rand.Float64()*2 - 1
		} else {
			drumBuf[i] = drumBuf[i-1]
		}
	}

	portaudio.Initialize()
	defer portaudio.Terminate()

	if *shouldRecord {
		var err error
		f, err = os.Create("/tmp/recording.f32")
		// # to play:
		// $ play -x -r 44100 -c 1 /tmp/recording.f32
		// # to convert to wav:
		// $ sox -x -r 44100 -c 1 /tmp/recording.f32 recording.wav

		chk(err)
	}

	oscs = Oscs(make(map[int]Osc))

	s, err := openStream(processAudio)
	fmt.Println("%+v\n", s.Info())
	chk(err)
	defer s.Close()

	if true {
		service.Initialize(*addr, cmdHandle)
	}

	if true {
		portmidi.Initialize()
		in, err := portmidi.NewInputStream(portmidi.GetDefaultInputDeviceId(), 1024)
		chk(err)
		go listenMidi(in, oscs)
		defer portmidi.Terminate()
	}

	// go func() {
	// 	for {
	// 		playDrum(1, 1.0)
	// 		time.Sleep(700 * time.Millisecond)
	// 		playDrum(103, 1.0)
	// 		time.Sleep(700 * time.Millisecond)
	// 		playDrum(1, 1.0)
	// 		time.Sleep(350 * time.Millisecond)
	// 		playDrum(2, 0.7)
	// 		time.Sleep(350 * time.Millisecond)
	// 		playDrum(103, 1.0)
	// 		time.Sleep(700 * time.Millisecond)
	// 	}
	// }()

	filters = []Filter{overdrive, lopass(resFreq, BQ), reverb, spread}
	//	filters = []Filter{spread}

	go func() {
		for {
			fmt.Printf("inner loop taking avg ~%f samples\n", inner.Seconds()*sampleRate/float64(innerCount))
			inner = 0
			innerCount = 0
			time.Sleep(1 * time.Second)
		}
	}()

	chk(s.Start())
	select {}
	defer chk(s.Stop())
}

// some filters
func overdrive(bus Bus) {
	LIMIT := 0.05
	w := bus[0]
	if math.Abs(w) > LIMIT {
		if w > 0 {
			w = LIMIT
		} else {
			w = -LIMIT
		}
	}
	bus[0] = w
}

var lopass_phase = 0.0

func lopass(resFreq float64, Q float64) Filter {
	// Compute some params for the low-pass
	return func(bus Bus) {
		_, lopass_phase = math.Modf(lopass_phase + 1.5/sampleRate)
		rf := resFreq * (1 + 0.2*math.Sin(2.0*3.142*lopass_phase))

		S := sampleRate / (2 * math.Pi * rf)
		Q := BQ
		A := -(S/Q + 2.0*S*S) / (1.0 + S/Q + S*S)
		B := (S * S) / (1.0 + S/Q + S*S)
		C := 10.0 / (1.0 + S/Q + S*S)

		w := bus[0]
		lo_out := C*w - A*lobuf1 - B*lobuf2
		lobuf2 = lobuf1
		lobuf1 = lo_out

		// wet/dry mix
		bus[0] = w*0.05 + lo_out*0.95
	}
}

// reverb
func reverb(bus Bus) {
	reverbIx = (reverbIx + reverbLen - 1) % reverbLen
	reverbBuf[reverbIx] = bus[0] +
		wrapReverb(10932)*0.15 +
		wrapReverb(12943)*0.2 +
		wrapReverb(5053)*0.025 +
		wrapReverb(4052)*0.025 +
		wrapReverb(24)*0.05
	bus[0] = post_amp * reverbBuf[reverbIx]
}

// spread
func spread(bus Bus) {
	bus[1] = bus[0]
}

// Basic tone generator

type Sqr struct {
	t          int64
	step       float64
	freq       float64
	phase      float64
	step2      float64
	phase2     float64
	amp        float64
	savedEnv   float64
	on         bool
	pedal_hold bool
	cur        int
	Envelope

	lobuf1 float64
	lobuf2 float64
}

func (g *Sqr) signal() (float64, bool) {
	env, kill := g.getEnv()
	amp := g.amp * master_vol * env
	g.t++

	//	freq := g.freq + g.freq*math.Sin(2.0*3.142*g.phase2)
	freq := g.freq + g.freq*0.5*sqr(g.phase2)
	step := freq / sampleRate
	v := 0.6 * math.Sin(2.0*3.142*g.phase)
	_, g.phase = math.Modf(g.phase + step)
	_, g.phase2 = math.Modf(g.phase2 + g.step2)

	return v * amp, kill

	// lo_out := C*v - A*g.lobuf1 - B*g.lobuf2
	// g.lobuf2 = g.lobuf1
	// g.lobuf1 = lo_out
	// return lo_out * amp, kill
}

func (g *Sqr) setParam(name string, val interface{}) {
	switch name {
	case "t":
		g.t = int64(val.(int))
	case "on":
		g.on = val.(bool)
	case "pedal_hold":
		g.pedal_hold = val.(bool)
	case "pitch":
		pitch := val.(int)
		g.cur = pitch
		freq := (440 * math.Pow(2, float64(pitch-69)/12))
		g.freq = freq * 4.0
		g.step = freq / sampleRate
		freq2 := freq
		g.step2 = freq2 / sampleRate
	case "amp":
		g.amp = val.(float64)
	case "savedEnv":
		g.savedEnv = val.(float64)
	default:
		panic(fmt.Errorf("unknown param %s", name))
	}
}

func (g *Sqr) getParam(name string) interface{} {
	switch name {
	case "pitch":
		return g.cur
	case "on":
		return g.on
	case "pedal_hold":
		return g.pedal_hold
	}
	return nil
}

func (g *Sqr) Restart() {
	fmt.Printf("restarting %d\n", g.cur)
	// g.lobuf1 = 0
	// g.lobuf2 = 0
	g.Envelope.Restart()
}

// Drum

type Drum struct {
	freq int
	t    int
	amp  float64
	buf  []float64
	Envelope

	lobuf1 float64
	lobuf2 float64
}

func (g *Drum) signal() (float64, bool) {
	env, kill := g.getEnv()
	amp := master_vol * env

	v := g.amp * g.buf[g.t]
	g.t += g.freq
	if g.t >= len(g.buf) {
		g.t -= len(g.buf)
	}

	return v * amp, kill
	// lo_out := C*v - A*g.lobuf1 - B*g.lobuf2
	// g.lobuf2 = g.lobuf1
	// g.lobuf1 = lo_out
	// return lo_out * amp, kill
}

func (g *Drum) setParam(name string, val interface{}) {
}

func (g *Drum) getParam(name string) interface{} {
	return nil
}

// Utils
func tern(cond bool, x float64, y float64) float64 {
	if cond {
		return x
	} else {
		return y
	}
}

func sqr(x float64) float64 {
	if x < 0.5 {
		return 1
	}
	return -1
}

func saw(x float64) float64 {
	if x < 0.5 {
		return 4*x - 1
	}
	return 3 - 4*x
}

func chk(err error) {
	if err != nil {
		panic(err)
	}
}
