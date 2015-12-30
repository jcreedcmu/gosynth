#include <stdlib.h>
#include <math.h>
#include <stdio.h>

typedef struct {
  double phase;
  int t;
} state_t;

void msg(void *instance, int sig) {
}

int run(void *instance, double **param, double *out, int ix) {
  double amp = *(param[0]);
  state_t *state = (state_t *)instance;

  double t = state->t;
  state->t++;

  double bot = 30.0;
  double top = 120.0;
  double falling = top - (top-bot)*(t/3500.0);
  if (falling < bot) {
    falling = bot;
  }
  double fr = falling * (1.0 + 0.5*sin(2.0 * M_PI * 25.0 * t/44100.0));
  state->phase += fr / 44100.0;
  if (state->phase > 1) state->phase--;
  double rv = sin(2.0 * M_PI * state->phase);
  double hold = 2000;
  double env = 1.0;
  if (t > hold) {
    env = exp(-(t - hold) / 2500.0) - 0.01;
  }
  if (env < 0) {
    return 1;
  }
  else {
    *out += env * amp * rv;
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
