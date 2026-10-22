#!/bin/sh
# compare.sh <original sources> <dir with .drf and .edrf files>
#
# Plays the recordings in the original game, built from its sources in
# Docker, and then in this port, which has to end each of them the same way.
# The original checks an eDRF against its game state hashes too, and says if
# the game didn't go as recorded (exit status 2).
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
for f in "${drfs}"/*.drf "${drfs}"/*.edrf; do
  if [ -f "${f}" ]; then cp "${f}" "${work}/data/"; fi
done
docker run --rm -v "${work}":/work digger-reference sh -c \
  'cd /work/data && for f in *.drf *.edrf; do
     [ -f "${f}" ] || continue
     /work/build/digger /Q /S:0 "/E:${f}" > out.tmp 2> err.tmp && rc=0 || rc=$?
     tr -d "\r" < out.tmp > "${f%.*}.out"
     [ ${rc} -eq 0 ] || echo "original: ${f}: exit status ${rc}: $(cat err.tmp)"
   done; rm -f out.tmp err.tmp'

docker run --rm -v "${root}":/app:ro -v "${work}/data":/data:ro node:24-alpine \
  node /app/tests/drf.mjs /data
