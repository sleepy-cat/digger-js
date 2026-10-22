// Gold bags (bags.c).

import * as spr from './sprite.js';
import * as snd from './sound.js';
import {
  dg, DIR_NONE, DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN, BAGS, MWIDTH, MHEIGHT,
  FIRSTBAG, FIRSTDIGGER, reversedir, div,
} from './state.js';
import {
  drawgold, getfield, eatfield, drawsquareblob, drawtopblob, drawfurryblob,
} from './drawing.js';
import { getlevch, levplan, levof10, incpenalty, redrawdelay } from './main.js';
import {
  checkdiggerunderbag, killdigger, diggery, digalive, digresettime, killemerald,
} from './digger.js';
import { squashmonsters, checkmonscared, mongold } from './monster.js';
import { scoregold } from './scores.js';

function newbag() {
  return {
    x: 0, y: 0, h: 0, v: 0, xr: 0, yr: 0, dir: 0, wt: 0, gt: 0, fallh: 0,
    wobbling: false, unfallen: false, exist: false,
  };
}

let bagdat = Array.from({ length: BAGS }, newbag);
// The bags of each player's level, kept between turns.
const saved = [bagdat, bagdat];

let pushcount = 0;
let goldtime = 0;

const wblanim = [2, 0, 1, 0];

export function initbags() {
  pushcount = 0;
  goldtime = 150 - levof10() * 10;
  bagdat = Array.from({ length: BAGS }, newbag);
  let bag = 0;
  for (let x = 0; x < MWIDTH; x++) {
    for (let y = 0; y < MHEIGHT; y++) {
      if (getlevch(x, y, levplan()) !== 'B' || bag >= BAGS) continue;
      Object.assign(bagdat[bag++], {
        exist: true, gt: 0, fallh: 0, dir: DIR_NONE, wobbling: false, wt: 15,
        unfallen: true, x: x * 20 + 12, y: y * 18 + 18, h: x, v: y, xr: 0, yr: 0,
      });
    }
  }
  savebags();
}

function savebags() {
  saved[dg.curplayer] = bagdat.map((b) => ({ ...b }));
}

export async function drawbags() {
  bagdat = saved[dg.curplayer].map((b) => ({ ...b }));
  for (let bag = 0; bag < BAGS; bag++) {
    if (bagdat[bag].exist) {
      spr.movedrawspr(bag + FIRSTBAG, bagdat[bag].x, bagdat[bag].y);
      await redrawdelay();
    }
  }
}

// Bags that were on the move when the round ended are gone.
export function cleanupbags() {
  snd.soundfalloff();
  for (let bag = 0; bag < BAGS; bag++) {
    const b = bagdat[bag];
    if (b.exist && ((b.h === 7 && b.v === 9) || b.xr !== 0 || b.yr !== 0 || b.gt !== 0 ||
        b.fallh !== 0 || b.wobbling)) {
      b.exist = false;
      spr.erasespr(bag + FIRSTBAG);
    }
  }
  savebags();
}

export function dobags() {
  let falloff = true, wobbleoff = true;
  for (let bag = 0; bag < BAGS; bag++) {
    const b = bagdat[bag];
    if (!b.exist) continue;
    if (b.gt === 0) {
      updatebag(bag);
      continue;
    }
    // Broken into gold, which disappears after a while
    if (b.gt === 1) {
      snd.soundbreak();
      drawgold(bag, 4, b.x, b.y);
      incpenalty();
    }
    if (b.gt === 3) {
      drawgold(bag, 5, b.x, b.y);
      incpenalty();
    }
    if (b.gt === 5) {
      drawgold(bag, 6, b.x, b.y);
      incpenalty();
    }
    b.gt++;
    if (b.gt === goldtime) {
      removebag(bag);
    } else if (b.v < MHEIGHT - 1 && b.gt < goldtime - 10 &&
        (getfield(b.h, b.v + 1) & 0x2000) === 0) {
      b.gt = goldtime - 10;
    }
  }
  for (const b of bagdat) {
    if (b.dir === DIR_DOWN && b.exist) falloff = false;
    if (b.dir !== DIR_DOWN && b.wobbling && b.exist) wobbleoff = false;
  }
  if (falloff) snd.soundfalloff();
  if (wobbleoff) snd.soundwobbleoff();
}

