// The title screen and the game loop (main.c).

import * as scr from './screen.js';
import * as snd from './sound.js';
import * as input from './input.js';
import { dg, leveldat, GAUNTLET_SECOND } from './state.js';
import {
  outtext, erasetext, makefield, drawstatics, savefield, creatembspr, initmbspr, drawlives,
} from './drawing.js';
import {
  initdigger, dodigger, erasediggers, killfire, erasebonus, countem, makeemfield,
  drawemeralds, isalive, digalive, getlives, initlives, declife, deathffwd, dirgehold,
} from './digger.js';
import { initmonsters, domonsters, erasemonsters, monleft, incmont } from './monster.js';
import { initbags, drawbags, dobags, cleanupbags, getnmovingbags } from './bags.js';
import {
  loadscores, showtable, zeroscores, drawscores, writecurscore, addscore, initscores, endofgame,
} from './scores.js';
import { TitleAnim, TITLE_ANIM_LAST_FRAME } from './title.js';

const gamedat = [{ level: 1, levdone: false }, { level: 1, levdone: false }];

let levnotdrawn = false;
let alldead = false;
let penalty = 0;

const modes = [
  { gauntlet: false, nplayers: 1, diggers: 1, title: [['ONE', 220], [' PLAYER ', 192]] },
  { gauntlet: false, nplayers: 2, diggers: 1, title: [['TWO', 220], [' PLAYERS', 184]] },
  { gauntlet: false, nplayers: 1, diggers: 2, title: [['TWO PLAYER', 180], ['SIMULTANEOUS', 170]] },
  { gauntlet: true, nplayers: 1, diggers: 1, title: [['GAUNTLET', 192], ['MODE', 216]] },
  { gauntlet: true, nplayers: 1, diggers: 2, title: [['TWO PLAYER', 180], ['GAUNTLET', 192]] },
];
let mode = 0;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Timing ------------------------------------------------------------------

let nexttick = 0;

// Shows the screen, then waits until ms after the last time it was done.
async function tick(ms) {
  scr.present();
  const now = performance.now();
  nexttick += ms;
  if (nexttick < now - 100) nexttick = now; // fell behind, as in a background tab
  await sleep(nexttick - now);
}

// Waits for the next frame (game tick).
export async function newframe() {
  if (!deathffwd) await tick(dg.ftime);
  input.drainkeys();
  input.advancefire();
}

// A short delay between the parts of a level as it is drawn.
export async function redrawdelay() {
  if (!dg.escape) await tick(dg.ftime / 3);
}

// --- Levels ------------------------------------------------------------------

export function getlevch(x, y, l) {
  // No level, as player 2 has none in a one player game: nothing there
  if (l < 1) return ' ';
  // Room for two Diggers to start in
  if ((l === 3 || l === 4) && dg.diggers === 2 && y === 9 && (x === 6 || x === 8)) return 'H';
  return leveldat[l - 1][y][x];
}

function levno() {
  return gamedat[dg.curplayer].level;
}

// Level plan: 12345678, 678, (5678) 247 times, 5 forever.
export function levplan() {
  const l = levno();
  return l > 8 ? (l & 3) + 5 : l;
}

export function levof10() {
  return Math.min(levno(), 10);
}

export function incpenalty() {
  penalty++;
}

export function setdead(df) {
  alldead = df;
}

export function cleartopline() {
  erasetext(26, 0, 0, 3);
  erasetext(1, 308, 0, 3);
}

function initlevel() {
  gamedat[dg.curplayer].levdone = false;
  makefield();
  makeemfield();
  initbags();
  levnotdrawn = true;
}

async function drawscreen() {
  scr.clear();
  creatembspr();
  await drawstatics();
  await drawbags();
  await drawemeralds();
  initdigger();
  initmonsters();
}

function initchars() {
  initmbspr();
  initdigger();
  initmonsters();
}

function checklevdone() {
  gamedat[dg.curplayer].levdone = (countem() === 0 || monleft() === 0) && isalive();
}

function getalllives() {
  let t = 0;
  for (let i = dg.curplayer; i < dg.diggers + dg.curplayer; i++) t += getlives(i);
  return t;
}

// --- The game ----------------------------------------------------------------

