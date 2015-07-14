
// make sure this is consistent with the original triangle settings
// WE'RE NOT USING SINGLE PRECISION
#ifdef SINGLE
#define REAL float
#else /* not SINGLE */
#define REAL double
#endif /* not SINGLE */


#include "../shewchuk_triangle/triangle.h"


int sizeof_int() {
  return sizeof(int);
}
int sizeof_double() {
  return sizeof(double);
}
int sizeof_triangulateio() {
  return sizeof(struct triangulateio);
}
int sizeof_char_ptr() {
  return sizeof(char*);
}
int sizeof_void_ptr() {
  return sizeof(void*);
}
