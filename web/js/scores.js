// Scores and the high score tables, kept by the server (scores.c).

import * as scr from './screen.js';
import * as snd from './sound.js';
import { dg, DIGGERS } from './state.js';
import { outtext, erasetext, drawlives } from './drawing.js';
import { getlives, addlife } from './digger.js';
import { newframe, cleartopline, incpenalty, sleep } from './main.js';
import { kbhit, getkey } from './input.js';

const BONUS_SCORE = 20000;
const TABLE_SIZE = 10;

// The score of each Digger, and the next one to get a life at.
const scdat = Array.from({ length: DIGGERS }, () => ({ score: 0, nextbs: 0 }));

// High scores of the current kind of game: [{name, score}], best first.
let table = [];

// Each kind of game has its own high scores.
function mode() {
  return (dg.gauntlet ? 'gauntlet' : 'normal') + dg.diggers;
}

export async function loadscores() {
  settable([]);
  try {
    const resp = await fetch(`api/scores?mode=${mode()}`);
    if (resp.ok) settable(await resp.json());
  } catch (e) {
    console.warn('high scores unavailable:', e);
  }
}

async function savescore(entry) {
  try {
    const resp = await fetch(`api/scores?mode=${mode()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (resp.ok) settable(await resp.json());
  } catch (e) {
    console.warn('high score not saved:', e);
  }
}

// The table as it is shown: empty places filled in.
function settable(t) {
  table = t;
  while (table.length < TABLE_SIZE) table.push({ name: '...', score: 0 });
}

export function initscores() {
  for (let i = 0; i < dg.diggers; i++) addscore(i, 0);
}

export function zeroscores() {
  for (const s of scdat) {
    s.score = 0;
    s.nextbs = BONUS_SCORE;
  }
}

function scorex(n) {
  if (n === 0) return 0;
  return scdat[1].score < 100000 ? 236 : 248;
}

export function writecurscore(col) {
  writenum(scdat[dg.curplayer].score, scorex(dg.curplayer), 0, 6, col);
}

export function drawscores() {
  writenum(scdat[0].score, 0, 0, 6, 3);
  if (dg.nplayers === 2 || dg.diggers === 2) writenum(scdat[1].score, scorex(1), 0, 6, 3);
}

export function addscore(n, score) {
  const s = scdat[n];
  s.score += score;
  if (s.score > 999999) s.score = 0; // the counter wraps around
  writenum(s.score, scorex(n), 0, 6, 1);
  if (s.score >= s.nextbs + n) { // +n to reproduce original bug
    if (getlives(n) < 5) {
      if (dg.gauntlet) dg.cgtime += 15000; // 15 second time bonus instead of the life
      else addlife(n);
      drawlives();
    }
    s.nextbs += BONUS_SCORE;
  }
  incpenalty();
  incpenalty();
  incpenalty();
}

export async function endofgame() {
  for (let i = 0; i < dg.diggers; i++) addscore(i, 0);
  if (dg.gauntlet) {
    cleartopline();
    outtext('TIME UP', 120, 0, 3);
    for (let i = 0; i < 50 && !dg.escape; i++) await newframe();
    erasetext(7, 120, 0, 3);
  }
  let initflag = false;
  for (let i = dg.curplayer; i < dg.curplayer + dg.diggers; i++) {
    const score = scdat[i].score;
    if (score <= table[TABLE_SIZE - 1].score) continue;
    scr.clear();
    drawscores();
    outtext(`PLAYER ${i + 1}`, 108, 0, 2);
    outtext(' NEW HIGH SCORE ', 64, 40, 2);
    const name = await getinitials();
    // Below the scores that are higher, above the ones that are as high
    const at = table.findIndex((e) => e.score <= score);
    table.splice(at, 0, { name, score });
    table.length = TABLE_SIZE;
    await savescore({ name, score });
    initflag = true;
  }
  if (!initflag && !dg.gauntlet) {
    cleartopline();
    outtext('GAME OVER', 104, 0, 3);
    for (let i = 0; i < 50 && !dg.escape; i++) await newframe();
    erasetext(9, 104, 0, 3);
  }
}

export function showtable() {
  erasetext(11, 16, 25, 3);
  outtext('HIGH SCORES', 16, 25, 3);
  for (let i = 0; i < TABLE_SIZE; i++) {
    const { name, score } = table[i];
    erasetext(11, 16, 44 + 13 * i, 3);
    outtext(`${name}  ${numtostring(score)}`, 16, 44 + 13 * i, i === 0 ? 2 : 1);
  }
}

async function getinitials() {
  await newframe();
  outtext('ENTER YOUR', 100, 70, 3);
  outtext(' INITIALS', 100, 90, 3);
  outtext('_ _ _', 128, 130, 3);
  snd.killsound();
  const name = ['.', '.', '.'];
  for (let i = 0; i < 3;) {
    const k = await getinitial(i * 24 + 128, 130);
    if (k === null) { // back to the previous one
      if (i > 0) i--;
      continue;
    }
    scr.write(i * 24 + 128, 130, k, 3);
    name[i++] = k;
  }
  for (let i = 0; i < 20; i++) await flashywait();
  snd.setupsound();
  scr.clear();
  scr.pal(0);
  scr.inten(0);
  return name.join('');
}

// Flashes the screen for a frame.
async function flashywait() {
  scr.pal(1);
  scr.present();
  await sleep(dg.ftime / 2);
  scr.pal(0);
  scr.present();
  await sleep(dg.ftime / 2);
}

// Waits for a letter or digit to be typed at (x, y), null for backspace.
async function getinitial(x, y) {
  scr.write(x, y, '_', 3);
  for (;;) {
    while (kbhit()) {
      const { key } = getkey();
      if (key === 'Backspace' || key === 'Delete') return null;
      if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
    }
    await flashywait();
  }
}

export function scorekill(n) {
  addscore(n, 250);
}

// A monster killed by a bag: half for each Digger, or all of it for one if
// the other is out of lives.
export function scorekill2() {
  let s0 = 125, s1 = 125;
  if (getlives(0) === 0) {
    s0 = 0;
    s1 = getlives(1) > 0 ? 250 : 0;
  } else if (getlives(1) === 0) {
    s0 = 250;
    s1 = 0;
  }
  addscore(0, s0);
  addscore(1, s1);
}

export function scoreemerald(n) {
  addscore(n, 25);
}

export function scoreoctave(n) {
  addscore(n, 250);
}

export function scoregold(n) {
  addscore(n, 500);
}

export function scorebonus(n) {
  addscore(n, 1000);
}

export function scoreeatm(n, msc) {
  addscore(n, msc * 200);
}

function writenum(n, x, y, w, c) {
  let xp = (w - 1) * 12 + x;
  while (w > 0) {
    const d = n % 10;
    if (w > 1 || d > 0) scr.write(xp, y, String(d), c);
    n = Math.floor(n / 10);
    w--;
    xp -= 12;
  }
}

function numtostring(n) {
  return String(n).padStart(6);
}
