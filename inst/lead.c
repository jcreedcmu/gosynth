#include <stdlib.h>
#include <math.h>
#include <stdio.h>

typedef struct {
  double phase;
  double last;
  int t;
  int gate;
} state_t;

#define STOP     0
#define RESTART  1

#define ATTACK  400
#define DECAY   6000
#define SUSTAIN 0.4
#define RELEASE 6000
#define FALLOFF 0.0000015

int get_env(state_t *state, double *env) {
  double t = state->t;
  state->t++;
  if (state->gate) {
    if (t < ATTACK) {
      double phase = t / ATTACK;
      *env = (1.0-phase)*state->last + phase;
      return 0;
    }
    double pat = t - ATTACK;
    if (pat < DECAY) {
      double phase = pat / DECAY;
      *env = (1.0 - phase) + phase*SUSTAIN;
      return 0;
    }
    if (SUSTAIN > 0.0) {
      *env = SUSTAIN * exp(-FALLOFF*(t-ATTACK-DECAY));
      return 0;
    }
	} else {
    double phase = t / RELEASE;
    if (phase < 1) {
      *env = (1.0-phase)*state->last + phase*0.0;
      return 0;
    }
  }
  *env = 0.0;
  return 1;
}

void msg(void *instance, int sig) {
  state_t *state = (state_t *)instance;
  switch (sig) {
  case STOP:
    get_env(state, &state->last);
    state->gate = 0;
    break;
  case RESTART:
    get_env(state, &state->last);
    state->t = 0;
    state->gate = 1;
    break;
  }
}

int run(void *instance, double **param, int ix) {
  double *out = param[0] + ix;
  double freq = *(param[1]);
  double amp = *(param[2]);
  state_t *state = (state_t *)instance;

  double env;
  int kill = get_env(state, &env);

  if (!kill) {
    *out += amp * (state->phase - 0.5) * env;
    state->phase += (freq / 44100.0);
    if (state->phase > 1) state->phase--;
  }

  return kill;
}

void *create() {
  state_t *res = (state_t *)malloc(sizeof(state_t));
  res->phase = 0.0;
  res->last = 0.0;
  res->gate = 1;
  res->t = 0;
  return (void *)res;
}

void destroy(void *instance) {
  free(instance);
}
