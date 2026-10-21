// The playing field, text and the drawing of everything on it (drawing.c).

import * as scr from './screen.js';
import * as spr from './sprite.js';
import {
  dg, MWIDTH, MHEIGHT, MSIZE, BAGS, MONSTERS, DIGGERS, FIREBALLS, FIRSTBAG,
  FIRSTMONSTER, FIRSTDIGGER, LASTDIGGER, FIRSTBONUS, LASTBONUS, FIRSTFIREBALL,
  LASTFIREBALL, div,
} from './state.js';
import { getlevch, levplan, redrawdelay } from './main.js';
import { getlives } from './digger.js';

// What is dug out of each cell: bits 0-4 the horizontal tunnel, 6-11 the
// vertical one, bit 13 clear if the cell has been dug at all.
export const field = new Array(MSIZE).fill(0);
const field1 = new Array(MSIZE).fill(0);
const field2 = new Array(MSIZE).fill(0);

const bitmasks = [0xfffe, 0xfffd, 0xfffb, 0xfff7, 0xffef, 0xffdf, 0xffbf, 0xff7f,
  0xfeff, 0xfdff, 0xfbff, 0xf7ff];

const digspr = [0, 0];
const digspd = [1, 1];
const firespr = [0, 0];

export function outtext(p, x, y, c) {
  for (const ch of p) {
    scr.write(x, y, scr.isvalchar(ch) ? ch : ' ', c);
    x += scr.CHR_W;
  }
}

export function erasetext(n, x, y, c) {
  outtext(' '.repeat(n), x, y, c);
}

export function makefield() {
  for (let x = 0; x < MWIDTH; x++) {
    for (let y = 0; y < MHEIGHT; y++) {
      const i = y * MWIDTH + x;
      field[i] = 0xffff;
      const c = getlevch(x, y, levplan());
      if (c === 'S' || c === 'V') field[i] &= 0xd03f;
      if (c === 'S' || c === 'H') field[i] &= 0xdfe0;
      if (dg.curplayer === 0) field1[i] = field[i];
      else field2[i] = field[i];
    }
  }
}

export async function drawstatics() {
  const saved = dg.curplayer === 0 ? field1 : field2;
  for (let i = 0; i < MSIZE; i++) field[i] = saved[i];
  scr.pal(0);
  scr.inten(0);
  drawbackg(levplan());
  await drawfield();
}

export function savefield() {
  const saved = dg.curplayer === 0 ? field1 : field2;
  for (let i = 0; i < MSIZE; i++) saved[i] = field[i];
}

async function drawfield() {
  for (let x = 0; x < MWIDTH; x++) {
    for (let y = 0; y < MHEIGHT; y++) {
      const i = y * MWIDTH + x;
      if ((field[i] & 0x2000) !== 0) continue;
      const xp = x * 20 + 12;
      const yp = y * 18 + 18;
      if ((field[i] & 0xfc0) !== 0xfc0) {
        field[i] &= 0xd03f;
        drawbottomblob(xp, yp - 15);
        drawbottomblob(xp, yp - 12);
        drawbottomblob(xp, yp - 9);
        drawbottomblob(xp, yp - 6);
        drawbottomblob(xp, yp - 3);
        drawtopblob(xp, yp + 3);
      }
      if ((field[i] & 0x1f) !== 0x1f) {
        field[i] &= 0xdfe0;
        drawrightblob(xp - 16, yp);
        drawrightblob(xp - 12, yp);
        drawrightblob(xp - 8, yp);
        drawrightblob(xp - 4, yp);
        drawleftblob(xp + 4, yp);
      }
      if (x < 14 && (field[i + 1] & 0xfdf) !== 0xfdf) drawrightblob(xp, yp);
      if (y < 9 && (field[i + MWIDTH] & 0xfdf) !== 0xfdf) drawbottomblob(xp, yp);
      await redrawdelay();
    }
  }
}

