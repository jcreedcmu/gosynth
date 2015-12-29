package gosynth

import (
	"github.com/jcreedcmu/gosynth/service"
	"github.com/jcreedcmu/gosynth/ugen"

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

var f *os.File
var mutex = &sync.Mutex{}
var pedal = false

const STOP = 0
const RESTART = 1

func (bleeps Bleeps) noteOn(ugenName string, pitch int, vel int64) {
	mutex.Lock()
	defer mutex.Unlock()

	osc, ok := bleeps[pitch]
	if ok {
		// reuse old note
		osc.ui.Msg(RESTART)
		osc.pedal_hold = false
	} else {
		// alloc new note
		freq := 440 * math.Pow(2, float64(pitch-69)/12)
		amp := 0.08
		bleeps[pitch] = &PedalBleep{
			pedal_hold: false,
			ui:         ugens[ugenName].Create(),
			param:      []*float64{&freq, &amp},
		}
	}
}

func (bleeps Bleeps) noteOff(pitch int) {
	mutex.Lock()
	defer mutex.Unlock()

	osc, ok := bleeps[pitch]
	if ok {
		if pedal {
			osc.pedal_hold = true
		} else {
			osc.ui.Msg(STOP)
		}
	}
}

func (bleeps Bleeps) pedalOn() {
	mutex.Lock()
	defer mutex.Unlock()
	pedal = true
}

func (bleeps Bleeps) pedalOff() {
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

func listenMidi(in *portmidi.Stream, bleeps Bleeps) {
	ch := in.Listen()
	fmt.Printf("Listening...\n")
	for {
		select {
		case ev := <-ch:
			switch {
			case ev.Status >= 0x90 && ev.Status < 0xa0:
				if ev.Data2 != 0 {
					bleeps.noteOn("midi", int(ev.Data1), ev.Data2)
				} else {
					bleeps.noteOff(int(ev.Data1))
				}
			case ev.Status >= 0x80 && ev.Status < 0x90:
				bleeps.noteOff(int(ev.Data1))
			case ev.Status == 0xb0:
				if ev.Data2 == 0 {
					bleeps.pedalOff()
				} else {
					bleeps.pedalOn()
				}
			default:
				fmt.Printf("%+v\n", ev)
			}
		}
	}
}

var inner time.Duration
var innerCount int64

var percOdom int
var percs = make(map[int]*PedalBleep)

type Bleeps map[int]*PedalBleep

var bleeps = Bleeps(make(map[int]*PedalBleep))
var ugens = make(map[string]*ugen.Ugen)

func genOn(ugenName string, pitch int, vel float64) int {
	id := percOdom
	percOdom++
	freq := 440 * math.Pow(2, float64(pitch-69)/12)
	amp := 0.01 * vel
	percs[id] = &PedalBleep{
		pedal_hold: false,
		ui:         ugens[ugenName].Create(),
		param:      []*float64{&freq, &amp},
	}
	return id
}

func genOff(id int) {
	percs[id].ui.Msg(STOP)
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

		for _, filter := range filters {
			filter(bus)
		}
		out64[0][i] = bus[0]
		out64[1][i] = bus[1]
	}

	for i, osc := range bleeps {
		kill := osc.batchSignal(out64[0])
		if kill {
			bleeps[i].ui.Destroy()
			delete(bleeps, i)
			continue
		}
	}

	for i, osc := range percs {
		kill := osc.batchSignal(out64[0])
		if kill {
			percs[i].ui.Destroy()
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

func LoadUgen(filename string, name string) error {
	old, ok := ugens[name]
	if ok {
		old.Close()
		delete(ugens, name)
	}
	ug, err := ugen.Load(filename)
	if err != nil {
		return err
	}
	ugens[name] = ug
	return nil
}

func UnloadUgen(name string) {
	ugens[name].Close()
	delete(ugens, name)
}

func Run() {
	chk(LoadUgen("./inst/lead.so", "midi"))
	chk(LoadUgen("./inst/bass.so", "bass"))
	chk(LoadUgen("./inst/snare.so", "snare"))

	shouldRecord := flag.Bool("record", false, "whether to record")
	addr := flag.String("addr", "localhost:8080", "http service address")
	flag.Parse()

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
		go listenMidi(in, bleeps)
		defer portmidi.Terminate()
	}

	if false {
		go func() {
			vel := 10.0
			tempo := 1500 * time.Microsecond
			for {
				genOn("bass", 0, vel)
				time.Sleep(300 * tempo)
				genOn("snare", 0, vel)
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

func chk(err error) {
	if err != nil {
		panic(err)
	}
}
