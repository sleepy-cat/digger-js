// A hash of the whole game state (state_hash.c): of the same variables as in
// the original, in the same order, each as many bytes as its C type has, so
// that it comes out the same for the same game. eDRF recordings have them,
// to check that a game played back goes exactly as recorded.

import { md5 } from './md5.js';
import { dg } from './state.js';
import { field } from './drawing.js';
import { diggerhash } from './digger.js';
import { monsterhash } from './monster.js';
import { bagshash } from './bags.js';
import { gettscore } from './scores.js';

// The bytes of the values given, little-endian.
export class StateHash {
  constructor() {
    this.bytes = [];
  }

  int8(v) {
    this.bytes.push(v & 0xff);
  }

  bool(v) {
    this.int8(v ? 1 : 0);
  }

  int16(v) {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }

  int32(v) {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  }

  // The first 32 bits of the MD5 of them all.
  final() {
    const d = md5(Uint8Array.from(this.bytes));
    return ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
  }
}

function append(h) {
  for (const f of field) h.int16(f);
  diggerhash(h);
  monsterhash(h);
  bagshash(h);
  h.int32(dg.randv);
  h.int32(gettscore(0));
  h.int32(gettscore(1));
  if (dg.gauntlet) {
    h.int32(dg.cgtime); // uint32 in the original: the same bytes
    h.bool(dg.timeout);
  }
}

// All of the game state that matters for how it goes, in one value.
export function gamestatehash() {
  const h = new StateHash();
  append(h);
  return h.final();
}

// The same, and of the tick it was taken on.
export function gamestatehashtick(tick) {
  const h = new StateHash();
  append(h);
  h.int32(tick);
  return h.final();
}
