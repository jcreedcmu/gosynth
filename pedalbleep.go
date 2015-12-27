package gosynth

import (
	"github.com/jcreedcmu/gosynth/ugen"
)

type PedalBleep struct {
	pedal_hold bool
	ui         *ugen.Uinst
	param      []*float64
}

func (g *PedalBleep) batchSignal(buf []float64) bool {
	return g.ui.Run(g.param, buf)
}
