#!/bin/sh
# compare.sh <original sources> <dir with .drf files>
#
# Plays the recordings in the original game, built from its sources in
# Docker, and then in this port, which has to end each of them the same way.
set -e

src=$(cd "$1" && pwd)
drfs=$(cd "$2" && pwd)
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "${here}/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT

docker build -q -t digger-reference "${here}" > /dev/null
docker run --rm -v "${src}":/src:ro -v "${work}":/work digger-reference sh -c \
  'cmake -S /src -B /work/build -DCMAKE_BUILD_TYPE=Release > /dev/null &&
   make -C /work/build -j8 > /dev/null'

mkdir "${work}/data"
cp "${drfs}"/*.drf "${work}/data/"
docker run --rm -v "${work}":/work digger-reference sh -c \
  'cd /work/data && for f in *.drf; do
     /work/build/digger /Q /S:0 "/E:${f}" | tr -d "\r" > "${f%.drf}.out"
   done'

docker run --rm -v "${root}":/app:ro -v "${work}/data":/data:ro node:24-alpine \
  node /app/tests/drf.mjs /data
