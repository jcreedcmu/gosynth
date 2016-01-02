package gosynth

import (
	"github.com/jcreedcmu/gosynth/service"
	"github.com/jcreedcmu/gosynth/ugen"

	"encoding/binary"
	"flag"
	"fmt"
	"github.com/gordonklaus/portaudio"
	"github.com/youpy/go-coremidi"
	"math"
	"os"
	"sort"
	"sync"
	"time"
)

type Bus []float64

// Ughhh this just needs to be at least as big as the audio processing
// buffer size, no harm if it's bigger.
const SAFE_BUF_LEN = 1024

var out64 = [][]float64{
	make([]float64, SAFE_BUF_LEN),
	make([]float64, SAFE_BUF_LEN),
	make([]float64, SAFE_BUF_LEN),
	make([]float64, SAFE_BUF_LEN),
}

func getBus(n int) *float64 {
	return &out64[n][0]
}

const sampleRate = 44100

const BQ = 5.7

var lobuf1 float64 = 0.0
var lobuf2 float64 = 0.0

const reverbLen = 441000

var globalTime int64 = 0 // in audio samples. A signed 32-bit number
// would last 13 hours, but a signed 64-bit int goes about 6 million
// years. Good enough for even Cage and Jem Finer.

var reverbIx = 0
var reverbBuf [reverbLen]float64
var master_vol = 1.0
var post_amp = 0.05
var resFreq = 2646.2

var bus Bus = make([]float64, 4)

var f *os.File
var mutex = &sync.Mutex{}
var pedal = false

const STOP = 0
const RESTART = 1

func (bleeps Bleeps) noteOn(ugenName string, pitch int, vel int) {
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
		amp := 0.0006 * float64(vel)
		bleeps[pitch] = &PedalBleep{
			pedal_hold: false,
			ui:         ugens[ugenName].Create(),
			param:      []*float64{getBus(0), &freq, &amp},
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

func handleMidiEvent(ev []byte, bleeps Bleeps) {
	if len(ev) != 3 {
		fmt.Printf("UNEXPECTED MIDI: %+v\n", ev)
		return
	}
	status := int(ev[0])
	data1 := int(ev[1])
	data2 := int(ev[2])
	fmt.Printf("MIDI: %d %d %d\n", status, data1, data2)
	switch {
	case status >= 0x90 && status < 0xa0:
		if data1 < 21 {
			fmt.Printf("UNEXPECTED LOW NOTE %+v\n", ev)
			return
		}
		if data2 != 0 {
			bleeps.noteOn("midi", data1, data2)
		} else {
			bleeps.noteOff(data1)
		}
	case status >= 0x80 && status < 0x90:
		bleeps.noteOff(data1)
	case status == 0xb0:
		if data2 == 0 {
			bleeps.pedalOff()
		} else {
			bleeps.pedalOn()
		}
	default:
		fmt.Printf("UNEXPECTED MIDI: %+v\n", ev)
	}
}

// Some profiling stuff
var inner time.Duration
var innerCount int64

type PedalBleep struct {
	pedal_hold bool
	priority   float64
	ui         *ugen.Uinst
	param      []*float64
}

type Bleeps map[int]*PedalBleep

var percOdom int
var percs = Bleeps(make(map[int]*PedalBleep))
var bleeps = Bleeps(make(map[int]*PedalBleep))
var ugens = make(map[string]*ugen.Ugen)

type ByPriority struct {
	Ix     []int
	Bleeps map[int]*PedalBleep
}

func (a ByPriority) Len() int      { return len(a.Ix) }
func (a ByPriority) Swap(i, j int) { a.Ix[i], a.Ix[j] = a.Ix[j], a.Ix[i] }
func (a ByPriority) Less(i, j int) bool {
	return a.Bleeps[a.Ix[i]].priority < a.Bleeps[a.Ix[j]].priority
}

func (bleeps Bleeps) priOrder() []int {
	ix := []int{}
	for k, _ := range percs {
		ix = append(ix, k)
	}
	sort.Sort(ByPriority{
		Ix:     ix,
		Bleeps: bleeps,
	})
	return ix
}

func filterOn(ugenName string, priority float64, param []*float64) int {
	id := percOdom
	percOdom++
	percs[id] = &PedalBleep{
		ui:       ugens[ugenName].Create(),
		param:    param,
		priority: priority,
	}
	return id
}

// assumes mutex already held
func genOn(ugenName string, priority float64, pitch int, vel float64) int {
	id := percOdom
	percOdom++
	freq := 440 * math.Pow(2, float64(pitch-69)/12)
	amp := 0.01 * vel
	percs[id] = &PedalBleep{
		ui:       ugens[ugenName].Create(),
		param:    []*float64{getBus(0), &freq, &amp},
		priority: priority,
	}
	return id
}

func genOff(id int) {
	percs[id].ui.Msg(STOP)
}

func genAllOff() {
	for id := range percs {
		percs[id].ui.Msg(STOP)
	}
}

func processAudio(out [][]float32) {
	mutex.Lock()
	defer mutex.Unlock()

	start := time.Now()
	buflen := len(out[0])

	for i := range out[0] {
		out64[0][i] = 0
		out64[1][i] = 0
		out64[2][i] = 0
		out64[3][i] = 0
	}

	for i, osc := range bleeps {
		kill := osc.ui.Run(osc.param, buflen)
		if kill {
			bleeps[i].ui.Destroy()
			delete(bleeps, i)
			continue
		}
	}

	for _, i := range percs.priOrder() {
		osc := percs[i]
		kill := osc.ui.Run(osc.param, buflen)
		if kill {
			percs[i].ui.Destroy()
			delete(percs, i)
			continue
		}
	}

	for i := range out[0] {
		out[0][i] = float32(out64[0][i])
		out[1][i] = float32(out64[1][i])
	}

	if f != nil {
		chk(binary.Write(f, binary.BigEndian, out[0]))
	}
	globalTime += int64(buflen)
	FlushCmdQueueLocked(globalTime)

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
	chk(LoadUgen("./inst/spread.so", "spread"))
	chk(LoadUgen("./inst/reverb.so", "reverb"))
	chk(LoadUgen("./inst/lead2.so", "midi"))
	chk(LoadUgen("./inst/lead.so", "lead"))
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
		client, err := coremidi.NewClient("midi client")
		chk(err)
		port, err := coremidi.NewInputPort(client, "test",
			func(source coremidi.Source, event []byte) {
				handleMidiEvent(event, bleeps)
			})
		chk(err)
		sources, err := coremidi.AllSources()
		chk(err)
		for _, source := range sources {
			//			func(source coremidi.Source) {
			fmt.Printf("Listening to midi source %s [%s]\n", source.Name(), source.Manufacturer())
			port.Connect(source)
			//		}(source)
		}
	}

	if false {
		go func() {
			vel := 10.0
			tempo := 1500 * time.Microsecond
			for {
				// XXX should grab lock here
				genOn("bass", 0, 0, vel)
				time.Sleep(200 * tempo)
				genOn("snare", 0, 0, vel)
				time.Sleep(200 * tempo)
				genOn("bass", 0, 0, vel)
				time.Sleep(100 * tempo)
				genOn("bass", 0, 0, vel/2)
				time.Sleep(100 * tempo)
				genOn("snare", 0, 0, vel)
				time.Sleep(200 * tempo)

			}
		}()
	}

	filterOn("reverb", 99.0, []*float64{getBus(0)})
	filterOn("spread", 100.0, []*float64{getBus(0), getBus(1)})

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

func lopass(resFreq float64, Q float64) func(bus Bus) {
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
