package gosynth

import (
	"github.com/jcreedcmu/gosynth/service"
	"log"
)

func cmdHandle(cmd service.WsCmd) {
	mutex.Lock()
	defer mutex.Unlock()

	switch cmd.Action {
	case "load":
		args := cmd.Args.(service.WsCmdLoad)
		log.Printf("LOADING %s -> %s\n", args.Filename, args.Name)
		err := LoadUgen(args.Filename, args.Name)
		if err != nil {
			log.Printf("Error loading ugen: %s\n", err)
		}
	case "unload":
		args := cmd.Args.(service.WsCmdLoad)
		log.Printf("UNLOADING %s\n", args.Name)
		UnloadUgen(args.Name)
	default:
		log.Printf("Unknown action %+v\n", cmd)
	}
}
