#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

typedef struct {
  double buf1;
  double buf2;
} state_t;

void msg(void *instance, int sig) {
}

int run(void *instance, double **param, int ix) {
  double *out = param[0] + ix;
  double freq = *(param[1]);
  double Q = *(param[2]);


  state_t *s = (state_t *)instance;

  double S = 44100.0 / (2 * M_PI * freq);
  double A = -(S/Q + 2.0*S*S) / (1.0 + S/Q + S*S);
  double B = (S * S) / (1.0 + S/Q + S*S);
  double C = 3.0 / (1.0 + S/Q + S*S);

  double w = *out;

  *out = C*w - A*s->buf1 - B*s->buf2;
  s->buf2 = s->buf1;
  s->buf1 = *out;


  return 0;
}

void *create() {
  state_t *s = (state_t *)malloc(sizeof(state_t));
  s->buf1 = 0;
  s->buf2 = 0;
  return (void *)s;
}

void destroy(void *instance) {
  free(instance);
}