function updatebag(bag) {
  const b = bagdat[bag];
  const { h, v, xr, y, yr } = b;
  switch (b.dir) {
    case DIR_NONE:
      if (y < 180 && xr === 0) {
        if (b.wobbling) {
          if (b.wt === 0) {
            b.dir = DIR_DOWN;
            snd.soundfall();
            break;
          }
          b.wt--;
          const wbl = b.wt % 8;
          if (!(wbl & 1)) {
            drawgold(bag, wblanim[wbl >> 1], b.x, y);
            incpenalty();
            snd.soundwobble();
          }
        } else if ((getfield(h, v + 1) & 0xfdf) !== 0xfdf && !checkdiggerunderbag(h, v + 1)) {
          b.wobbling = true;
        }
      } else {
        b.wt = 15;
        b.wobbling = false;
      }
      break;
    case DIR_RIGHT:
    case DIR_LEFT:
      if (xr === 0) {
        if (y < 180 && (getfield(h, v + 1) & 0xfdf) !== 0xfdf) {
          b.dir = DIR_DOWN;
          b.wt = 0;
          snd.soundfall();
        } else {
          baghitground(bag);
        }
      }
      break;
    case DIR_DOWN:
      if (yr === 0) b.fallh++;
      if (y >= 180) baghitground(bag);
      else if ((getfield(h, v + 1) & 0xfdf) === 0xfdf && yr === 0) baghitground(bag);
      checkmonscared(b.h);
      break;
  }
  if (b.dir !== DIR_NONE) {
    if (b.dir !== DIR_DOWN && pushcount !== 0) pushcount--;
    else pushbag(bag, b.dir);
  }
}

function baghitground(bag) {
  const b = bagdat[bag];
  if (b.dir === DIR_DOWN && b.fallh > 1) b.gt = 1;
  else b.fallh = 0;
  b.dir = DIR_NONE;
  b.wt = 15;
  b.wobbling = false;
  drawgold(bag, 0, b.x, b.y);
  const { clfirst, clcoll } = spr.collisions();
  incpenalty();
  for (let i = clfirst[1]; i !== -1; i = clcoll[i]) removebag(i - FIRSTBAG);
}

// Kills the Diggers under bag at y, and squashes the monsters.
function crush(bag, y) {
  const { clfirst, clcoll } = spr.collisions();
  incpenalty();
  for (let i = clfirst[4]; i !== -1; i = clcoll[i]) {
    const d = i - FIRSTDIGGER + dg.curplayer;
    if (diggery(d) >= y) killdigger(d, 1, bag);
  }
  if (clfirst[2] !== -1) squashmonsters(bag, clfirst, clcoll);
}

