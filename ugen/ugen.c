#include <stdio.h>
#include <dlfcn.h>
#include "ugen.h"

char *err;

char *error() {
  return err;
}

ugen_t ugen_load(char *filename) {
  ugen_t u;

  u.handle = dlopen(filename, RTLD_NOW);
  err = dlerror();
  if (err) return u;

  u.run = dlsym(u.handle, "run");
  err = dlerror();
  if (err) return u;

  u.create = dlsym(u.handle, "create");
  err = dlerror();
  if (err) return u;

  u.destroy = dlsym(u.handle, "destroy");
  err = dlerror();
  if (err) return u;

  return u;
}

void *ugen_create(ugen_t u) {
  void *(*create)() = u.create;
  return create();
}

void ugen_destroy(ugen_t u, void *instance) {
  void (*destroy)(void *) = u.destroy;
  destroy(instance);
}

void ugen_run(ugen_t u, double **param, void *instance, double *buf, int len) {
  void (*run)(void *, double **, double *, int) = u.run;
  run(instance, param, buf, len);
}

void ugen_close(ugen_t u) {
  dlclose(u.handle);
  err = dlerror();
}
