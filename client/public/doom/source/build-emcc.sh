#!/bin/bash
set -e
# -include src/doomtype.h: with this emscripten, emscripten headers pull in stdbool.h before doomtype.h in five
# files (g_game.c, d_main.c, d_loop.c, i_system.c, i_timer.c), which made `boolean` a 1-byte bool there and an int
# enum everywhere else, corrupting shared arrays such as playeringame[]. Including doomtype.h first gives every file
# Chocolate Doom's int enum (the engine relies on it, e.g. rotate = -1). No source file is changed.
cd "$(dirname "$0")"
source ../emsdk/emsdk_env.sh >/dev/null 2>&1
mkdir -p obj out
CF="-O3 -include src/doomtype.h -I. -Isrc -Isrc/doom -Itextscreen -Iopl -Ipcsound -DHAVE_CONFIG_H -sUSE_SDL=2 -sUSE_SDL_MIXER=2 -sUSE_SDL_NET=2 -Wno-everything"
SRCS=$(cat srcs.txt)
export CF
echo "$SRCS" | xargs -P8 -I{} bash -c 'o=obj/$(echo {} | tr / _).o; emcc $CF -c {} -o $o' 
emcc obj/*.o -O3 -sUSE_SDL=2 -sUSE_SDL_MIXER=2 -sUSE_SDL_NET=2 -sINVOKE_RUN=0 -sWASM=1 -sFORCE_FILESYSTEM=1 \
 -sEXPORTED_RUNTIME_METHODS=FS,callMain,ccall -sEXIT_RUNTIME=1 -sINITIAL_MEMORY=64MB -sALLOW_MEMORY_GROWTH=0 \
 -sASYNCIFY -sERROR_ON_UNDEFINED_SYMBOLS=0 -sENVIRONMENT=web -sMODULARIZE=0 -lwebsocket.js -o out/websockets-doom.js
ls -la out
