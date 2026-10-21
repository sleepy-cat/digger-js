// The Diggers, their fireballs, emeralds and the bonus (digger.c).

import * as scr from './screen.js';
import * as spr from './sprite.js';
import * as snd from './sound.js';
import {
  dg, DIR_NONE, DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN, DIGGERS, MWIDTH,
  MHEIGHT, MSIZE, FIRSTBONUS, FIRSTBAG, FIRSTDIGGER, FIRSTFIREBALL, FIRSTMONSTER,
  DEFAULT_FTIME, reversedir, div,
} from './state.js';
import {
  drawdigger, drawfire, drawbonus, drawemerald, eraseemerald, eatfield,
  drawrightblob, drawleftblob, drawtopblob, drawbottomblob, drawlives,
} from './drawing.js';
import { getlevch, levplan, levof10, incpenalty, setdead, redrawdelay } from './main.js';
import { killmon, killmonsters } from './monster.js';
import { bagexist, getbagdir, bagy, pushbags, pushudbags } from './bags.js';
import {
  scoreemerald, scoreoctave, scorekill, scorebonus, scoreeatm,
} from './scores.js';
import { readdirect, getdirect, getfire, clearfire } from './input.js';

const DEATH_BAG = 1;
const DEATH_ANIM = 2;
const DEATH_MONSTER = 3;
const DEATH_TOMBSTONE = 4;
const DEATH_ARC = 5;
const DEATH_DONE = 6;

// Game ticks the dirge plays for, until its final rest.
const DIRGE_TICKS = 89;

const deatharc = [3, 5, 6, 6, 5, 3, 0];
const embox = [8, 12, 12, 9, 16, 12, 6, 9];

function newdigger() {
  return {
    h: 0, v: 0, rx: 0, ry: 0, mdir: 0, bagtime: 0, rechargetime: 0,
    deathstage: 0, deathbag: 0, deathani: 0, deathtime: 0, emocttime: 0,
    emn: 0, msc: 0, lives: 0, ivt: 0, dirgetime: 0,
    notfiring: true, dead: false, invin: false,
    // What it looks like, see digger_obj.c
    alive: false, canfire: true, dir: DIR_RIGHT, x: 0, y: 0,
    // Its fireball, see bullet_obj.c
    bob: { expsn: 0, dir: DIR_RIGHT, x: 0, y: 0 },
  };
}

const digdat = [newdigger(), newdigger()];

let startbonustimeleft = 0;
let bonustimeleft = 0;
let emmask = 0;
const emfield = new Array(MSIZE).fill(0);
let digvisible = false;

// Running through the rest of a death that can't be seen nor heard.
export let deathffwd = false;

function sprnum(n) {
  return n - dg.curplayer;
}

function putdigger(n) {
  const d = digdat[n];
  spr.movedrawspr(FIRSTDIGGER + sprnum(n), d.x, d.y);
}

function placedigger(n) {
  const d = digdat[n];
  d.v = 9;
  d.mdir = 4;
  d.h = dg.diggers === 1 ? 7 : 8 - n * 2;
  d.x = d.h * 20 + 12;
  d.y = d.v * 18 + 18;
  d.dir = n === 0 ? DIR_RIGHT : DIR_LEFT;
  d.rx = 0;
  d.ry = 0;
  d.bagtime = 0;
  d.alive = true;
  d.dead = false;
  d.canfire = true;
  d.deathstage = DEATH_BAG;
  d.dirgetime = 0;
  d.notfiring = true;
  d.emocttime = 0;
  d.bob.expsn = 0;
  d.rechargetime = 0;
  d.emn = 0;
  d.msc = 1;
}

export function initdigger() {
  startbonustimeleft = 0;
  bonustimeleft = 0;
  for (let n = dg.curplayer; n < dg.diggers + dg.curplayer; n++) {
    const d = digdat[n];
    if (d.lives === 0) {
      d.dead = true;
      d.invin = false;
      d.ivt = 0;
      d.deathstage = DEATH_DONE;
      d.dirgetime = 0;
      d.alive = false;
      d.bagtime = 0;
      d.notfiring = true;
      d.rechargetime = 0;
      d.emocttime = 0;
      d.bob.expsn = 0;
      spr.erasespr(FIRSTDIGGER + sprnum(n));
      spr.erasespr(FIRSTFIREBALL + sprnum(n));
      continue;
    }
    placedigger(n);
    d.invin = false;
    d.ivt = 0;
    deathffwd = false;
    putdigger(n);
  }
  digvisible = true;
  dg.bonusvisible = dg.bonusmode = false;
}

