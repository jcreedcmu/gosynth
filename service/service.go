package service

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

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
	Priority float64
	Pitch    int
}

type WsCmdSchedule struct {
	Cmds []struct {
		Time int64
		Cmd  WsCmd
	}
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
	case "schedule":
		var post WsCmdSchedule
		if err = json.Unmarshal(pre.Args, &post); err == nil {
			cmd.Args = post
		}
	default:
		return fmt.Errorf("Unrecognized cmd: %s", b)
	}
	return nil
}

type CmdHandler func(WsCmd) (interface{}, error)

func (cmdHandle CmdHandler) rootHandle(rw http.ResponseWriter, req *http.Request) {
	// Allow any origin
	if origin := req.Header.Get("Origin"); origin != "" {
		rw.Header().Set("Access-Control-Allow-Origin", origin)
		rw.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		rw.Header().Set("Access-Control-Allow-Headers",
			"Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
	}

	decoder := json.NewDecoder(req.Body)
	var cmd WsCmd
	err := decoder.Decode(&cmd)
	if err != nil {
		rw.WriteHeader(401)
		fmt.Fprintf(rw, "couldn't parse json (%+v): %s", req.Body, err)
		return
	}
	resp, err := cmdHandle(cmd)
	if err != nil {
		rw.WriteHeader(500)
		fmt.Fprintf(rw, "error handling command: %s", err)
		return
	}
	str, err := json.Marshal(resp)
	if err != nil {
		rw.WriteHeader(500)
		fmt.Fprintf(rw, "error encoding response object %+v: %s", err, resp)
		return
	}
	fmt.Fprintf(rw, "%s", string(str))
}

func Initialize(addr string, cmdHandle CmdHandler) {
	http.HandleFunc("/", cmdHandle.rootHandle)
	go func() {
		log.Fatal(http.ListenAndServe(addr, nil))
	}()
}
