#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$ROOT/libs" "$ROOT/wasm-deps" "$ROOT/web"

docker run --rm -it \
    -v "$ROOT:/project" \
    -w /project \
    qalcwasm