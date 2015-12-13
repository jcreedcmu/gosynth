package service

import (
	"encoding/json"
	"github.com/gorilla/websocket"
	"log"
	"net/http"
)

var upgrader = websocket.Upgrader{}

type WsCmd struct {
	Action  string  `json:"action"`
	Fparam0 float64 `json:"fparam0"`
}

type CmdHandler func(WsCmd)

func (cmdHandle CmdHandler) wsHandle(w http.ResponseWriter, r *http.Request) {
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
				cmdHandle(cmd)
			}
		}
	}()
}

func Initialize(addr string, cmdHandle CmdHandler) {
	http.Handle("/", http.FileServer(http.Dir("public")))
	http.HandleFunc("/ws", cmdHandle.wsHandle)
	go func() {
		log.Fatal(http.ListenAndServe(addr, nil))
	}()
}
