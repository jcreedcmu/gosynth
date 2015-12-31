package ugen

// #include <stdlib.h>
// #include "ugen.h"
import "C"

import (
	"errors"
	"unsafe"
)

type Ugen struct {
	gen *C.ugen_t
}

type Uinst struct {
	gen  *C.ugen_t
	inst unsafe.Pointer
}

func Load(filename string) (*Ugen, error) {
	cname := C.CString(filename)
	defer C.free(unsafe.Pointer(cname))

	ugen := C.ugen_load(cname)
	err := C.error()
	if err != nil {
		return nil, errors.New(C.GoString(err))
	}
	return &Ugen{gen: ugen}, nil
}

func (u *Ugen) Create() *Uinst {
	return &Uinst{
		gen:  u.gen,
		inst: C.ugen_create(u.gen),
	}
}

func (ui *Uinst) Run(param []*float64, frames int) bool {
	kill := C.ugen_run(
		ui.gen,
		(**C.double)(unsafe.Pointer(&param[0])),
		ui.inst,
		C.int(frames),
	)
	return kill != 0
}

func (ui *Uinst) Destroy() {
	C.ugen_destroy(
		ui.gen,
		ui.inst,
	)
}

func (u *Ugen) Close() error {
	C.ugen_close(u.gen)
	err := C.error()
	if err != nil {
		return errors.New(C.GoString(err))
	}
	return nil
}

func (ui *Uinst) Msg(sig int) {
	C.ugen_msg(
		ui.gen,
		ui.inst,
		C.int(sig),
	)
}
