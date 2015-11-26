package main
 
import (
        "fmt"
        "github.com/gordonklaus/portaudio"
        "github.com/rakyll/portmidi"
        "math"
        "time"
)
 
const sampleRate = 44100
const polyphony = 16
 
func (oscs Oscs) noteOn(which int64, vel int64) {
        for i, osc := range oscs {
                if osc == nil || osc.getParam("pitch").(int64) == which ||
                        (osc.getParam("vol").(float64) < 0.01 &&
                                !osc.getParam("on").(bool)) {
                        oscs[i] = &stereoSine{amp: 0.05 / 127 * float64(vel)}
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
        for _, osc := range oscs {
                if osc != nil && osc.getParam("pitch").(int64) == which {
                        osc.setParam("on", false)
                }
        }
}
 
func (oscs Oscs) pedalOn() {
 
}
 
func (oscs Oscs) pedalOff() {
 
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
}
 
func main() {
        portmidi.Initialize()
        defer portmidi.Terminate()
 
        in, err := portmidi.NewInputStream(portmidi.GetDefaultInputDeviceId(), 1024)
        chk(err)
 
        if in == nil {
 
        }
 
        portaudio.Initialize()
        defer portaudio.Terminate()
 
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
 
func (g *stereoSine) signal() float64 {
        if !g.on {
                g.vol *= 0.9995
        } else {
                g.vol = g.amp*0.1 + g.vol*0.9
        }
        amp := g.vol
        v := tern(g.phase < 0.2, -amp, amp)
 
        //      v += 0.5 * tern(g.phase2 < 0.5, -amp, amp)
        v += 0.5 * amp * g.phase2
        _, g.phase = math.Modf(g.phase + g.step)
        _, g.phase2 = math.Modf(g.phase2 + g.step2)
        return v
}
 
type stereoSine struct {
        step   float64
        phase  float64
        step2  float64
        phase2 float64
        amp    float64
        vol    float64
        on     bool
        cur    int64
}
 
func (g *stereoSine) setParam(name string, val interface{}) {
        switch name {
        case "on":
                g.on = val.(bool)
        case "pitch":
                pitch := val.(int64)
                g.cur = pitch
                freq := (300 * math.Pow(2, float64(pitch-69)/12))
                g.step = freq / sampleRate
                freq2 := (605 * math.Pow(2, float64(pitch-69)/12))
                g.step2 = (freq2 + 0.1) / sampleRate
        case "vol":
                g.vol = val.(float64)
        }
}
 
func (g *stereoSine) getParam(name string) interface{} {
        switch name {
        case "pitch":
                return g.cur
        case "vol":
                return g.vol
        case "on":
                return g.on
        }
        return nil
}
 
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
