#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-/project}
LIBS="$ROOT/libs"
DEPS="$ROOT/wasm-deps"
SRC="$ROOT/src"
WEB="$ROOT/web"
JOBS=$(nproc)

mkdir -p "$LIBS" "$DEPS" "$SRC" "$WEB"

export CPPFLAGS="-I$DEPS/include -I$DEPS/include/libxml2"
export CFLAGS="-O2 -pthread"
export CXXFLAGS="-O2 -pthread"
export LDFLAGS="-L$DEPS/lib"
export PKG_CONFIG_PATH="$DEPS/lib/pkgconfig"
export PKG_CONFIG_LIBDIR="$DEPS/lib/pkgconfig"
unset PKG_CONFIG_SYSROOT_DIR || true

clone() {
    if [ ! -d "$2/.git" ]; then
        git clone "$1" "$2"
    fi
}


build_gmp() {
    if [ -f "$DEPS/lib/libgmp.a" ]; then
        echo "GMP already built"
        return
    fi

    clone https://github.com/alisw/GMP.git "$LIBS/gmp-src"
    cd "$LIBS/gmp-src"

    emconfigure ./configure \
        --host=none \
        --prefix="$DEPS" \
        --disable-shared \
        --enable-static \
        --disable-assembly \
        --disable-documentation

    emmake make -j"$JOBS"
    emmake make install
}


build_mpfr() {
    if [ -f "$DEPS/lib/libmpfr.a" ]; then
        echo "MPFR already built"
        return
    fi

    clone https://github.com/alisw/MPFR.git "$LIBS/mpfr-src"
    cd "$LIBS/mpfr-src"

    autoreconf -fiv

    emconfigure ./configure \
        --prefix="$DEPS" \
        --with-gmp="$DEPS" \
        --disable-shared \
        --enable-static \
        --disable-assembly

    emmake make -j"$JOBS"
    emmake make install
}

build_libxml2() {
    if [ -f "$DEPS/lib/libxml2.a" ]; then
        echo "libxml2 already built"
        return
    fi

    clone https://github.com/GNOME/libxml2.git "$LIBS/libxml2-src"

    emcmake cmake \
        -S "$LIBS/libxml2-src" \
        -B "$LIBS/libxml2-build" \
        -DCMAKE_INSTALL_PREFIX="$DEPS" \
        -DBUILD_SHARED_LIBS=OFF \
        -DLIBXML2_WITH_PYTHON=OFF \
        -DLIBXML2_WITH_LZMA=OFF \
        -DLIBXML2_WITH_ZLIB=OFF \
        -DLIBXML2_WITH_ICONV=OFF \
        -DLIBXML2_WITH_HTTP=OFF \
        -DLIBXML2_WITH_FTP=OFF \
        -DLIBXML2_WITH_PROGRAMS=OFF \
        -DLIBXML2_WITH_TESTS=OFF

    cmake --build "$LIBS/libxml2-build" -j"$JOBS"
    cmake --install "$LIBS/libxml2-build"
}

build_libqalculate() {
    if [ -f "$DEPS/lib/libqalculate.a" ]; then
        echo "libqalculate already built"
        return
    fi

    clone https://github.com/Qalculate/libqalculate.git "$LIBS/libqalculate"
    cd "$LIBS/libqalculate"

    [ -f configure ] || NOCONFIGURE=1 ./autogen.sh

    export LIBXML_CFLAGS="-I$DEPS/include/libxml2"
    export LIBXML_LIBS="-L$DEPS/lib -lxml2"

    emconfigure ./configure \
        --host=wasm32-unknown-emscripten \
        --prefix="$DEPS" \
        --disable-shared \
        --enable-static \
        --disable-unittests \
        --disable-nls \
        --without-libcurl \
        --without-icu \
        --without-gnuplot-call \
        --with-readline=no

    cd "$LIBS/libqalculate"

    python3 - <<'PY'
from pathlib import Path
import re

path = Path("src/qalc.cc")
text = path.read_text()

fallback = '''#ifndef HAVE_LIBREADLINE
static char rl_line_buffer[1] = "";
static int rl_point = 0;
static int rl_end = 0;
#endif
'''
text = re.sub(r'#ifndef HAVE_LIBREADLINE\nstatic char rl_line_buffer\[1\] = "";\nstatic int rl_point = 0;\nstatic int rl_end = 0;\n#endif\n', '', text)
text = re.sub(r'MathStructure mparsedf;\n', '', text)

needle = '#include <libqalculate/MathStructure-support.h>\n'
text = text.replace(needle, needle + '\n' + fallback + '\n', 1)

mstruct_needle = 'MathStructure *mstruct, *parsed_mstruct, mstruct_exact, prepend_mstruct;\n'
text = text.replace(mstruct_needle, mstruct_needle + 'MathStructure mparsedf;\n', 1)

path.write_text(text)
PY

    emmake make -j"$JOBS"
    emmake make install
}

build_application() {
    mkdir -p "$WEB/share/qalculate"

    cp "$LIBS/libqalculate"/data/*.xml "$WEB/share/qalculate/"

    em++ "$LIBS/libqalculate/src/qalc.cc" \
        -DHAVE_CONFIG_H \
        -DPACKAGE_DATA_DIR='"/share"' \
        -I"$LIBS/libqalculate" \
        -I"$LIBS/libqalculate/libqalculate" \
        -I"$DEPS/include" \
        -I"$DEPS/include/libxml2" \
        -L"$DEPS/lib" \
        -lqalculate -lxml2 -lmpfr -lgmp -lm \
        -O2 \
        -pthread \
        -s MODULARIZE=1 \
        -s EXPORT_ES6=1 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s ENVIRONMENT=worker \
        -s FORCE_FILESYSTEM=1 \
        -s EXIT_RUNTIME=0 \
        -s PTHREAD_POOL_SIZE=4 \
        -s PROXY_TO_PTHREAD=1 \
        -s EXPORTED_RUNTIME_METHODS='["callMain","FS"]' \
        --preload-file "$WEB/share/qalculate@/share/qalculate" \
        -o "$WEB/qalc.js"

    python3 - <<'PY'
from pathlib import Path
path = Path("$WEB/qalc.js")
PY

    cd "$ROOT"
    npm install --silent
    npm run build:web
}

build_gmp
build_mpfr
build_libxml2
build_libqalculate
build_application

echo "Build completed"
