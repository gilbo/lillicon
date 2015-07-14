
SUBDIR:=shewchuk_triangle
EMSCRIPTEN_DIR:=../emsdk_portable/emscripten/1.30.0
EMTRI_DIR:=emtriangle_port


main: $(SUBDIR)/triangle.c $(SUBDIR)/triangle.h $(SUBDIR)/makefile
	make -C $(SUBDIR) triangle.o
	gcc -dynamiclib -o $(SUBDIR)/triangle.dylib $(SUBDIR)/triangle.o

emscripten:
	cd $(SUBDIR); ../$(EMSCRIPTEN_DIR)/emcc -O --memory-init-file 0 \
        -DDARWIN -DTRILIBRARY \
        triangle.c ../$(EMTRI_DIR)/triangle_extend.c \
        -o ../$(EMTRI_DIR)/libtriangle.js \
        -s EXPORTED_FUNCTIONS="['_triangulate','_trifree','_sizeof_int','_sizeof_double','_sizeof_triangulateio','_sizeof_char_ptr','_sizeof_void_ptr']"

clean:
	-make -C $(SUBDIR) distclean
	-rm $(SUBDIR)/triangle.dylib
	-rm $(EMTRI_DIR)/libtriangle.js