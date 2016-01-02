#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define REVERB_LEN 44100

typedef struct {
  int ix;
  double buf[REVERB_LEN];
} state_t;

void msg(void *instance, int sig) {
}

double tap(state_t *s, int a) {
  return s->buf[(s->ix + a)%REVERB_LEN];
}

int run(void *instance, double **param, int ix) {
  double *out = param[0] + ix;
  state_t *s = (state_t *)instance;
  s->ix = (s->ix + REVERB_LEN - 1) % REVERB_LEN;
  s->buf[s->ix] = *out
    + tap(s, 2932) * 0.15
    + tap(s, 5053) * 0.025
    + tap(s, 4053) * 0.025
    + tap(s, 5043) * 0.0125
    + tap(s, 25557) * 0.125
    + tap(s, 24) * 0.05
    ;
  *out = s->buf[s->ix];
  return 0;
}

void *create() {
  state_t *s = (state_t *)malloc(sizeof(state_t));
  s->ix = 0;
  memset(s->buf, 0, sizeof(s->buf));
  return (void *)s;
}

void destroy(void *instance) {
  free(instance);
}
