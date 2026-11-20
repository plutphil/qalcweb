
FROM emscripten/emsdk:latest

RUN apt-get update && apt-get install -y \
    git \
    autoconf \
    automake \
    libtool \
    pkg-config \
    cmake \
    make \
    g++ \
    m4 \
    gettext \
    texinfo \
    autopoint \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /project


# CMD ["bash","build.sh"]
CMD ["bash"]