async function game() {
  let flashplayer = false;
  if (dg.gauntlet) {
    dg.cgtime = dg.gtime * GAUNTLET_SECOND;
    dg.timeout = false;
  }
  initlives();
  gamedat[0].level = dg.startlev;
  if (dg.nplayers === 2) gamedat[1].level = dg.startlev;
  alldead = false;
  scr.clear();
  dg.curplayer = 0;
  initlevel();
  dg.curplayer = 1;
  initlevel();
  zeroscores();
  dg.bonusvisible = true;
  if (dg.nplayers === 2) flashplayer = true;
  dg.curplayer = 0;
  while (getalllives() !== 0 && !dg.escape && !dg.timeout) {
    while (!alldead && !dg.escape && !dg.timeout) {
      initmbspr();
      dg.randv = (Math.random() * 2 ** 32) | 0;
      if (levnotdrawn) {
        levnotdrawn = false;
        await drawscreen();
        if (flashplayer) {
          flashplayer = false;
          cleartopline();
          for (let t = 0; t < 15; t++) {
            for (let c = 1; c <= 3; c++) {
              outtext(`PLAYER ${dg.curplayer + 1}`, 108, 0, c);
              writecurscore(c);
              await newframe();
              if (dg.escape) return;
            }
          }
          drawscores();
          for (let i = 0; i < dg.diggers; i++) addscore(i, 0);
        } else {
          drawscores(); // The other player's too, on a new level
        }
      } else {
        initchars();
      }
      erasetext(8, 108, 0, 3);
      initscores();
      drawlives();
      snd.music(snd.MUSIC_MAIN);

      input.flushkeybuf();
      input.resetdirections();
      const cur = gamedat[dg.curplayer];
      while (!alldead && !cur.levdone && !dg.escape && !dg.timeout) {
        penalty = 0;
        await newframe();
        if (dg.escape || dg.timeout) break;
        while (dirgehold() && snd.dirgeplaying() && !dg.escape) await sleep(10);
        dodigger();
        domonsters();
        dobags();
        // Monsters slow down when there is a lot to draw, as on the
        // original hardware
        if (penalty > 8) incmont(penalty - 8);
        checklevdone();
        await testpause();
      }
      erasediggers();
      snd.musicoff();
      // Let the bags on the move come to rest
      let t = 20;
      while ((getnmovingbags() !== 0 || t !== 0) && !dg.escape && !dg.timeout) {
        if (t !== 0) t--;
        penalty = 0;
        await newframe();
        if (dg.escape || dg.timeout) break;
        dobags();
        dodigger();
        domonsters();
        if (penalty < 8) t = 0;
      }
      snd.soundstop();
      for (let i = dg.curplayer; i < dg.diggers + dg.curplayer; i++) killfire(i);
      erasebonus();
      cleanupbags();
      savefield();
      erasemonsters();
      scr.present();
      if (cur.levdone) await snd.soundlevdone();
      if (countem() === 0 || cur.levdone) {
        for (let i = dg.curplayer; i < dg.diggers + dg.curplayer; i++) {
          if (getlives(i) > 0 && !digalive(i)) declife(i);
        }
        drawlives();
        cur.level = Math.min(cur.level + 1, 1000);
        initlevel();
      } else if (alldead) {
        for (let i = dg.curplayer; i < dg.curplayer + dg.diggers; i++) {
          if (getlives(i) > 0) declife(i);
        }
        drawlives();
      }
      if ((alldead && getalllives() === 0 && !dg.gauntlet && !dg.escape) || dg.timeout) {
        await endofgame();
      }
    }
    alldead = false;
    if (dg.nplayers === 2 && getlives(1 - dg.curplayer) !== 0) {
      dg.curplayer = 1 - dg.curplayer;
      flashplayer = levnotdrawn = true;
    }
  }
}

async function testpause() {
  if (!input.flags.pause) {
    snd.soundpauseoff();
    return;
  }
  snd.soundpause();
  cleartopline();
  outtext('PRESS ANY KEY', 80, 0, 1);
  scr.present();
  input.flushkeybuf();
  await input.waitkey();
  cleartopline();
  drawscores();
  for (let i = 0; i < dg.diggers; i++) addscore(i, 0);
  drawlives();
  nexttick = performance.now();
  input.flags.pause = false;
  snd.soundpauseoff();
}

// --- The title screen --------------------------------------------------------

function shownplayers() {
  erasetext(10, 180, 25, 3);
  erasetext(12, 170, 39, 3);
  const [line1, line2] = modes[mode].title;
  outtext(line1[0], line1[1], 25, 3);
  outtext(line2[0], line2[1], 39, 3);
}

function switchnplayers() {
  mode = (mode + 1) % modes.length;
  const { gauntlet, nplayers, diggers } = modes[mode];
  Object.assign(dg, { gauntlet, nplayers, diggers });
}

async function mainprog() {
  await loadscores();
  const anim = new TitleAnim();
  for (;;) {
    snd.soundstop();
    anim.reset();
    creatembspr();
    scr.clear();
    scr.showTitle();
    outtext('D I G G E R', 100, 0, 3);
    shownplayers();
    showtable();
    input.flags.modechange = false;
    let frame = 0;
    await newframe();
    input.teststart();
    let started = false;
    while (!started) {
      started = input.teststart();
      if (input.flags.modechange) {
        switchnplayers();
        await loadscores(); // Each kind of game has its own high scores
        shownplayers();
        showtable();
        input.flags.modechange = false;
      }
      anim.step(frame);
      await newframe();
      frame++;
      if (frame > TITLE_ANIM_LAST_FRAME) frame = 0;
    }
    anim.reset();
    if (dg.escape) {
      dg.escape = false;
      continue;
    }
    await game();
    dg.escape = false;
  }
}

async function main() {
  await scr.init(document.getElementById('screen'));
  snd.init();
  input.init();
  scr.pal(0);
  nexttick = performance.now();
  await mainprog();
}

main();
