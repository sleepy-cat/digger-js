// Recording and playback of games in eDRF, the extended format of the
// original (edrf.c). Unlike a DRF it has the controls each player pressed on
// every tick, rather than where their Digger went, and hashes of the whole
// game state on the way: a playback is checked against them, and tells
// whether the game went exactly as recorded. See EDRF.md for the format.

import { dg, MWIDTH, MHEIGHT, MSIZE, DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT, leveldat } from './state.js';
import { gamestatehash, gamestatehashtick } from './statehash.js';
import { getlevch } from './main.js';

export const MAGIC = 'eDRF 2';

const SLOTS = 2;
const CHUNK = 32; // ticks of controls on an I line
const CKPT_EVERY = 8 * CHUNK; // ticks between C records
const UNREAD = 0x80; // the controls of a slot on a tick it wasn't read

export const CTRL_UP = 0x01;
export const CTRL_DOWN = 0x02;
export const CTRL_RIGHT = 0x04;
export const CTRL_LEFT = 0x08;
export const CTRL_FIRE = 0x10;

// A queue: pushed at the end, taken from the front.
class Queue {
  constructor() {
    this.v = [];
    this.pos = 0;
  }

  push(x) {
    this.v.push(x);
  }

  empty() {
    return this.pos >= this.v.length;
  }

  pop() {
    const x = this.v[this.pos++];
    if (this.empty()) this.clear();
    return x;
  }

  clear() {
    this.v = [];
    this.pos = 0;
  }
}

// How a playback went: 'checked' to the end as recorded, 'failed' if the
// game went otherwise, 'stopped' before the end of the recording,
// 'truncated' if the recording ends before its game does; and why.
export const result = { status: '', message: '' };

// --- Recording ---------------------------------------------------------------

let out = [];
const recin = Array.from({ length: SLOTS }, () => []);
const slotread = new Array(SLOTS).fill(false);
let recmaps = [];

// Starts the recording of a game, with the lines of the header of a DRF but
// for the maps (version, mode, score for a life).
export function recinit(header) {
  out = [MAGIC, ...header];
  for (let s = 0; s < SLOTS; s++) {
    recin[s] = [];
    slotread[s] = false;
  }
  recmaps = [];
}