// Marks the field as dug by something at (x, y) going in direction dir.
export function eatfield(x, y, dir) {
  let h = div(x - 12, 20), xr = div((x - 12) % 20, 4);
  let v = div(y - 18, 18), yr = div((y - 18) % 18, 3);
  let i;
  switch (dir) {
    case 0: // right
      h++;
      i = v * MWIDTH + h;
      field[i] &= bitmasks[xr];
      if (field[i] & 0x1f) break;
      field[i] &= 0xdfff;
      break;
    case 2: // up
      yr--;
      if (yr < 0) {
        yr += 6;
        v--;
      }
      i = v * MWIDTH + h;
      field[i] &= bitmasks[6 + yr];
      if (field[i] & 0xfc0) break;
      field[i] &= 0xdfff;
      break;
    case 4: // left
      xr--;
      if (xr < 0) {
        xr += 5;
        h--;
      }
      i = v * MWIDTH + h;
      field[i] &= bitmasks[xr];
      if (field[i] & 0x1f) break;
      field[i] &= 0xdfff;
      break;
    case 6: // down
      v++;
      i = v * MWIDTH + h;
      field[i] &= bitmasks[6 + yr];
      if (field[i] & 0xfc0) break;
      field[i] &= 0xdfff;
      break;
  }
}

export function getfield(x, y) {
  return field[y * MWIDTH + x];
}

export function creatembspr() {
  for (let i = 0; i < BAGS; i++) spr.createspr(FIRSTBAG + i, 62, 4, 15, 0, 0);
  for (let i = 0; i < MONSTERS; i++) spr.createspr(FIRSTMONSTER + i, 71, 4, 15, 0, 0);
  createdbfspr();
}

export function initmbspr() {
  for (let i = 0; i < BAGS; i++) spr.initspr(FIRSTBAG + i, 62, 4, 15, 0, 0);
  for (let i = 0; i < MONSTERS; i++) spr.initspr(FIRSTMONSTER + i, 71, 4, 15, 0, 0);
  initdbfspr();
}

export function drawgold(n, t, x, y) {
  spr.initspr(FIRSTBAG + n, t + 62, 4, 15, 0, 0);
  spr.drawspr(FIRSTBAG + n, x, y);
}

function drawlife(t, x, y) {
  spr.drawmiscspr(x, y, t + 110, 4, 12);
}

export function drawemerald(x, y) {
  spr.initmiscspr(x, y, 4, 10);
  spr.drawmiscspr(x, y, 108, 4, 10);
  spr.getis();
}

export function eraseemerald(x, y) {
  spr.initmiscspr(x, y, 4, 10);
  spr.drawmiscspr(x, y, 109, 4, 10);
  spr.getis();
}

function createdbfspr() {
  resetdbf();
  for (let i = FIRSTDIGGER; i < LASTDIGGER; i++) spr.createspr(i, 0, 4, 15, 0, 0);
  for (let i = FIRSTBONUS; i < LASTBONUS; i++) spr.createspr(i, 81, 4, 15, 0, 0);
  for (let i = FIRSTFIREBALL; i < LASTFIREBALL; i++) spr.createspr(i, 82, 2, 8, 0, 0);
}

function initdbfspr() {
  resetdbf();
  for (let i = FIRSTDIGGER; i < LASTDIGGER; i++) spr.initspr(i, 0, 4, 15, 0, 0);
  for (let i = FIRSTBONUS; i < LASTBONUS; i++) spr.initspr(i, 81, 4, 15, 0, 0);
  for (let i = FIRSTFIREBALL; i < LASTFIREBALL; i++) spr.initspr(i, 82, 2, 8, 0, 0);
}

function resetdbf() {
  for (let i = 0; i < DIGGERS; i++) {
    digspd[i] = 1;
    digspr[i] = 0;
  }
  for (let i = 0; i < FIREBALLS; i++) firespr[i] = 0;
}

function blob(x, y, ch, wid, hei) {
  spr.initmiscspr(x, y, wid, hei);
  spr.drawmiscspr(x, y, ch, wid, hei);
  spr.getis();
}

