// Sprites drawn over the background with what was under them saved, and
// the collisions between them (sprite.c).

import * as scr from './screen.js';
import {
  SPRITES, TYPES, FIRSTBONUS, LASTBONUS, FIRSTBAG, LASTBAG, FIRSTMONSTER,
  LASTMONSTER, FIRSTFIREBALL, LASTFIREBALL, FIRSTDIGGER, LASTDIGGER,
} from './state.js';

const sprrdrwf = new Array(SPRITES + 1).fill(false);
const sprrecf = new Array(SPRITES + 1).fill(false);
const sprenf = new Array(SPRITES).fill(false);
const sprch = new Array(SPRITES + 1).fill(0);
const sprmov = new Array(SPRITES).fill(null);
const sprx = new Array(SPRITES + 1).fill(0);
const spry = new Array(SPRITES + 1).fill(0);
const sprwid = new Array(SPRITES + 1).fill(0);
const sprhei = new Array(SPRITES + 1).fill(0);
const sprbwid = new Array(SPRITES).fill(0);
const sprbhei = new Array(SPRITES).fill(0);
const sprnch = new Array(SPRITES).fill(0);
const sprnwid = new Array(SPRITES).fill(0);
const sprnhei = new Array(SPRITES).fill(0);
const sprnbwid = new Array(SPRITES).fill(0);
const sprnbhei = new Array(SPRITES).fill(0);

// What the sprite drawn last collides with: first[type] is the first sprite
// of each type, coll[sprite] the next one of the same type, -1 ends a list.
export const first = new Array(TYPES).fill(-1);
export const coll = new Array(SPRITES).fill(-1);

const firstt = [FIRSTBONUS, FIRSTBAG, FIRSTMONSTER, FIRSTFIREBALL, FIRSTDIGGER];
const lastt = [LASTBONUS, LASTBAG, LASTMONSTER, LASTFIREBALL, LASTDIGGER];

export function createspr(n, ch, wid, hei, bwid, bhei) {
  sprnch[n] = sprch[n] = ch;
  sprmov[n] = null;
  sprnwid[n] = sprwid[n] = wid;
  sprnhei[n] = sprhei[n] = hei;
  sprnbwid[n] = sprbwid[n] = bwid;
  sprnbhei[n] = sprbhei[n] = bhei;
  sprenf[n] = false;
}

export function movedrawspr(n, x, y) {
  sprx[n] = x & -4;
  spry[n] = y;
  sprch[n] = sprnch[n];
  sprwid[n] = sprnwid[n];
  sprhei[n] = sprnhei[n];
  sprbwid[n] = sprnbwid[n];
  sprbhei[n] = sprnbhei[n];
  clearrdrwf();
  setrdrwflgs(n);
  putis();
  sprmov[n] = scr.geti(sprx[n], spry[n], sprwid[n], sprhei[n]);
  sprenf[n] = true;
  sprrdrwf[n] = true;
  putims();
}

export function erasespr(n) {
  if (!sprenf[n]) return;
  scr.puti(sprx[n], spry[n], sprmov[n], sprwid[n], sprhei[n]);
  sprenf[n] = false;
  clearrdrwf();
  setrdrwflgs(n);
  putims();
}

export function drawspr(n, x, y) {
  x &= -4;
  clearrdrwf();
  setrdrwflgs(n);
  const t1 = sprx[n], t2 = spry[n], t3 = sprwid[n], t4 = sprhei[n];
  sprx[n] = x;
  spry[n] = y;
  sprwid[n] = sprnwid[n];
  sprhei[n] = sprnhei[n];
  clearrecf();
  setrdrwflgs(n);
  sprhei[n] = t4;
  sprwid[n] = t3;
  spry[n] = t2;
  sprx[n] = t1;
  sprrdrwf[n] = true;
  putis();
  sprenf[n] = true;
  sprx[n] = x;
  spry[n] = y;
  sprch[n] = sprnch[n];
  sprwid[n] = sprnwid[n];
  sprhei[n] = sprnhei[n];
  sprbwid[n] = sprnbwid[n];
  sprbhei[n] = sprnbhei[n];
  sprmov[n] = scr.geti(sprx[n], spry[n], sprwid[n], sprhei[n]);
  putims();
  bcollides(n);
}

