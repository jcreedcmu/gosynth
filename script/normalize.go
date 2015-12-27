package main

import (
	"encoding/binary"
	"fmt"
	"io/ioutil"
	"os"
)

func main() {
	f, err := os.Open("/tmp/recording.f32")
	chk(err)
	for {
		var buf [44100]float32
		err := binary.Read(f, binary.BigEndian, &buf)
		fmt.Printf("%d\n", len(buf))
		chk(err)
	}
}

func chk(err error) {
	if err != nil {
		panic(err)
	}
}
