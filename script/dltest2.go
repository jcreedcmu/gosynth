package main

// #include <stdio.h>
// #include "func.h"
// int fortytwo()
// {
//	    return 42;
// }
import "C"

import "fmt"

func main() {
	fmt.Printf("%d\n", C.fortytwo())
	C.ACFunction()
}