function drawdig(n) {
  const d = digdat[n];
  drawdigger(sprnum(n), d.dir, d.x, d.y, d.canfire);
  if (d.invin) {
    d.ivt--;
    if (d.ivt === 0) d.invin = false;
    else if (d.ivt % 10 < 5) spr.erasespr(FIRSTDIGGER + sprnum(n));
  }
}

export function dodigger() {
  if (dg.escape || dg.timeout) return;
  if (dg.gauntlet) {
    drawlives();
    // The clock counts ticks of the default speed, however fast the game runs
    if (dg.cgtime < DEFAULT_FTIME) dg.timeout = true;
    dg.cgtime -= DEFAULT_FTIME;
  }
  for (let n = dg.curplayer; n < dg.diggers + dg.curplayer; n++) {
    const d = digdat[n];
    readdirect(sprnum(n));
    if (d.bob.expsn !== 0) drawexplosion(n);
    else updatefire(n);
    if (digvisible) {
      if (d.alive) {
        if (d.bagtime !== 0) {
          const tdir = d.dir;
          d.dir = d.mdir;
          drawdig(n);
          d.dir = tdir;
          incpenalty();
          d.bagtime--;
        } else {
          updatedigger(n);
        }
      } else {
        diggerdie(n);
      }
    }
    if (d.emocttime > 0) d.emocttime--;
  }
  if (dg.bonusmode && isalive()) {
    if (bonustimeleft !== 0) {
      bonustimeleft--;
      if (startbonustimeleft !== 0 || bonustimeleft < 20) {
        startbonustimeleft--;
        scr.inten(bonustimeleft & 1 ? 0 : 1);
        snd.soundbonus();
        if (startbonustimeleft === 0) {
          snd.music(snd.MUSIC_BONUS);
          snd.soundbonusoff();
          scr.inten(1);
        }
      }
    } else {
      endbonusmode();
      snd.soundbonusoff();
      snd.music(snd.MUSIC_MAIN);
    }
  }
  if (dg.bonusmode && !isalive()) {
    endbonusmode();
    snd.soundbonusoff();
    snd.music(snd.MUSIC_MAIN);
  }
}

function firebullet(n) {
  const d = digdat[n];
  d.canfire = false;
  d.rechargetime = levof10() * 3 + 60;
  d.notfiring = false;
  let fx, fy;
  switch (d.dir) {
    case DIR_RIGHT: fx = d.x + 8; fy = d.y + 4; break;
    case DIR_UP: fx = d.x + 4; fy = d.y; break;
    case DIR_LEFT: fx = d.x; fy = d.y + 4; break;
    default: fx = d.x + 4; fy = d.y + 8; break;
  }
  d.bob = { expsn: 0, dir: d.dir, x: fx, y: fy };
  spr.movedrawspr(FIRSTFIREBALL + sprnum(n), fx, fy);
  snd.soundfire(sprnum(n));
}

function animatebullet(n) {
  const b = digdat[n].bob;
  drawfire(sprnum(n), b.x, b.y, b.expsn);
  if (b.expsn > 0) {
    if (b.expsn === 1) snd.soundexplode(sprnum(n));
    b.expsn++;
  }
}

function explode(n) {
  digdat[n].bob.expsn = 1;
}

