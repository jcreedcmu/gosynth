#include <stdlib.h>

void msg(void *instance, int sig) {
}

int run(void *instance, double **param, int ix) {
  double *outL = param[0] + ix;
  double *outR = param[1] + ix;
  double valL = *outL;
  double valR = *outR;
  *outL = valL + valR;
  *outR = valL + valR;
  return 0;
}

void *create() {
  return NULL;
}

void destroy(void *instance) {
}
