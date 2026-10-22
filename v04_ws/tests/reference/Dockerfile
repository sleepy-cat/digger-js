# What it takes to build the original Digger and play recordings in it
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake make clang libc6-dev libsdl2-dev zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*
# No screen nor sound, and the result printed at the end of a playback
ENV SDL_AUDIODRIVER=dummy SDL_VIDEODRIVER=dummy DIGGER_CI_RUN=1 HOME=/tmp CC=clang
