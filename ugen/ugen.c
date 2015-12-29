#include <stdlib.h>
#include <stdio.h>
#include <dlfcn.h>
#include "ugen.h"

char *err;

char *error() {
  return err;
}

ugen_t *ugen_load(char *filename) {
  ugen_t *u = (ugen_t *)malloc(sizeof(ugen_t));

  u->refcount = 0;
  u->closed = 0;

  u->handle = dlopen(filename, RTLD_NOW);
  err = dlerror();
  if (err) return u;

  u->run = dlsym(u->handle, "run");
  err = dlerror();
  if (err) return u;

  u->create = dlsym(u->handle, "create");
  err = dlerror();
  if (err) return u;

  u->destroy = dlsym(u->handle, "destroy");
  err = dlerror();
  if (err) return u;

  u->msg = dlsym(u->handle, "msg");
  err = dlerror();
  if (err) return u;

  return u;
}

void *ugen_create(ugen_t *u) {
  void *(*create)() = u->create;
  u->refcount++;
  return create();
}

void ugen_destroy(ugen_t *u, void *instance) {
  void (*destroy)(void *) = u->destroy;
  u->refcount--;
  destroy(instance);
  if (u->refcount == 0 && u->closed) {
    ugen_really_close(u);
  }
}

int ugen_run(ugen_t *u, double **param, void *instance, double *buf, int len) {
  int (*run)(void *, double **, double *, int) = u->run;
  int kill = 0;
  for (int i = 0; i < len; i++) {
    if (run(instance, param, &(buf[i]), len)) {
      return 1;
    }
  }
  return 0;
}

void ugen_msg(ugen_t *u, void *instance, int sig) {
  int (*msg)(void *, int) = u->msg;
  msg(instance, sig);
}

void ugen_close(ugen_t *u) {
  u->closed = 1;
  if (u->refcount == 0) {
    ugen_really_close(u);
  }
}

void ugen_really_close(ugen_t *u) {
  dlclose(u->handle);
  free(u);
  err = dlerror();
}
