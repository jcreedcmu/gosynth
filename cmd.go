package gosynth

import (
	"container/heap"
	"fmt"
	"github.com/jcreedcmu/gosynth/service"
	"log"
)

var aliases = make(map[int]int)

func cmdHandle(cmd service.WsCmd) (interface{}, error) {
	mutex.Lock()
	defer mutex.Unlock()
	return cmdHandleLocked(cmd)
}

func cmdHandleLocked(cmd service.WsCmd) (interface{}, error) {
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
		for _, tcmd := range args.Cmds {
			if args.Relative {
				tcmd.Time += globalTime
			}
			heap.Push(&queue, tcmd)
		}
		return globalTime, nil
	default:
		return nil, fmt.Errorf("Unknown action %+v\n", cmd)
	}
	return "ok", nil
}

type CmdQueue []service.TimedCmd

var queue = make(CmdQueue, 0)

func (pq CmdQueue) Len() int { return len(pq) }

func (pq CmdQueue) Less(i, j int) bool {
	return pq[i].Time < pq[j].Time
}

func (pq CmdQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
}

func (pq *CmdQueue) Push(x interface{}) {
	*pq = append(*pq, x.(service.TimedCmd))
}

func (pq *CmdQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	*pq = old[0 : n-1]
	return item
}

// don't call if cmdqueue is empty
func (pq *CmdQueue) Least() int64 {
	return (*pq)[0].Time
}

func FlushCmdQueueLocked(uptoTime int64) {
	for len(queue) > 0 && queue.Least() <= globalTime {
		tcmd := heap.Pop(&queue).(service.TimedCmd)
		cmdHandleLocked(tcmd.Cmd)
	}
}
