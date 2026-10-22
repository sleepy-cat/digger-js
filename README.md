# Digger in the browser

A port of [Digger Remastered](https://github.com/sobomax/digger) (C, SDL) to
HTML and JavaScript, with a small Go server, in steps:

| Directory                         | What it is                                         |
|-----------------------------------|----------------------------------------------------|
| [v00_hello_word](v00_hello_word)  | the game in the browser, high scores on the server |
| [v01_drf](v01_drf)                | plus recording and playback of games (DRF files)   |
| [v03_edrf](v03_edrf)              | plus the newer eDRF format, checked as it plays    |
| [v04_ws](v04_ws)                  | plus network games over WebSocket                  |

Each has a README of its own on how to run it.

## Building the original C code in Docker

The original game is the reference the port is checked against: the same
recording has to end the same way in both. It builds in Docker, with nothing
installed on the machine but Docker itself. The commands below are run from
this directory, with the sources of the original next to it in `../digger`:

    git clone https://github.com/sobomax/digger ../digger

The image with what it takes to build it (Debian, CMake, Clang, SDL2, zlib),
made once:

    docker build -t digger-reference v03_edrf/tests/reference

The build, with the sources mounted read-only and the result in `build/`:

    mkdir -p build
    docker run --rm -v "$PWD/../digger":/src:ro -v "$PWD/build":/build \
      digger-reference sh -c 'cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release && make -C /build -j8'

That makes `build/digger`, a Linux binary: it runs in the same image. The
image sets SDL to go without a screen and sound, and the game to print how a
playback ended, so a recording plays as fast as it goes (`/S:0`) and quits
(`/E:`):

    docker run --rm -v "$PWD/build":/build:ro -v "$PWD/../digger/tests/data":/data:ro \
      digger-reference /build/digger /Q /S:0 /E:/data/sobodig.drf

    score=3100 level=2 ticks=1378

The results of the recordings of the original are in
`../digger/tests/results`. To play a set of recordings in both the original
and the port and compare, all of the above done in one go:

    v03_edrf/tests/reference/compare.sh ../digger ../digger/tests/data

The image is about 1 GB; `docker rmi digger-reference` removes it, and
`rm -rf build` the build.
