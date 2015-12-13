package main

import (
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/gordonklaus/portaudio"
	"github.com/gorilla/websocket"
	"github.com/rakyll/portmidi"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"
)

const sampleRate = 44100

const S = sampleRate / (2 * math.Pi * 1469.0)
const Q = 1.0
const A = -(S/Q + 2.0*S*S) / (1.0 + S/Q + S*S)
const B = (S * S) / (1.0 + S/Q + S*S)
const C = 10.0 / (1.0 + S/Q + S*S)

var lobuf1 float64 = 0.0
var lobuf2 float64 = 0.0
var master_vol = 0.1

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

type Unit struct{}
type Oscs map[int]Osc

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
		w := 0.0
		for i, osc := range oscs {
			s, kill := osc.signal()
			w += s
			if kill {
				delete(oscs, i)
				continue
			}
		}
		for i, osc := range percs {
			s, kill := osc.signal()
			w += s
			if kill {
				delete(percs, i)
				continue
			}
		}

		LIMIT := 0.02
		if math.Abs(w) > LIMIT {
			if w > 0 {
				w = LIMIT
			} else {
				w = -LIMIT
			}
		}

		lo_out := C*w - A*lobuf1 - B*lobuf2
		lobuf2 = lobuf1
		lobuf1 = lo_out

		out[0][i] = float32(lo_out)
		out[1][i] = float32(lo_out)
	}
	if f != nil {
		chk(binary.Write(f, binary.BigEndian, out[0]))
	}
	inner = inner + time.Now().Sub(start)
	innerCount++
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

var upgrader = websocket.Upgrader{}

func rootHandle(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello World")
}

type WsCmd struct {
	Action  string  `json:"action"`
	Fparam0 float64 `json:"fparam0"`
}

func wsHandle(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	go func() {
		defer c.Close()
		for {
			mt, message, err := c.ReadMessage()
			if err != nil {
				log.Println("read:", err)
				break
			}
			if mt == websocket.TextMessage {
				var cmd WsCmd

				log.Printf("got: %s\n", message)
				err := json.Unmarshal(message, &cmd)
				if err != nil {
					log.Println("json err:", err)
					continue
				}
				log.Printf("got json: %+v\n", cmd)
				if cmd.Action == "master_vol" {
					log.Println("setting master_vol to %f\n", cmd.Fparam0)
					master_vol = cmd.Fparam0
				}
			}
		}
	}()
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
		http.HandleFunc("/", rootHandle)
		http.HandleFunc("/ws", wsHandle)
		go func() {
			log.Fatal(http.ListenAndServe(*addr, nil))
		}()
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

type Osc interface {
	signal() (float64, bool)
	setParam(string, interface{})
	getParam(string) interface{}
	Start()
	Stop()
	Restart()
	getEnv() (float64, bool)
}

// Basic tone generator

type Sqr struct {
	t          int64
	step       float64
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

	v := 0.6 * sqr(g.phase)
	v += 0.8 * saw(g.phase2)
	_, g.phase = math.Modf(g.phase + g.step)
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
		freq := (440 * math.Pow(2, float64(pitch-71)/12))
		g.step = freq / sampleRate
		freq2 := (1761 * math.Pow(2, float64(pitch-71)/12))
		g.step2 = (freq2 + 0.3) / sampleRate
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

	lo_out := C*v - A*g.lobuf1 - B*g.lobuf2
	g.lobuf2 = g.lobuf1
	g.lobuf1 = lo_out
	return lo_out * amp, kill
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
