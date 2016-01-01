package gosynth

import (
	"fmt"
	"github.com/jcreedcmu/gosynth/service"
	"log"
)

var aliases = make(map[int]int)

func cmdHandle(cmd service.WsCmd) (interface{}, error) {
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
	case "note":
		args := cmd.Args.(service.WsCmdNote)
		if args.On {
			_, already := aliases[args.Id]
			if !already {
				aliases[args.Id] = genOn(args.UgenName, args.Priority, args.Pitch, args.Vel)
			} else {
				log.Printf("Trying to play note with duplicate external id %d\n", args.Id)
			}
		} else {
			internal, ok := aliases[args.Id]
			if ok {
				genOff(internal)
				delete(aliases, args.Id)
			} else {
				log.Printf("Trying to delete nonexistent note, external id %d\n", args.Id)
			}
		}
	case "halt":
		aliases = make(map[int]int)
		genAllOff()
	case "schedule":
		args := cmd.Args.(service.WsCmdSchedule)
		log.Printf("%+v", args)
		return globalTime, nil
	default:
		return nil, fmt.Errorf("Unknown action %+v\n", cmd)
	}
	return "ok", nil
}
