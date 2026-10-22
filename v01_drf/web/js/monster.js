// Nobbins and Hobbins (monster.c, monster_obj.c).

import * as spr from './sprite.js';
import * as snd from './sound.js';
import {
  dg, DIR_NONE, DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN, MONSTERS, FIRSTMONSTER,
  FIRSTBAG, FIRSTDIGGER, randno, reversedir, div,
} from './state.js';
import { eatfield, getfield, drawrightblob, drawleftblob, drawtopblob, drawbottomblob } from './drawing.js';
import { levof10, incpenalty } from './main.js';
import {
  isalive, digalive, diggerx, diggery, killdigger, hitemerald, createbonus, sceatm,
} from './digger.js';
import { bagexist, bagy, getbagdir, pushbags, pushudbags, removebags } from './bags.js';
import { scorekill, scorekill2 } from './scores.js';

// What a monster looks like and where it is: a monster_obj of the original.
export class MonsterObj {
  constructor(id, nobbin, dir, x, y) {
    this.id = id;
    this.nobbin = nobbin;
    this.alive = true;
    this.zombie = false; // squashed by a bag, still to die
    this.dir = dir;
    this.x = x;
    this.y = y;
    this.monspr = 0;
    this.monspd = 1;
  }

  updspr() {
    const n = FIRSTMONSTER + this.id;
    if (this.alive) {
      if (this.nobbin) spr.initspr(n, this.monspr + 69, 4, 15, 0, 0);
      else if (this.dir === DIR_RIGHT) spr.initspr(n, this.monspr + 73, 4, 15, 0, 0);
      else if (this.dir === DIR_LEFT) spr.initspr(n, this.monspr + 77, 4, 15, 0, 0);
    } else if (this.zombie) {
      if (this.nobbin) spr.initspr(n, 72, 4, 15, 0, 0);
      else if (this.dir === DIR_RIGHT) spr.initspr(n, 76, 4, 15, 0, 0);
      else if (this.dir === DIR_LEFT) spr.initspr(n, 80, 4, 14, 0, 0);
    }
  }

  put() {
    this.updspr();
    spr.movedrawspr(FIRSTMONSTER + this.id, this.x, this.y);
  }

  draw() {
    this.updspr();
    spr.drawspr(FIRSTMONSTER + this.id, this.x, this.y);
  }

  animate() {
    if (this.alive) {
      this.monspr += this.monspd;
      if (this.monspr === 2 || this.monspr === 0) this.monspd = -this.monspd;
      if (this.monspr > 2) this.monspr = 2;
      if (this.monspr < 0) this.monspr = 0;
      this.draw();
    } else if (this.zombie) {
      this.draw();
    }
  }

  mutate() {
    this.nobbin = !this.nobbin;
    this.draw();
  }

  damage() {
    this.zombie = true;
    this.alive = false;
    this.draw();
  }

  kill() {
    this.alive = false;
    this.zombie = false;
    spr.erasespr(FIRSTMONSTER + this.id);
  }
}

function newmonster() {
  return {
    h: 0, v: 0, xr: 0, yr: 0, dir: 0, t: 0, hnt: 0, death: 0, bag: 0, dtime: 0,
    stime: 0, chase: 0, flag: false, mop: null,
  };
}

const mondat = Array.from({ length: MONSTERS }, newmonster);

let nextmonster = 0;
let totalmonsters = 0;
let maxmononscr = 0;
let nextmontime = 0;
let mongaptime = 0;
let chase = 0;
let unbonusflag = false;
let mongotgold = false;

export function initmonsters() {
  for (let i = 0; i < MONSTERS; i++) mondat[i] = newmonster();
  nextmonster = 0;
  chase = 0;
  mongaptime = 45 - (levof10() << 1);
  totalmonsters = levof10() + 5;
  const l = levof10();
  maxmononscr = l === 1 ? 3 : l <= 7 ? 4 : 5;
  nextmontime = 10;
  unbonusflag = true;
}

export function erasemonsters() {
  for (let i = 0; i < MONSTERS; i++) {
    if (mondat[i].flag) spr.erasespr(i + FIRSTMONSTER);
  }
}

