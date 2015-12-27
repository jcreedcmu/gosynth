#include <stdlib.h>
#include <math.h>
#include <stdio.h>

typedef struct {
  double phase;
  int t;
} state_t;

void msg(void *instance, int sig) {
}

double frand() {
  return (double)rand()/(double)(RAND_MAX);
}

int run(void *instance, double **param, double *out, int len) {
  double amp = *(param[0]);
  state_t *state = (state_t *)instance;

  double t = state->t;
  state->t++;

  double rv = (frand() - 0.5) * exp(-t/1500.0) ;
  double bot = 40.0;
  double top = 200.0;
  double falling = top - (top-bot)*(t/2000.0);
  if (falling < bot) {
    falling = bot;
  }
  double fr = falling * (1.0 + sin(2.0 * M_PI * 30.0 * t/44100.0));

  state->phase += fr / 44100.0;
  if (state->phase > 1) state->phase--;
  rv += sin(2.0 * M_PI * state->phase) * exp(-t/1000.0);
  double env = exp(-t/1500.0) - 0.01;
  rv += sin(2 * M_PI * 127.0 / 44100.0 * t) * 0.5 * env;

  if (env < 0) {
    return 1;
  }
  else {
    *out += amp * env * rv;
    return 0;
  }
}

void *create() {
  state_t *res = (state_t *)malloc(sizeof(state_t));
  res->phase = 0.0;
  res->t = 0;
  return (void *)res;
}

void destroy(void *instance) {
  free(instance);
}
