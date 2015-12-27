all:
	make -C inst
	go run main.go
record:
	make -C inst
	go run main.go --record