export function domonsters() {
  if (nextmontime > 0) {
    nextmontime--;
  } else {
    if (nextmonster < totalmonsters && nmononscr() < maxmononscr && isalive() && !dg.bonusmode) {
      createmonster();
    }
    if (unbonusflag && nextmonster === totalmonsters && nextmontime === 0 && isalive()) {
      unbonusflag = false;
      createbonus();
    }
  }
  for (let i = 0; i < MONSTERS; i++) {
    const m = mondat[i];
    if (!m.flag) continue;
    if (m.hnt > 10 - levof10() && m.mop.nobbin) {
      m.mop.mutate();
      m.hnt = 0;
    }
    if (m.mop.alive) {
      if (m.t === 0) {
        monai(i);
        // Nobbins sometimes get an extra move
        if (randno(15 - levof10()) === 0 && m.mop.nobbin && m.mop.alive) monai(i);
      } else {
        m.t--;
      }
    } else {
      mondie(i);
    }
  }
}

function createmonster() {
  for (let i = 0; i < MONSTERS; i++) {
    const m = mondat[i];
    if (m.flag) continue;
    m.flag = true;
    m.t = 0;
    m.hnt = 0;
    m.h = 14;
    m.v = 0;
    m.xr = 0;
    m.yr = 0;
    m.dir = DIR_LEFT;
    m.chase = chase + dg.curplayer;
    m.mop = new MonsterObj(i, true, DIR_LEFT, 292, 18);
    chase = (chase + 1) % dg.diggers;
    nextmonster++;
    nextmontime = mongaptime;
    m.stime = 5;
    m.mop.put();
    break;
  }
}

export function mongold() {
  mongotgold = true;
}

