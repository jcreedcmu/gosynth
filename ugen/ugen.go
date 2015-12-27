package ugen

// #include <stdlib.h>
// #include "ugen.h"
import "C"

import (
	"errors"
	"unsafe"
)

type Ugen C.ugen_t
type Uinst struct {
	gen  *Ugen
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
	var ugen_out Ugen
	ugen_out = Ugen(ugen)
	return &ugen_out, nil
}

func (u *Ugen) Create() *Uinst {
	var uinst Uinst
	uinst.gen = u
	uinst.inst = C.ugen_create(*((*C.ugen_t)(u)))
	return &uinst
}

func (ui *Uinst) Run(buf []float64) {
	C.ugen_run(
		*((*C.ugen_t)(ui.gen)),
		ui.inst,
		(*C.double)(unsafe.Pointer(&buf[0])),
		C.int(len(buf)),
	)
}

func (ui *Uinst) Destroy() {
	C.ugen_destroy(
		*((*C.ugen_t)(ui.gen)),
		ui.inst,
	)
}

func (u *Ugen) Close() error {
	C.ugen_close(*((*C.ugen_t)(u)))
	err := C.error()
	if err != nil {
		return errors.New(C.GoString(err))
	}
	return nil
}