export function initspr(n, ch, wid, hei, bwid, bhei) {
  sprnch[n] = ch;
  sprnwid[n] = wid;
  sprnhei[n] = hei;
  sprnbwid[n] = bwid;
  sprnbhei[n] = bhei;
}

// Takes the sprites over the area of a background change off the screen,
// getis() puts them back.
export function initmiscspr(x, y, wid, hei) {
  sprx[SPRITES] = x;
  spry[SPRITES] = y;
  sprwid[SPRITES] = wid;
  sprhei[SPRITES] = hei;
  clearrdrwf();
  setrdrwflgs(SPRITES);
  putis();
}

export function getis() {
  for (let i = 0; i < SPRITES; i++) {
    if (sprrdrwf[i]) sprmov[i] = scr.geti(sprx[i], spry[i], sprwid[i], sprhei[i]);
  }
  putims();
}

export function drawmiscspr(x, y, ch, wid, hei) {
  sprx[SPRITES] = x & -4;
  spry[SPRITES] = y;
  sprch[SPRITES] = ch;
  sprwid[SPRITES] = wid;
  sprhei[SPRITES] = hei;
  scr.putim(sprx[SPRITES], spry[SPRITES], sprch[SPRITES], sprwid[SPRITES], sprhei[SPRITES]);
}

function clearrdrwf() {
  clearrecf();
  sprrdrwf.fill(false);
}

function clearrecf() {
  sprrecf.fill(false);
}

function setrdrwflgs(n) {
  if (sprrecf[n]) return;
  sprrecf[n] = true;
  for (let i = 0; i < SPRITES; i++) {
    if (sprenf[i] && i !== n && collide(i, n)) {
      sprrdrwf[i] = true;
      setrdrwflgs(i);
    }
  }
}

function collide(bx, si) {
  if (sprx[bx] >= sprx[si]) {
    if (sprx[bx] > (sprwid[si] << 2) + sprx[si] - 1) return false;
  } else if (sprx[si] > (sprwid[bx] << 2) + sprx[bx] - 1) {
    return false;
  }
  if (spry[bx] >= spry[si]) return spry[bx] <= sprhei[si] + spry[si] - 1;
  return spry[si] <= sprhei[bx] + spry[bx] - 1;
}

function bcollide(bx, si) {
  if (sprx[bx] >= sprx[si]) {
    if (sprx[bx] + sprbwid[bx] > (sprwid[si] << 2) + sprx[si] - sprbwid[si] - 1) return false;
  } else if (sprx[si] + sprbwid[si] > (sprwid[bx] << 2) + sprx[bx] - sprbwid[bx] - 1) {
    return false;
  }
  if (spry[bx] >= spry[si]) {
    return spry[bx] + sprbhei[bx] <= sprhei[si] + spry[si] - sprbhei[si] - 1;
  }
  return spry[si] + sprbhei[si] <= sprhei[bx] + spry[bx] - sprbhei[bx] - 1;
}

function putims() {
  for (let i = 0; i < SPRITES; i++) {
    if (sprrdrwf[i]) scr.putim(sprx[i], spry[i], sprch[i], sprwid[i], sprhei[i]);
  }
}

function putis() {
  for (let i = 0; i < SPRITES; i++) {
    if (sprrdrwf[i]) scr.puti(sprx[i], spry[i], sprmov[i], sprwid[i], sprhei[i]);
  }
}

function bcollides(spr) {
  first.fill(-1);
  coll.fill(-1);
  for (let i = 0; i < TYPES; i++) {
    let next = -1;
    for (let spc = firstt[i]; spc < lastt[i]; spc++) {
      if (sprenf[spc] && spc !== spr && bcollide(spr, spc)) {
        if (next === -1) {
          first[i] = next = spc;
        } else {
          coll[next] = spc;
          next = spc;
          coll[next] = -1;
        }
      }
    }
  }
}

// Snapshot of the collisions, as the callers keep them while drawing more.
export function collisions() {
  return { clfirst: first.slice(), clcoll: coll.slice() };
}