function monai(mon) {
  const m = mondat[mon];
  const mop = m.mop;
  const monox = mop.x, monoy = mop.y;
  let dir;

  if (m.xr === 0 && m.yr === 0) {
    // The monster needs to know which way to turn next.

    // Turn hobbin back into nobbin if it's had its time
    if (m.hnt > 30 + (levof10() << 1) && !mop.nobbin) {
      m.hnt = 0;
      mop.mutate();
    }

    // Set up monster direction properties to chase Digger
    let dig = m.chase;
    // The other Digger of the current player (the same one, if it's the only one)
    if (!digalive(dig)) dig = 2 * dg.curplayer + (dg.diggers - 1) - dig;

    let p1, p2, p3, p4;
    if (Math.abs(diggery(dig) - mop.y) > Math.abs(diggerx(dig) - mop.x)) {
      [p1, p4] = diggery(dig) < mop.y ? [DIR_UP, DIR_DOWN] : [DIR_DOWN, DIR_UP];
      [p2, p3] = diggerx(dig) < mop.x ? [DIR_LEFT, DIR_RIGHT] : [DIR_RIGHT, DIR_LEFT];
    } else {
      [p1, p4] = diggerx(dig) < mop.x ? [DIR_LEFT, DIR_RIGHT] : [DIR_RIGHT, DIR_LEFT];
      [p2, p3] = diggery(dig) < mop.y ? [DIR_UP, DIR_DOWN] : [DIR_DOWN, DIR_UP];
    }

    // In bonus mode, run away from Digger
    if (dg.bonusmode) {
      [p1, p4] = [p4, p1];
      [p2, p3] = [p3, p2];
    }

    // Adjust priorities so that monsters don't reverse direction unless they
    // really have to
    dir = reversedir(m.dir);
    if (dir === p1) {
      p1 = p2;
      p2 = p3;
      p3 = p4;
      p4 = dir;
    }
    if (dir === p2) {
      p2 = p3;
      p3 = p4;
      p4 = dir;
    }
    if (dir === p3) {
      p3 = p4;
      p4 = dir;
    }

    // Introduce a random element on levels <6: occasionally swap p1 and p3
    if (randno(levof10() + 5) === 1 && levof10() < 6) [p1, p3] = [p3, p1];

    // Check field and find direction
    if (fieldclear(p1, m.h, m.v)) dir = p1;
    else if (fieldclear(p2, m.h, m.v)) dir = p2;
    else if (fieldclear(p3, m.h, m.v)) dir = p3;
    else if (fieldclear(p4, m.h, m.v)) dir = p4;

    // Hobbins don't care about the field: they go where they want.
    if (!mop.nobbin) dir = p1;

    // Monsters take a time penalty for changing direction
    if (m.dir !== dir) m.t++;
    m.dir = dir;
  }

  // If monster is about to go off edge of screen, stop it.
  if ((mop.x === 292 && m.dir === DIR_RIGHT) || (mop.x === 12 && m.dir === DIR_LEFT) ||
      (mop.y === 180 && m.dir === DIR_DOWN) || (mop.y === 18 && m.dir === DIR_UP)) {
    m.dir = DIR_NONE;
  }

  // Change hdir for hobbin
  if (m.dir === DIR_LEFT || m.dir === DIR_RIGHT) mop.dir = m.dir;

  // Hobbins dig
  const hobbin = !mop.nobbin;
  if (hobbin) eatfield(mop.x, mop.y, m.dir);

  // (Draw new tunnels) and move monster
  let x = mop.x, y = mop.y;
  let moved = true;
  switch (m.dir) {
    case DIR_RIGHT:
      if (hobbin) drawrightblob(x, y);
      x += 4;
      break;
    case DIR_UP:
      if (hobbin) drawtopblob(x, y);
      y -= 3;
      break;
    case DIR_LEFT:
      if (hobbin) drawleftblob(x, y);
      x -= 4;
      break;
    case DIR_DOWN:
      if (hobbin) drawbottomblob(x, y);
      y += 3;
      break;
    default:
      moved = false;
  }

  // Hobbins can eat emeralds
  if (hobbin) hitemerald(div(x - 12, 20), div(y - 18, 18), (x - 12) % 20, (y - 18) % 18, m.dir);

  // If Digger's gone, don't bother
  if (!isalive()) moved = false;

  // If monster's just started, don't move yet
  if (m.stime !== 0) {
    m.stime--;
    moved = false;
  }

  // Increase time counter for hobbin
  if (hobbin && m.hnt < 100) m.hnt++;

  if (moved) {
    mop.x = x;
    mop.y = y;
  }

  // Draw monster
  let push = true;
  mop.animate();
  const { clfirst, clcoll } = spr.collisions();
  incpenalty();

  // Collision with another monster
  if (clfirst[2] !== -1) {
    m.t++; // Time penalty
    // Ensure both aren't moving in the same dir.
    for (let i = clfirst[2]; i !== -1; i = clcoll[i]) {
      const o = mondat[i - FIRSTMONSTER];
      if (m.dir === o.dir && o.stime === 0 && m.stime === 0) o.dir = reversedir(o.dir);
      // Recordings of before 19981125 have a bug of the time to reproduce
      if (!dg.kludge || !((i - FIRSTMONSTER) & 1)) incpenalty();
    }
    if (dg.kludge && clfirst[0] !== -1) incpenalty();
  }

  // Check for collision with bag
  let bagf = false;
  for (let i = clfirst[1]; i !== -1; i = clcoll[i]) {
    if (bagexist(i - FIRSTBAG)) {
      bagf = true;
      break;
    }
  }
  if (bagf) {
    m.t++; // Time penalty
    mongotgold = false;
    if (m.dir === DIR_RIGHT || m.dir === DIR_LEFT) {
      push = pushbags(m.dir, clfirst, clcoll); // Horizontal push
      m.t++; // Time penalty
    } else if (!pushudbags(clfirst, clcoll)) { // Vertical push
      push = false;
    }
    if (mongotgold) m.t = 0; // No time penalty if monster eats gold
    if (!mop.nobbin && m.hnt > 1) removebags(clfirst, clcoll); // Hobbins eat bags
  }

  // Increase hobbin cross counter
  if (mop.nobbin && clfirst[2] !== -1 && isalive()) m.hnt++;

  // See if bags push monster back
  if (!push) {
    if (moved) {
      mop.x = monox;
      mop.y = monoy;
      moved = false;
    }
    mop.animate();
    incpenalty();
    if (mop.nobbin) m.hnt++; // The other way to create hobbin: stuck on h-bag
    if ((m.dir === DIR_UP || m.dir === DIR_DOWN) && mop.nobbin) {
      m.dir = reversedir(m.dir); // If vertical, give up
    }
  }

  // Collision with Digger
  if (clfirst[4] !== -1 && isalive()) {
    if (dg.bonusmode) {
      // Eaten by a live Digger only
      let eaten = false;
      for (let i = clfirst[4]; i !== -1; i = clcoll[i]) {
        const d = i - FIRSTDIGGER + dg.curplayer;
        if (!digalive(d)) continue;
        if (!eaten) {
          killmon(mon);
          eaten = true;
        }
        sceatm(d);
      }
      if (eaten) snd.soundeatm();
    } else {
      for (let i = clfirst[4]; i !== -1; i = clcoll[i]) {
        const d = i - FIRSTDIGGER + dg.curplayer;
        if (digalive(d)) killdigger(d, 3, 0);
      }
    }
  }

  // Update co-ordinates
  m.h = div(mop.x - 12, 20);
  m.v = div(mop.y - 18, 18);
  m.xr = (mop.x - 12) % 20;
  m.yr = (mop.y - 18) % 18;
}