function pushbag(bag, dir) {
  const b = bagdat[bag];
  const ox = b.x, oy = b.y;
  let x = b.x, y = b.y;
  let push = true;
  if (b.gt !== 0) {
    getgold(bag);
    return true;
  }
  if (b.dir === DIR_DOWN && (dir === DIR_RIGHT || dir === DIR_LEFT)) {
    drawgold(bag, 3, x, y);
    crush(bag, y);
    return true;
  }
  if ((x === 292 && dir === DIR_RIGHT) || (x === 12 && dir === DIR_LEFT) ||
      (y === 180 && dir === DIR_DOWN) || (y === 18 && dir === DIR_UP)) {
    push = false;
  }
  if (!push) return false;
  switch (dir) {
    case DIR_RIGHT:
      x += 4;
      break;
    case DIR_LEFT:
      x -= 4;
      break;
    case DIR_DOWN:
      if (b.unfallen) {
        b.unfallen = false;
        drawsquareblob(x, y);
        drawtopblob(x, y + 21);
      } else {
        drawfurryblob(x, y);
      }
      eatfield(x, y, dir);
      killemerald(b.h, b.v);
      y += 6;
      break;
  }
  switch (dir) {
    case DIR_DOWN:
      drawgold(bag, 3, x, y);
      crush(bag, y);
      break;
    case DIR_RIGHT:
    case DIR_LEFT: {
      b.wt = 15;
      b.wobbling = false;
      drawgold(bag, 0, x, y);
      const { clfirst, clcoll } = spr.collisions();
      incpenalty();
      pushcount = 1;
      if (clfirst[1] !== -1 && !pushbags(dir, clfirst, clcoll)) {
        x = ox;
        y = oy;
        drawgold(bag, 0, ox, oy);
        incpenalty();
        push = false;
      }
      let digf = false;
      for (let i = clfirst[4]; i !== -1; i = clcoll[i]) {
        if (digalive(i - FIRSTDIGGER + dg.curplayer)) digf = true;
      }
      if (digf || clfirst[2] !== -1) {
        x = ox;
        y = oy;
        drawgold(bag, 0, ox, oy);
        incpenalty();
        push = false;
      }
      break;
    }
  }
  b.dir = push ? dir : reversedir(dir);
  b.x = x;
  b.y = y;
  b.h = div(x - 12, 20);
  b.v = div(y - 18, 18);
  b.xr = (x - 12) % 20;
  b.yr = (y - 18) % 18;
  return push;
}

export function pushbags(dir, clfirst, clcoll) {
  let push = true;
  for (let i = clfirst[1]; i !== -1; i = clcoll[i]) {
    if (!pushbag(i - FIRSTBAG, dir)) push = false;
  }
  return push;
}

export function pushudbags(clfirst, clcoll) {
  let push = true;
  for (let i = clfirst[1]; i !== -1; i = clcoll[i]) {
    if (bagdat[i - FIRSTBAG].gt !== 0) getgold(i - FIRSTBAG);
    else push = false;
  }
  return push;
}

function removebag(bag) {
  if (bagdat[bag].exist) {
    bagdat[bag].exist = false;
    spr.erasespr(bag + FIRSTBAG);
  }
}

export function bagexist(bag) {
  return bagdat[bag].exist;
}

export function bagy(bag) {
  return bagdat[bag].y;
}

export function getbagdir(bag) {
  return bagdat[bag].exist ? bagdat[bag].dir : -1;
}

export function removebags(clfirst, clcoll) {
  for (let i = clfirst[1]; i !== -1; i = clcoll[i]) removebag(i - FIRSTBAG);
}

export function getnmovingbags() {
  return bagdat.filter((b) => b.exist && b.gt < 10 && (b.gt !== 0 || b.wobbling)).length;
}

function getgold(bag) {
  let f = true;
  drawgold(bag, 6, bagdat[bag].x, bagdat[bag].y);
  incpenalty();
  for (let i = spr.first[4]; i !== -1; i = spr.coll[i]) {
    const d = i - FIRSTDIGGER + dg.curplayer;
    if (digalive(d)) {
      scoregold(d);
      snd.soundgold();
      digresettime(d);
      f = false;
    }
  }
  if (f) mongold();
  removebag(bag);
}

// Its part of the state hash, see statehash.js (bags_debug_hash_append()).
export function bagshash(h) {
  h.int16(pushcount);
  h.int16(goldtime);
  for (const b of bagdat) {
    for (const v of [b.x, b.y, b.h, b.v, b.xr, b.yr, b.dir, b.wt, b.gt, b.fallh]) h.int16(v);
    h.bool(b.wobbling);
    h.bool(b.unfallen);
    h.bool(b.exist);
  }
}
