package gosynth

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
	g.t += 1
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
