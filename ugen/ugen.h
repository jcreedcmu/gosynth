typedef struct {
  void *handle;
  void *run;
  void *create;
  void *destroy;
} ugen_t;

char *error();
ugen_t ugen_load(char *filename);
void ugen_run(ugen_t u, double **param, void *instance, double *buf, int len);
void *ugen_create(ugen_t u);
void ugen_destroy(ugen_t u, void *instance);
void ugen_close(ugen_t u);
