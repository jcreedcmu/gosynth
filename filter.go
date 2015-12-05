package main

import (
	"log"
	"math/rand"
	"net"
	"net/http"
	"net/rpc"
)

type NoisyFilter struct{}

func filter(buf []float32) {
	for i := range buf {
		buf[i] *= (rand.Float32() - 0.5) * 2.0
	}
}

func (t *NoisyFilter) Filter(args *[]float32, reply *[]float32) error {
	var tmpbuf []float32
	buf := *args
	for i := range buf {
		tmpbuf = append(tmpbuf, buf[i]*(rand.Float32()-0.5)*2.0)
	}
	reply = &tmpbuf
	log.Printf("LENGTH OF BUFFER %d", len(*reply))
	return nil
}

func main() {
	fun := new(NoisyFilter)
	rpc.Register(fun)
	rpc.HandleHTTP()
	l, e := net.Listen("tcp", ":1234")
	if e != nil {
		log.Fatal("listen error:", e)
	}
	go http.Serve(l, nil)
	select {}
}
