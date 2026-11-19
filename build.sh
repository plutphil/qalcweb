
#!/usr/bin/env bash
set -euo pipefail

ROOT=/project
LIBS="$ROOT/libs"
DEPS="$ROOT/wasm-deps"
SRC="$ROOT/src"
WEB="$ROOT/web"
JOBS=$(nproc)

mkdir -p "$LIBS" "$DEPS" "$SRC" "$WEB"

export CPPFLAGS="-I$DEPS/include -I$DEPS/include/libxml2"
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

    [ -f configure ] || autoreconf -fiv

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
        --disable-textport \
        --disable-unittests \
        --without-libcurl \
        --without-icu \
        --without-gnuplot-call \
        --disable-nls

    emmake make -j"$JOBS"
    emmake make install
}

build_application() {
    mkdir -p "$WEB/share/qalculate"

    cp "$LIBS/libqalculate"/data/*.xml "$WEB/share/qalculate/"

    em++ "$SRC/main.cpp" \
        -I"$DEPS/include" \
        -I"$DEPS/include/libxml2" \
        -L"$DEPS/lib" \
        -lqalculate -lxml2 -lmpfr -lgmp -lm \
        --bind -O2 \
        -s MODULARIZE=1 \
        -s EXPORT_ES6=1 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s ENVIRONMENT=web \
        --preload-file "$WEB/share/qalculate@/share/qalculate" \
        -o "$WEB/qalculate.js"
}

build_gmp
build_mpfr
build_libxml2
build_libqalculate
build_application

echo "Build completed"
