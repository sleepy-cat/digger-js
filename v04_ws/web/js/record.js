// Recording and playback of games in the DRF format of the original
// (record.c): what was pressed on each frame, and the random seed of each
// round. A game played back from them goes exactly the same way.
//
// A DRF is text. A header of lines: "DRF", the version, the mode, the score
// for an extra life and the 8 levels. Then the rounds, line breaks not
// counting: the seed in hex, the directions as letters (s, r, u, l, d; in
// capitals with fire held) each followed by how many frames it lasts if more
// than one, and "EOL". "EOG" when it is left with Escape, "*ABC" for the
// initials of a high score.

import { dg, DIR_NONE, DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN, MWIDTH, MHEIGHT } from './state.js';
import * as edrf from './edrf.js';

// Its date (after the 7th character) tells the playback what to expect.
const VERSION = 'JS WEB 20261022';

// Recordings older than this have a bug of the time reproduced, see monster.js.
const KLUDGE_VERSION = 19981125;

// --- Recording ---------------------------------------------------------------

let recb = '';
let reccc = 0; // characters on the line
let recrl = 0; // length of the run of the same direction
let recd = '';

function mprintf(s) {
  recb += s;
}

// Starts the recordings, as DRF and eDRF, of a game about to be played.
export function recinit(levels, bonusscore) {
  let mode = '';
  if (dg.diggers > 1) {
    mode = `M${dg.diggers}`;
    if (dg.gauntlet) mode += `G${dg.gtime}`;
  } else if (dg.gauntlet) {
    mode = `G${dg.gtime}`;
  } else {
    mode = `${dg.nplayers}`;
  }
  if (dg.startlev > 1) mode += `I${dg.startlev}`;
  const header = [dg.kludge ? 'AJ DOS 19981125' : VERSION, mode, `${bonusscore}`];
  edrf.recinit(header);
  recb = '';
  mprintf(`DRF\n${header.join('\n')}\n`);
  for (const level of levels) {
    for (const row of level) mprintf(`${row}\n`);
  }
  reccc = recrl = 0;
}

// The recording so far.
export function recording() {
  return recb;
}

export function edrfrecording() {
  return edrf.recording();
}

export function recputrand(randv) {
  edrf.putrand(randv);
  mprintf(`${(randv >>> 0).toString(16).toUpperCase().padStart(8, '0')}\n`);
  reccc = recrl = 0;
}

function maked(dir, fire) {
  const d = dir === DIR_NONE ? 's' : 'ruld'[dir >> 1];
  return fire ? d.toUpperCase() : d;
}

function putrun() {
  const run = recrl > 1 ? `${recd}${recrl}` : recd;
  mprintf(run);
  reccc += run.length;
  if (reccc >= 60) {
    mprintf('\n');
    reccc = 0;
  }
}

export function recputdir(dir, fire) {
  const d = maked(dir, fire);
  if (recrl === 0) recd = d;
  if (recd !== d) {
    putrun();
    recd = d;
    recrl = 1;
  } else {
    if (recrl === 999) {
      putrun();
      recrl = 0;
    }
    recrl++;
  }
}

export function recputeol() {
  edrf.roundend();
  if (recrl > 0) putrun();
  if (reccc > 0) mprintf('\n');
  mprintf('EOL\n');
}

// The game is left with Escape, by the player in slot (-1 for none: the
// other player of a network game went).
export function recputeog(slot = 0) {
  edrf.quit(slot);
  mprintf('EOG\n');
}

export function recputinit(name) {
  mprintf(`*${name}\n`);
}

// --- Playback ----------------------------------------------------------------

let plb = ''; // the rounds, without the line breaks
let plp = 0;
let rld = '';
let rlleft = 0;

// Reads a DRF: the kind of game it is, its levels, and the rounds to play.
export function parse(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const ext = lines[0] === edrf.MAGIC;
  if (!(ext && lines.length >= 4) && !(lines[0].startsWith('DRF') && lines.length >= 4 + 8 * MHEIGHT)) {
    throw new Error('not a DRF or eDRF recording');
  }
  const drf = {
    edrf: ext,
    kludge: parseInt(lines[1].slice(7), 10) <= KLUDGE_VERSION,
    nplayers: 1,
    diggers: 1,
    gauntlet: false,
    gtime: 120,
    startlev: 1,
    bonusscore: parseInt(lines[3], 10) || 0,
    levels: [],
    rounds: '',
    body: [], // of an eDRF
  };
  const mode = lines[2];
  let x = 0;
  if (mode[0] === '1' || mode[0] === '2') {
    drf.nplayers = +mode[0];
    x = 1;
  } else {
    if (mode[0] === 'M') {
      drf.diggers = +mode[1];
      x = 2;
    }
    if (mode[x] === 'G') {
      drf.gauntlet = true;
      const m = /^\d*/.exec(mode.slice(x + 1))[0];
      drf.gtime = parseInt(m, 10) || 0;
      x += 1 + m.length;
    }
  }
  if (mode[x] === 'U') x++; // unlimited lives are ignored on playback
  if (mode[x] === 'I') drf.startlev = parseInt(mode.slice(x + 1), 10) || 1;
  // An eDRF has the maps as it goes
  if (ext) {
    drf.body = lines.slice(4);
    return drf;
  }
  for (let l = 0; l < 8; l++) {
    const rows = lines.slice(4 + l * MHEIGHT, 4 + (l + 1) * MHEIGHT);
    drf.levels.push(rows.map((r) => r.slice(0, MWIDTH).padEnd(MWIDTH)));
  }
  // The line breaks here are only so that the file can be emailed.
  drf.rounds = lines.slice(4 + 8 * MHEIGHT).join('').replace(/[\x00-\x1f]/g, '');
  return drf;
}

export function openplay(drf) {
  if (drf.edrf) edrf.playopen(drf.body);
  plb = drf.rounds;
  plp = 0;
  rld = '';
  rlleft = 0;
}

const dirs = { s: DIR_NONE, r: DIR_RIGHT, u: DIR_UP, l: DIR_LEFT, d: DIR_DOWN };

// The direction of a letter, undefined for none (one out of place in a
// broken recording, which leaves the direction as it is).
function makedir(d) {
  const fire = d >= 'A' && d <= 'Z';
  return { dir: dirs[d.toLowerCase()], fire };
}

// The direction and fire of the next frame, or null at the end of the
// recording (when it is over, Escape is pressed).
export function playgetdir() {
  if (rlleft > 0) {
    rlleft--;
    return makedir(rld);
  }
  if (plp >= plb.length || plb[plp] === 'E' || plb[plp] === 'e') {
    dg.escape = true;
    return null;
  }
  rld = plb[plp++];
  while (plb[plp] >= '0' && plb[plp] <= '9') rlleft = rlleft * 10 + (plb.charCodeAt(plp++) - 48);
  if (rlleft > 0) rlleft--;
  return makedir(rld);
}

// The random seed of the next round. At the end of the recording, where a
// game left during a death ends (the original goes on reading what is past
// it), Escape is pressed.
export function playgetrand() {
  if (dg.edrfplaying) return edrf.getrand();
  if (plb[plp] === '*') plp += 4; // the initials of a high score
  if (plp >= plb.length || /^eo/i.test(plb.slice(plp, plp + 2))) { // EOG, not a hex E
    dg.escape = true;
    return 0;
  }
  let r = 0;
  for (let i = 0; i < 8; i++) {
    const v = parseInt(plb[plp++], 16);
    if (!Number.isNaN(v)) r |= v << ((7 - i) * 4);
  }
  return r;
}

export function playskipeol() {
  if (dg.edrfplaying) return;
  plp += 3;
}
