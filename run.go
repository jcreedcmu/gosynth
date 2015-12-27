package gosynth

import (
	"github.com/jcreedcmu/gosynth/service"
	"github.com/jcreedcmu/gosynth/ugen"

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
var post_amp = 0.05
var resFreq = 2646.2

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

const STOP = 0
const RESTART = 1

func (oscs Oscs) noteOn(which int, vel int64) {
	mutex.Lock()
	defer mutex.Unlock()

	osc, ok := bleeps[which]
	if ok {
		// reuse old note
		osc.ui.Msg(RESTART)
		osc.pedal_hold = false
	} else {
		// alloc new note
		freq := 440 * math.Pow(2, float64(which-69)/12)
		amp := 0.08
		bleeps[which] = &PedalBleep{
			pedal_hold: false,
			ui:         ugens["midi"].Create(),
			param:      []*float64{&freq, &amp},
		}
	}
}

func (oscs Oscs) noteOff(which int) {
	mutex.Lock()
	defer mutex.Unlock()

	osc, ok := bleeps[which]
	if ok {
		if pedal {
			osc.pedal_hold = true
		} else {
			osc.ui.Msg(STOP)
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
	for _, osc := range bleeps {
		if osc.pedal_hold {
			osc.pedal_hold = false
			osc.ui.Msg(STOP)
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
var percs = make(map[int]*PedalBleep)

var bleeps = make(map[int]*PedalBleep)
var ugens = make(map[string]*ugen.Ugen)

var snareBuf []float64
var bassBuf []float64

func playDrum(ugenName string, param []*float64) {
	percOdom++
	percs[percOdom] = &PedalBleep{
		pedal_hold: false,
		ui:         ugens[ugenName].Create(),
		param:      param,
	}
}

func processAudio(out [][]float32) {
	mutex.Lock()
	defer mutex.Unlock()

	start := time.Now()

	out64 := [][]float64{
		make([]float64, len(out[0])),
		make([]float64, len(out[1])),
	}
	for i := range out64[0] {

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

		for _, filter := range filters {
			filter(bus)
		}
		out64[0][i] = bus[0]
		out64[1][i] = bus[1]
	}

	for i, osc := range bleeps {
		kill := osc.batchSignal(out64[0])
		if kill {
			delete(bleeps, i)
			continue
		}
	}

	for i, osc := range percs {
		kill := osc.batchSignal(out64[0])
		if kill {
			delete(percs, i)
			continue
		}
	}

	for i := range out64[0] {
		out[0][i] = float32(out64[0][i])
		out[1][i] = float32(out64[0][i])
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

func Run() {
	leadUgen, err := ugen.Load("./inst/lead.so")
	chk(err)
	ugens["midi"] = leadUgen

	bassUgen, err := ugen.Load("./inst/bass.so")
	chk(err)
	ugens["bass"] = bassUgen

	snareUgen, err := ugen.Load("./inst/snare.so")
	chk(err)
	ugens["snare"] = snareUgen

	shouldRecord := flag.Bool("record", false, "whether to record")
	addr := flag.String("addr", "localhost:8080", "http service address")
	flag.Parse()

	snareBuf = make([]float64, 60000)
	{
		drumPhase := 0.0
		for i := range snareBuf {
			t := float64(i)
			snareBuf[i] = (rand.Float64() - 0.5) * math.Exp(-t/1500.0) * 0.2
			bot := 40.0
			top := 200.0
			falling := top - (top-bot)*(t/2000.0)
			if falling < bot {
				falling = bot
			}
			fr := falling * (1.0 + math.Sin(2.0*3.14159*30.0*t/44100.0))
			drumPhase += 2.0 * 3.14159 * fr / 44100.0
			snareBuf[i] += math.Sin(drumPhase) * 0.2 * math.Exp(-t/1000.0)
			snareBuf[i] += math.Sin(2.0*3.14159*137.0/44100.0*t) * 0.1 * math.Exp(-t/1500.0)
		}
	}

	bassBuf = make([]float64, 60000)
	{
		drumPhase := 0.0
		for i := range bassBuf {
			t := float64(i)
			bot := 30.0
			top := 120.0
			falling := top - (top-bot)*(t/3500.0)
			if falling < bot {
				falling = bot
			}
			fr := falling * (1.0 + 0.5*math.Sin(2.0*3.14159*25.0*t/44100.0))
			drumPhase += 2.0 * 3.14159 * fr / 44100.0
			bassBuf[i] = math.Sin(drumPhase) * 0.1
			hold := 1000.0
			if t > hold {
				bassBuf[i] *= math.Exp(-(t - hold) / 2500.0)
			}
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

	if true {
		go func() {
			amp := 0.1
			tempo := 1500 * time.Microsecond
			for {
				playDrum("bass", []*float64{&amp})
				time.Sleep(300 * tempo)
				playDrum("snare", []*float64{&amp})
				time.Sleep(300 * tempo)
			}
		}()
	}

	filters = []Filter{overdrive(0, 0.05), overdrive(2, 0.2), join, reverb, lopass(resFreq, BQ), spread}
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
func overdrive(n int, LIMIT float64) func(bus Bus) {
	return func(bus Bus) {
		w := bus[n]
		if math.Abs(w) > LIMIT {
			if w > 0 {
				w = LIMIT
			} else {
				w = -LIMIT
			}
		}
		bus[n] = w
	}
}

var lopass_phase = 0.0

func lopass(resFreq float64, Q float64) Filter {
	// Compute some params for the low-pass
	return func(bus Bus) {
		// _, lopass_phase = math.Modf(lopass_phase + 0.1/sampleRate)
		// rf := resFreq * (1 + 0.5*math.Sin(2.0*3.142*lopass_phase))
		rf := resFreq
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
		wrapReverb(2932)*0.15 +
		wrapReverb(5053)*0.025 +
		wrapReverb(4052)*0.025 +
		wrapReverb(143)*0.2 +
		wrapReverb(24)*0.05
	bus[0] = post_amp * reverbBuf[reverbIx]
}

// spread
func spread(bus Bus) {
	bus[1] = bus[0]
}

// spread
func join(bus Bus) {
	bus[0] += bus[2]
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