function updatefire(n) {
  const d = digdat[n];
  const b = d.bob;
  if (d.notfiring) {
    if (d.rechargetime !== 0) {
      d.rechargetime--;
      if (d.rechargetime === 0) d.canfire = true;
    } else if (getfire(sprnum(n)) && d.alive) {
      firebullet(n);
    }
    return;
  }
  let pix = 0;
  switch (b.dir) {
    case DIR_RIGHT:
      b.x += 8;
      pix = scr.getpix(b.x, b.y + 4) | scr.getpix(b.x + 4, b.y + 4);
      break;
    case DIR_UP:
      b.y -= 7;
      for (let i = 0; i < 7; i++) pix |= scr.getpix(b.x + 4, b.y + i);
      pix &= 0xc0;
      break;
    case DIR_LEFT:
      b.x -= 8;
      pix = scr.getpix(b.x, b.y + 4) | scr.getpix(b.x + 4, b.y + 4);
      break;
    case DIR_DOWN:
      b.y += 7;
      for (let i = 0; i < 7; i++) pix |= scr.getpix(b.x, b.y + i);
      pix &= 0x3;
      break;
  }
  animatebullet(n);
  const { clfirst, clcoll } = spr.collisions();
  incpenalty();
  for (let i = clfirst[2]; i !== -1; i = clcoll[i]) {
    killmon(i - FIRSTMONSTER);
    scorekill(n);
    explode(n);
  }
  for (let i = clfirst[4]; i !== -1; i = clcoll[i]) {
    const m = i - FIRSTDIGGER + dg.curplayer;
    if (m !== n && !digdat[m].invin && digdat[m].alive) {
      killdigger(m, DEATH_MONSTER, 0);
      explode(n);
    }
  }
  const clflag = clfirst.some((c) => c !== -1);
  if (clfirst[0] !== -1 || clfirst[1] !== -1 || clfirst[3] !== -1) {
    explode(n);
    for (let i = clfirst[3]; i !== -1; i = clcoll[i]) {
      const m = i - FIRSTFIREBALL + dg.curplayer;
      if (digdat[m].bob.expsn === 0) explode(m);
    }
  }
  // Off the field it explodes, into a wall it does just before it.
  const back = (dx, dy) => {
    if (pix !== 0 && !clflag) {
      b.x += dx;
      b.y += dy;
      animatebullet(n);
      explode(n);
    }
  };
  switch (b.dir) {
    case DIR_RIGHT:
      if (b.x > 296) explode(n);
      else back(-8, 0);
      break;
    case DIR_UP:
      if (b.y < 15) explode(n);
      else back(0, 7);
      break;
    case DIR_LEFT:
      if (b.x < 16) explode(n);
      else back(8, 0);
      break;
    case DIR_DOWN:
      if (b.y > 183) explode(n);
      else back(0, -7);
      break;
  }
}

export function erasediggers() {
  for (let i = 0; i < dg.diggers; i++) spr.erasespr(FIRSTDIGGER + i);
  digvisible = false;
}

function drawexplosion(n) {
  if (digdat[n].bob.expsn < 4) {
    animatebullet(n);
    incpenalty();
  } else {
    killfire(n);
  }
}

export function killfire(n) {
  const d = digdat[n];
  if (d.notfiring) return;
  d.notfiring = true;
  spr.erasespr(FIRSTFIREBALL + sprnum(n));
  if (d.bob.expsn > 1) snd.soundfireoff(sprnum(n));
  d.bob.expsn = 0;
}

function updatedigger(n) {
  const d = digdat[n];
  let push = true;
  const dir = getdirect(sprnum(n));
  const ddir = dir === DIR_RIGHT || dir === DIR_UP || dir === DIR_LEFT || dir === DIR_DOWN ? dir : DIR_NONE;
  if (d.rx === 0 && (ddir === DIR_UP || ddir === DIR_DOWN)) d.dir = d.mdir = ddir;
  if (d.ry === 0 && (ddir === DIR_RIGHT || ddir === DIR_LEFT)) d.dir = d.mdir = ddir;
  d.mdir = dir === DIR_NONE ? DIR_NONE : d.dir;
  if ((d.x === 292 && d.mdir === DIR_RIGHT) || (d.x === 12 && d.mdir === DIR_LEFT) ||
      (d.y === 180 && d.mdir === DIR_DOWN) || (d.y === 18 && d.mdir === DIR_UP)) {
    d.mdir = DIR_NONE;
  }
  const ox = d.x, oy = d.y;
  if (d.mdir !== DIR_NONE) eatfield(ox, oy, d.mdir);
  switch (d.mdir) {
    case DIR_RIGHT:
      drawrightblob(d.x, d.y);
      d.x += 4;
      break;
    case DIR_UP:
      drawtopblob(d.x, d.y);
      d.y -= 3;
      break;
    case DIR_LEFT:
      drawleftblob(d.x, d.y);
      d.x -= 4;
      break;
    case DIR_DOWN:
      drawbottomblob(d.x, d.y);
      d.y += 3;
      break;
  }
  if (hitemerald(div(d.x - 12, 20), div(d.y - 18, 18), (d.x - 12) % 20, (d.y - 18) % 18, d.mdir)) {
    if (d.emocttime === 0) d.emn = 0;
    scoreemerald(n);
    snd.soundem();
    snd.soundemerald(d.emn);
    d.emn++;
    if (d.emn === 8) {
      d.emn = 0;
      scoreoctave(n);
    }
    d.emocttime = 9;
  }
  drawdig(n);
  const { clfirst, clcoll } = spr.collisions();
  incpenalty();

  let bagf = false;
  for (let i = clfirst[1]; i !== -1; i = clcoll[i]) {
    const bag = i - FIRSTBAG;
    // Invincible diggers ignore being struck by falling bags.
    if (bagexist(bag) && !(d.invin && getbagdir(bag) === DIR_DOWN)) {
      bagf = true;
      break;
    }
  }
  if (bagf) {
    if (d.mdir === DIR_RIGHT || d.mdir === DIR_LEFT) {
      push = pushbags(d.mdir, clfirst, clcoll);
      d.bagtime++;
    } else if (!pushudbags(clfirst, clcoll)) {
      push = false;
    }
    if (!push) {
      d.x = ox;
      d.y = oy;
      d.dir = d.mdir;
      drawdig(n);
      incpenalty();
      d.dir = reversedir(d.mdir);
    }
  }
  if (clfirst[2] !== -1 && dg.bonusmode && d.alive) {
    for (let nmon = killmonsters(clfirst, clcoll); nmon !== 0; nmon--) {
      snd.soundeatm();
      sceatm(n);
    }
  }
  if (clfirst[0] !== -1) {
    scorebonus(n);
    initbonusmode();
  }
  d.h = div(d.x - 12, 20);
  d.rx = (d.x - 12) % 20;
  d.v = div(d.y - 18, 18);
  d.ry = (d.y - 18) % 18;
}