function mondie(mon) {
  const m = mondat[mon];
  switch (m.death) {
    case 1: // squashed, falling with the bag
      if (bagy(m.bag) + 6 > m.mop.y) m.mop.y = bagy(m.bag);
      m.mop.animate();
      incpenalty();
      if (getbagdir(m.bag) === -1) {
        m.dtime = 1;
        m.death = 4;
      }
      break;
    case 4:
      if (m.dtime !== 0) {
        m.dtime--;
      } else {
        killmon(mon);
        if (dg.diggers === 2) scorekill2();
        else scorekill(dg.curplayer);
      }
      break;
  }
}

function fieldclear(dir, x, y) {
  switch (dir) {
    case DIR_RIGHT:
      return x < 14 && (getfield(x + 1, y) & 0x2000) === 0 &&
        ((getfield(x + 1, y) & 1) === 0 || (getfield(x, y) & 0x10) === 0);
    case DIR_UP:
      return y > 0 && (getfield(x, y - 1) & 0x2000) === 0 &&
        ((getfield(x, y - 1) & 0x800) === 0 || (getfield(x, y) & 0x40) === 0);
    case DIR_LEFT:
      return x > 0 && (getfield(x - 1, y) & 0x2000) === 0 &&
        ((getfield(x - 1, y) & 0x10) === 0 || (getfield(x, y) & 1) === 0);
    case DIR_DOWN:
      return y < 9 && (getfield(x, y + 1) & 0x2000) === 0 &&
        ((getfield(x, y + 1) & 0x40) === 0 || (getfield(x, y) & 0x800) === 0);
  }
  return false;
}

// Monsters going up under a falling bag in column h turn back.
export function checkmonscared(h) {
  for (const m of mondat) {
    if (h === m.h && m.dir === DIR_UP) m.dir = DIR_DOWN;
  }
}

export function killmon(mon) {
  const m = mondat[mon];
  if (!m.flag) return;
  m.flag = false;
  m.mop.kill();
  if (dg.bonusmode) totalmonsters++;
}

export function squashmonsters(bag, clfirst, clcoll) {
  for (let i = clfirst[2]; i !== -1; i = clcoll[i]) {
    const m = mondat[i - FIRSTMONSTER];
    if (m.mop.y >= bagy(bag)) {
      m.mop.damage();
      m.death = 1;
      m.bag = bag;
    }
  }
}

export function killmonsters(clfirst, clcoll) {
  let n = 0;
  for (let i = clfirst[2]; i !== -1; i = clcoll[i]) {
    killmon(i - FIRSTMONSTER);
    n++;
  }
  return n;
}

export function monleft() {
  return nmononscr() + totalmonsters - nextmonster;
}

function nmononscr() {
  return mondat.filter((m) => m.flag).length;
}

export function incmont(n) {
  if (n > MONSTERS) n = MONSTERS;
  for (let m = 1; m < n; m++) mondat[m].t++;
}
