#include <stdlib.h>
#include <math.h>

typedef struct {
  double phase;
  int t;
} state_t;

int run(void *instance, double **param, double *out, int len) {
  double freq = *(param[0]);
  double amp = *(param[1]);
  state_t *state = (state_t *)instance;

  double env = exp(-state->t / 30000.0) - 0.001;
  if (env < 0)
    return 1;
  else {
    *out += amp * sin(2.0*M_PI*state->phase) * exp(-state->t / 30000.0);
    state->t++;
    state->phase += (freq / 44100.0);
    if (state->phase > 1) state->phase--;
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
