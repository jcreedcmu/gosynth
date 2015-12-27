package gosynth

import (
	"github.com/jcreedcmu/gosynth/ugen"
)

type Ugens struct {
	ui *ugen.Uinst
}

func (g *Ugens) batchSignal(params []*float64, buf []float64) bool {
	return g.ui.Run(params, buf)
}

func (g *Ugens) signal() (float64, bool) {
	return 0.0, false
}

func (g *Ugens) setParam(name string, val interface{}) {
}

func (g *Ugens) getParam(name string) interface{} {
	return nil
}

func (g *Ugens) Start() {
}

func (g *Ugens) Stop() {
}

func (g *Ugens) Restart() {
}

func (g *Ugens) getEnv() (float64, bool) {
	return 1.0, false
}