export function drawrightblob(x, y) {
  blob(x + 16, y - 1, 102, 2, 18);
}

export function drawleftblob(x, y) {
  blob(x - 8, y - 1, 104, 2, 18);
}

export function drawtopblob(x, y) {
  blob(x - 4, y - 6, 103, 6, 6);
}

export function drawbottomblob(x, y) {
  blob(x - 4, y + 15, 105, 6, 6);
}

export function drawfurryblob(x, y) {
  blob(x - 4, y + 15, 107, 6, 8);
}

export function drawsquareblob(x, y) {
  blob(x - 4, y + 17, 106, 6, 6);
}

function drawbackg(l) {
  for (let y = 14; y < 200; y += 4) {
    for (let x = 0; x < 320; x += 20) spr.drawmiscspr(x, y, 93 + l, 5, 4);
  }
}

// Fireball n, t is 0 while it flies, 1-3 as it explodes.
export function drawfire(n, x, y, t) {
  const nn = n === 0 ? 0 : 32;
  if (t === 0) {
    firespr[n]++;
    if (firespr[n] > 2) firespr[n] = 0;
    spr.initspr(FIRSTFIREBALL + n, 82 + firespr[n] + nn, 2, 8, 0, 0);
  } else {
    spr.initspr(FIRSTFIREBALL + n, 84 + t + nn, 2, 8, 0, 0);
  }
  spr.drawspr(FIRSTFIREBALL + n, x, y);
}

export function drawbonus(x, y) {
  spr.initspr(FIRSTBONUS, 81, 4, 15, 0, 0);
  spr.movedrawspr(FIRSTBONUS, x, y);
}

// Digger n facing t (a direction, or 10-15 for its death), f if it can fire.
export function drawdigger(n, t, x, y, f) {
  const nn = n === 0 ? 0 : 31;
  digspr[n] += digspd[n];
  if (digspr[n] === 2 || digspr[n] === 0) digspd[n] = -digspd[n];
  if (digspr[n] > 2) digspr[n] = 2;
  if (digspr[n] < 0) digspr[n] = 0;
  if (t >= 0 && t <= 6 && !(t & 1)) {
    spr.initspr(FIRSTDIGGER + n, (t + (f ? 0 : 1)) * 3 + digspr[n] + 1 + nn, 4, 15, 0, 0);
    spr.drawspr(FIRSTDIGGER + n, x, y);
    return;
  }
  if (t >= 10 && t <= 15) {
    spr.initspr(FIRSTDIGGER + n, 40 + nn - t, 4, 15, 0, 0);
    spr.drawspr(FIRSTDIGGER + n, x, y);
    return;
  }
  spr.first.fill(-1);
}

export function drawlives() {
  if (dg.gauntlet) {
    const g = Math.max(0, Math.floor(dg.cgtime / 1000));
    const s = `${Math.floor(g / 60)}`.padStart(3) + ':' + `${g % 60}`.padStart(2, '0');
    outtext(s, 124, 0, 3);
    return;
  }
  let n = getlives(0) - 1;
  erasetext(5, 96, 0, 2);
  if (n > 4) {
    drawlife(0, 80, 0);
    outtext(`X${n}`, 100, 0, 2);
  } else {
    for (let l = 1; l < 5; l++) {
      drawlife(n > 0 ? 0 : 2, l * 20 + 60, 0);
      n--;
    }
  }
  if (dg.nplayers === 2 || dg.diggers === 2) {
    // Player 2 in green when playing alongside player 1
    const c = dg.diggers === 2 ? 1 : 2;
    const life = dg.diggers === 2 ? 3 : 1;
    erasetext(5, 164, 0, c);
    n = getlives(1) - 1;
    if (n > 4) {
      const buf = `${n}X`;
      outtext(buf, 220 - buf.length * scr.CHR_W, 0, c);
      drawlife(life, 224, 0);
    } else {
      for (let l = 1; l < 5; l++) {
        drawlife(n > 0 ? life : 2, 244 - l * 20, 0);
        n--;
      }
    }
  }
}