export function recording() {
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

function idle(v) {
  return v.every((x) => (x & ~UNREAD) === 0);
}

function runs(v) {
  let s = ' ';
  for (let i = 0, j; i < v.length; i = j) {
    for (j = i + 1; j < v.length && v[j] === v[i]; j++);
    s += String.fromCharCode(64 + (v[i] & ~UNREAD));
    if (j - i > 1) s += j - i;
  }
  return s;
}

// The same controls for every slot (unread ones going with any), or null.
function allsame() {
  if (recin.some((v) => v.length !== recin[0].length)) return null;
  const same = [];
  for (let i = 0; i < recin[0].length; i++) {
    let x = UNREAD;
    for (const v of recin) {
      if (v[i] === UNREAD) continue;
      if (x !== UNREAD && x !== v[i]) return null;
      x = v[i];
    }
    same.push(x === UNREAD ? 0 : x);
  }
  return same;
}

// Writes the controls of the chunk so far: the same for every slot, or of
// the slots that had some.
function flushin() {
  if (out.length !== 0 && recin[0].length !== 0) {
    const same = allsame();
    if (same !== null) {
      out.push(`I${runs(same)}`);
    } else {
      const samelen = recin.every((v) => v.length === recin[0].length);
      const list = recin.map((v) => !samelen || !idle(v));
      let line = 'I';
      list.forEach((l, s) => { if (l) line += s; });
      list.forEach((l, s) => { if (l) line += runs(recin[s]); });
      out.push(line);
    }
  }
  for (let s = 0; s < SLOTS; s++) recin[s] = [];
}

function hex(h) {
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function putstate(what, hash) {
  flushin();
  out.push(`${what} ${hex(hash)}`);
}

// --- Playback ----------------------------------------------------------------

let lines = [];
let lineno = 0;
let plyeof = true;
const plyin = Array.from({ length: SLOTS }, () => new Queue());
const plyrand = new Queue();
const plyckpt = new Queue();
const plyrend = new Queue();
const plylev = new Queue(); // {level, map}
let plymaps = [];
let levnew = [];
let levnewno = 0;
let levrows = -1;
let plyquit = -1;
let plyhasend = false;
let plyendtick = 0;
let plyendhash = 0;

// Plays back the body of an eDRF, the lines after its header.
export function playopen(body) {
  lines = body;
  // A last line without its line break was cut short by the program being
  // stopped while it was recording
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.pop();
  lineno = 0;
  plyeof = false;
  for (const q of [...plyin, plyrand, plyckpt, plyrend, plylev]) q.clear();
  plymaps = [];
  levrows = -1;
  plyquit = -1;
  plyhasend = false;
  result.status = '';
  result.message = '';
  dg.edrfplaying = true;
}

export function stopplay() {
  dg.edrfplaying = false;
  plyeof = true;
}

function fail(message) {
  if (result.status !== 'failed') {
    result.status = 'failed';
    result.message = message;
  }
}

// Controls as runs of '@'+bits each with how many ticks, if more than one.
function loadruns(s, q) {
  const re = /([@-_])(\d*)/y;
  let n = 0;
  for (let m; (m = re.exec(s)) !== null;) {
    const count = m[2] === '' ? 1 : parseInt(m[2], 10);
    for (let i = 0; i < count; i++) q.push(m[1].charCodeAt(0) - 64);
    n += count;
    if (re.lastIndex === s.length) return n;
  }
  return re.lastIndex === s.length && n > 0 ? n : -1;
}

// An I record: the slots listed, then their runs, or the runs of all.
function loadslots(s) {
  const m = /^(\d*) (.*)$/.exec(s);
  if (m === null) return false;
  const list = [...m[1]].map(Number);
  const fields = m[2].split(' ');
  if (list.length === 0) {
    const all = new Queue();
    if (fields.length !== 1 || loadruns(fields[0], all) < 0) return false;
    for (const q of plyin) all.v.forEach((x) => q.push(x));
    return true;
  }
  if (list.some((s2, i) => s2 >= SLOTS || (i > 0 && s2 <= list[i - 1])) ||
      fields.length !== list.length) {
    return false;
  }
  let len0 = -1;
  for (let i = 0; i < list.length; i++) {
    const n = loadruns(fields[i], plyin[list[i]]);
    if (n < 0) return false;
    if (len0 < 0) len0 = n;
  }
  for (let s2 = 0; s2 < SLOTS; s2++) {
    if (!list.includes(s2)) for (let i = 0; i < len0; i++) plyin[s2].push(0);
  }
  return true;
}

// Reads the next record of the recording, false if there is no more.
function readrec() {
  while (!plyeof) {
    if (lineno >= lines.length) {
      plyeof = true;
      break;
    }
    const line = lines[lineno++].replace(/\r$/, '');
    // A row of a map being read: after a space, or none for all spaces
    if (levrows >= 0) {
      if (line !== '' && line[0] !== ' ') return bad(line);
      const row = line.slice(1);
      if (row.length > MWIDTH) return bad(line);
      levnew.push(...row.padEnd(MWIDTH));
      if (++levrows === MHEIGHT) {
        plymaps.push(levnew);
        plylev.push({ level: levnewno, map: levnew });
        levrows = -1;
      }
      return true;
    }
    if (line === '') continue;
    const arg = line.slice(1).trim();
    let m;
    switch (line[0]) {
      case 'I':
        if (!loadslots(line.slice(1))) return bad(line);
        return true;
      case 'R':
        if (!/^[0-9a-f]+$/i.test(arg)) return bad(line);
        plyrand.push(parseInt(arg, 16) | 0);
        return true;
      case 'C':
      case 'E':
        if (!/^[0-9a-f]+$/i.test(arg)) return bad(line);
        (line[0] === 'C' ? plyckpt : plyrend).push(parseInt(arg, 16) >>> 0);
        return true;
      case 'Q':
        if (!/^\d+$/.test(arg) || +arg >= SLOTS) return bad(line);
        plyquit = +arg;
        return true;
      case 'Z':
        m = /^(\d+) ([0-9a-f]+)$/i.exec(arg);
        if (m === null) return bad(line);
        plyendtick = +m[1];
        plyendhash = parseInt(m[2], 16) >>> 0;
        plyhasend = true;
        return true;
      case 'L':
        m = /^(\d+)(?: (\d+))?$/.exec(arg);
        if (m === null) return bad(line);
        if (m[2] === undefined) { // on the map that follows
          levnewno = +m[1];
          levnew = [];
          levrows = 0;
          return true;
        }
        if (+m[2] < 1 || +m[2] > plymaps.length) return bad(line);
        plylev.push({ level: +m[1], map: plymaps[+m[2] - 1] });
        return true;
    }
    return bad(line);
  }
  return false;
}

function bad(line) {
  fail(`bad record "${line}"`);
  plyeof = true;
  return false;
}

// Reads on until q has something, or there's no more.
function fill(q) {
  while (q.empty()) if (!readrec()) return false;
  return true;
}

function takein(slot) {
  return fill(plyin[slot]) ? plyin[slot].pop() : 0;
}

// Nothing left to play back: the recording ends here.
export function exhausted() {
  if (!dg.edrfplaying) return false;
  for (;;) {
    if (plyin.some((q) => !q.empty())) return false;
    if (!readrec()) return true;
  }
}

// Checks the state against the next recorded hash of a kind.
function verify(q, what, h) {
  if (!dg.edrfplaying || result.status === 'failed' || !fill(q)) return;
  const hash = q.pop();
  if (hash !== h) {
    fail(`the game goes otherwise than recorded before tick ${dg.ticks} ` +
      `(${what} state ${hex(h)}, recorded ${hex(hash)})`);
  }
}

// --- The game's side ---------------------------------------------------------

// The controls (CTRL_* bits) of slot read for a tick: as pressed, or as
// recorded when one is played back. A DRF played back has none.
export function input(slot, bits) {
  slotread[slot] = true;
  if (dg.edrfplaying) bits = takein(slot);
  else if (dg.playing) bits = 0;
  recin[slot].push(bits & 0x1f);
  return bits;
}

// A DRF played back: the controls of the tick are where its Digger goes, so
// that it is recorded as an eDRF too.
export function movement(slot, dir, fire) {
  if (!dg.playing || dg.edrfplaying || recin[slot].length === 0) return;
  let bits = 0;
  switch (dir) {
    case DIR_UP: bits = CTRL_UP; break;
    case DIR_DOWN: bits = CTRL_DOWN; break;
    case DIR_LEFT: bits = CTRL_LEFT; break;
    case DIR_RIGHT: bits = CTRL_RIGHT; break;
  }
  if (fire) bits |= CTRL_FIRE;
  recin[slot][recin[slot].length - 1] = bits;
}

// The game is to be quit, as the recording played back has run out.
export function quitting() {
  return exhausted();
}

// The game is being quit (Escape) by the player in slot.
export function quit(slot) {
  if (dg.edrfplaying && exhausted()) slot = plyquit; // as the recording was
  flushin();
  if (out.length !== 0 && slot >= 0) out.push(`Q ${slot}`);
}

// A level starting: played back on the recorded map, recorded with its map,
// or the number of the same map recorded before.
export function level(lev, plan) {
  flushin();
  if (dg.edrfplaying && fill(plylev)) {
    const { level: recorded, map } = plylev.pop();
    if (recorded !== lev) fail(`level ${lev} starts, recorded level ${recorded}`);
    const rows = [];
    for (let y = 0; y < MHEIGHT; y++) rows.push(map.slice(y * MWIDTH, (y + 1) * MWIDTH).join(''));
    leveldat[plan - 1] = rows;
  }
  if (out.length === 0) return;
  const map = [];
  for (let i = 0; i < MSIZE; i++) {
    const c = getlevch(i % MWIDTH, Math.floor(i / MWIDTH), plan);
    map.push(c > ' ' && c <= '~' ? c : ' ');
  }
  const key = map.join('');
  const n = recmaps.indexOf(key);
  if (n >= 0) {
    out.push(`L ${lev} ${n + 1}`);
    return;
  }
  recmaps.push(key);
  out.push(`L ${lev}`);
  for (let y = 0; y < MHEIGHT; y++) out.push(` ${key.slice(y * MWIDTH, (y + 1) * MWIDTH)}`);
}

export function putrand(r) {
  flushin();
  out.push(`R ${hex(r)}`);
}

export function getrand() {
  return fill(plyrand) ? plyrand.pop() : 0;
}

// A tick of the game is done.
export function tick() {
  // A slot not read on this tick has no controls on it
  for (let s = 0; s < SLOTS; s++) {
    if (!slotread[s]) {
      recin[s].push(UNREAD);
      if (dg.edrfplaying) takein(s);
    }
    slotread[s] = false;
  }
  if (dg.ticks % CHUNK === 0) flushin();
  if (dg.ticks % CKPT_EVERY === 0) {
    const h = gamestatehash();
    putstate('C', h);
    verify(plyckpt, 'tick', h);
  }
}

export function roundend() {
  const h = gamestatehashtick(dg.ticks);
  putstate('E', h);
  // Stopped before the end of the recording: nothing to check it against
  if (dg.escape && dg.edrfplaying && !exhausted()) return;
  verify(plyrend, 'end of round', h);
}

export function gameend() {
  const endhash = gamestatehash();
  flushin();
  out.push(`Z ${dg.ticks} ${hex(endhash)}`);
  if (!dg.edrfplaying || result.status === 'failed') return;
  if (!exhausted()) {
    result.status = 'stopped';
    result.message = `stopped on tick ${dg.ticks}, before the end of the recording`;
  } else if (!plyhasend) {
    result.status = 'truncated';
    result.message = `the recording ends on tick ${dg.ticks}, before its game does`;
  } else if (plyendtick !== dg.ticks || plyendhash !== endhash) {
    fail(`the game ends otherwise than recorded (${plyendtick}/${hex(plyendhash)}, ` +
      `got ${dg.ticks}/${hex(endhash)})`);
  } else {
    result.status = 'checked';
    result.message = 'the game went exactly as recorded';
  }
}
