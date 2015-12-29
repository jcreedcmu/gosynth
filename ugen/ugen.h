typedef struct {
  // number of ugen instances alive and running that are attache to
  // this ugen's code.
  int refcount;

   // true if we've already tried to unload the ugen, though it may
   // not really deallocate until the refcount drops to zero.
  int closed;

  void *handle; // dlopen handle

  // the ugen functions:
  void *run;
  void *create;
  void *destroy;
  void *msg;
} ugen_t;

char *error();

// load and unload ugen definitions
ugen_t ugen_load(char *filename);
void ugen_close(ugen_t u);

// create and destroy individual notes/instances of a ugen
void *ugen_create(ugen_t u);
void ugen_destroy(ugen_t u, void *instance);

// ask a ugen instance to render a little bit of audio signal into a buffer
int ugen_run(ugen_t u, double **param, void *instance, double *buf, int len);

// send a simple integer message to a ugen instance, like to tell it
// to stop soon (but maybe it'll decide to decay a while still before
// really deallocating itself) or to restart if we're playing a note
// again with the pedal held down, or during a still-elapsing decay of
// a previous note at the same pitch. The semantics of these messages
// is left open here, the ugens and whoever's allocating them can
// decide on a protocol.
void ugen_msg(ugen_t u, void *instance, int sig);

// actually deallocate all the ugen's functions
void ugen_really_close(ugen_t u);