export function sceatm(n) {
  scoreeatm(n, digdat[n].msc);
  digdat[n].msc <<= 1;
}

function diggerdie(n) {
  const d = digdat[n];
  if (d.dirgetime !== 0) d.dirgetime--;
  switch (d.deathstage) {
    case DEATH_BAG:
      if (bagy(d.deathbag) + 6 > d.y) d.y = bagy(d.deathbag) + 6;
      drawdigger(sprnum(n), 15, d.x, d.y, false);
      incpenalty();
      if (getbagdir(d.deathbag) + 1 === 0) {
        snd.soundddie();
        d.deathtime = 5;
        d.deathstage = DEATH_ANIM;
        d.deathani = 0;
        d.y -= 6;
      }
      break;
    case DEATH_ANIM: {
      if (d.deathtime !== 0) {
        d.deathtime--;
        break;
      }
      if (d.deathani === 0) {
        d.dirgetime = DIRGE_TICKS;
        snd.music(snd.MUSIC_DIRGE, dg.diggers === 1 ? 1.0 : 0.7);
      }
      drawdigger(sprnum(n), 14 - d.deathani, d.x, d.y, false);
      const { clfirst, clcoll } = spr.collisions();
      incpenalty();
      if (d.deathani === 0 && clfirst[2] !== -1) killmonsters(clfirst, clcoll);
      if (d.deathani < 4) {
        d.deathani++;
        d.deathtime = 2;
      } else {
        d.deathstage = DEATH_TOMBSTONE;
        d.deathtime = 60;
      }
      break;
    }
    case DEATH_MONSTER:
      d.deathstage = DEATH_ARC;
      d.deathani = 0;
      d.deathtime = 0;
      break;
    case DEATH_ARC:
      if (d.deathani >= 0 && d.deathani <= 6) {
        drawdigger(sprnum(n), 15, d.x, d.y - deatharc[d.deathani], false);
        if (d.deathani === 6 && !isalive()) snd.musicoff();
        incpenalty();
        d.deathani++;
        if (d.deathani === 1) snd.soundddie();
        if (d.deathani === 7) {
          d.deathtime = 5;
          d.deathani = 0;
          d.deathstage = DEATH_ANIM;
        }
      }
      break;
    case DEATH_TOMBSTONE:
      // Once the dirge is over, the rest of the death takes no time.
      deathffwd = dg.diggers === 1 && d.deathtime <= 50 && !snd.dirgeplaying();
      if (d.deathtime !== 0) {
        d.deathtime--;
        break;
      }
      if (dg.diggers === 1 && (d.dirgetime !== 0 || snd.dirgeplaying())) break;
      deathffwd = false;
      d.dead = true;
      if (digdat.slice(0, dg.diggers).every((x) => x.dead)) {
        setdead(true);
      } else if (isalive() && d.lives > 0) {
        if (!dg.gauntlet) d.lives--;
        drawlives();
        if (d.lives > 0) {
          placedigger(n);
          d.invin = true;
          d.ivt = 50;
          spr.erasespr(FIRSTDIGGER + sprnum(n));
          putdigger(n);
        }
        clearfire(n);
        snd.music(dg.bonusmode ? snd.MUSIC_BONUS : snd.MUSIC_MAIN);
      } else {
        spr.erasespr(FIRSTDIGGER + sprnum(n));
        d.deathstage = DEATH_DONE;
        clearfire(n);
      }
      break;
    case DEATH_DONE:
      break;
  }
}

