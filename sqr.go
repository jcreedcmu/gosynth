package gosynth

import (
	"fmt"
	"math"
)

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
	//	freq := g.freq + g.freq*saw(g.phase2)
	freq := g.freq + g.freq*0.5*sqr(g.phase2)
	step := freq / sampleRate

	v := 0.7 * math.Sin(6.284*g.phase)
	// v := 0.7 * saw(g.phase)
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
		g.freq = freq * 2.0
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
