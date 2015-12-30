package service

import (
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"log"
	"net/http"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// XXX could instead check that it's coming specifically from
		// localhost:8080 or the like
		return true
	},
}

type WsCmdPre struct {
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
}

type WsCmd struct {
	Action string
	Args   interface{}
}

type WsCmdLoad struct {
	Filename string
	Name     string
}

type WsCmdNote struct {
	On       bool
	Id       int
	UgenName string
	Vel      float64
	Pitch    int
}

func (cmd *WsCmd) UnmarshalJSON(b []byte) (err error) {
	var pre WsCmdPre
	err = json.Unmarshal(b, &pre)
	if err != nil {
		return
	}
	cmd.Action = pre.Action
	switch pre.Action {
	case "load", "unload":
		var post WsCmdLoad
		if err = json.Unmarshal(pre.Args, &post); err == nil {
			cmd.Args = post
		}
	case "note":
		var post WsCmdNote
		if err = json.Unmarshal(pre.Args, &post); err == nil {
			cmd.Args = post
		}
	case "halt":
		cmd.Args = nil
	default:
		return fmt.Errorf("Unrecognized cmd: %s", b)
	}
	return nil
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

				err := json.Unmarshal(message, &cmd)
				if err != nil {
					log.Println("json err:", err)
					continue
				}
				cmdHandle(cmd)
			}
		}
	}()
}

func Initialize(addr string, cmdHandle CmdHandler) {
	http.HandleFunc("/ws", cmdHandle.wsHandle)
	go func() {
		log.Fatal(http.ListenAndServe(addr, nil))
	}()
}