export function createbonus() {
  dg.bonusvisible = true;
  drawbonus(292, 18);
}

function initbonusmode() {
  dg.bonusmode = true;
  erasebonus();
  scr.inten(1);
  bonustimeleft = 250 - levof10() * 20;
  startbonustimeleft = 20;
  for (let i = 0; i < dg.diggers; i++) digdat[i].msc = 1;
}

function endbonusmode() {
  dg.bonusmode = false;
  scr.inten(0);
}

export function erasebonus() {
  if (dg.bonusvisible) {
    dg.bonusvisible = false;
    spr.erasespr(FIRSTBONUS);
  }
  scr.inten(0);
}

export function checkdiggerunderbag(h, v) {
  for (let n = dg.curplayer; n < dg.diggers + dg.curplayer; n++) {
    const d = digdat[n];
    if (d.alive && !d.invin && (d.mdir === DIR_UP || d.mdir === DIR_DOWN) &&
        div(d.x - 12, 20) === h &&
        (div(d.y - 18, 18) === v || div(d.y - 18, 18) + 1 === v)) {
      return true;
    }
  }
  return false;
}

// Kills Digger n, by a falling bag (stage 1) or a monster or fireball (3).
export function killdigger(n, stage, bag) {
  const d = digdat[n];
  if (d.invin) return;
  if (d.deathstage < DEATH_ANIM || d.deathstage > DEATH_TOMBSTONE) {
    d.alive = false;
    d.deathstage = stage;
    d.deathbag = bag;
  }
}

export function makeemfield() {
  emmask = 1 << dg.curplayer;
  for (let x = 0; x < MWIDTH; x++) {
    for (let y = 0; y < MHEIGHT; y++) {
      if (getlevch(x, y, levplan()) === 'C') emfield[y * MWIDTH + x] |= emmask;
      else emfield[y * MWIDTH + x] &= ~emmask;
    }
  }
}

export async function drawemeralds() {
  emmask = 1 << dg.curplayer;
  for (let x = 0; x < MWIDTH; x++) {
    for (let y = 0; y < MHEIGHT; y++) {
      if (emfield[y * MWIDTH + x] & emmask) {
        drawemerald(x * 20 + 12, y * 18 + 21);
        await redrawdelay();
      }
    }
  }
}

export function hitemerald(x, y, rx, ry, dir) {
  if (dir !== DIR_RIGHT && dir !== DIR_UP && dir !== DIR_LEFT && dir !== DIR_DOWN) return false;
  if (dir === DIR_RIGHT && rx !== 0) x++;
  if (dir === DIR_DOWN && ry !== 0) y++;
  const r = dir === DIR_RIGHT || dir === DIR_LEFT ? rx : ry;
  const i = y * MWIDTH + x;
  if (!(emfield[i] & emmask)) return false;
  if (r === embox[dir]) {
    drawemerald(x * 20 + 12, y * 18 + 21);
    incpenalty();
  }
  if (r === embox[dir + 1]) {
    eraseemerald(x * 20 + 12, y * 18 + 21);
    incpenalty();
    emfield[i] &= ~emmask;
    return true;
  }
  return false;
}

export function countem() {
  return emfield.filter((e) => e & emmask).length;
}

// A bag falling from (x, y) breaks the emerald under it.
export function killemerald(x, y) {
  const i = (y + 1) * MWIDTH + x;
  if (emfield[i] & emmask) {
    emfield[i] &= ~emmask;
    eraseemerald(x * 20 + 12, (y + 1) * 18 + 21);
  }
}

export function diggerx(n) {
  return digdat[n].x;
}

export function diggery(n) {
  return digdat[n].y;
}

export function digalive(n) {
  return digdat[n].alive;
}

export function digresettime(n) {
  digdat[n].bagtime = 0;
}

export function isalive() {
  for (let n = dg.curplayer; n < dg.diggers + dg.curplayer; n++) {
    if (digdat[n].alive) return true;
  }
  return false;
}

export function getlives(pl) {
  return digdat[pl].lives;
}

export function addlife(pl) {
  digdat[pl].lives++;
  snd.sound1up();
  snd.musicrefresh();
}

export function initlives() {
  for (let i = 0; i < DIGGERS; i++) digdat[i] = newdigger();
  for (let i = 0; i < dg.diggers + dg.nplayers - 1 && i < DIGGERS; i++) digdat[i].lives = 3;
}

export function declife(pl) {
  if (!dg.gauntlet) digdat[pl].lives--;
}
